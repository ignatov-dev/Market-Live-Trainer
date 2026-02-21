const STORAGE_KEY = 'market-live-state-v4';
console.log('[MLT Background] Loaded v4');
const REFRESH_ALARM_NAME = 'market-live-refresh';
const REFRESH_INTERVAL_MINUTES = 1;
const STALE_AFTER_MS = 15 * 60 * 1000;
const BADGE_BG_COLOR = '#d1d0f4';

// Backend Market WS will be used instead of direct Coinbase feed
const WS_BASE_RECONNECT_MS = 1000;
const WS_MAX_RECONNECT_MS = 30000;
const WS_WRITE_THROTTLE_MS = 750;
const BACKEND_REFRESH_THROTTLE_MS = 2000;
const LEVERAGE = 1;

const PAIR_TO_COINBASE_PRODUCT = {
  BTCUSDT: 'BTC-USD',
  ETHUSDT: 'ETH-USD',
  SOLUSDT: 'SOL-USD',
  XRPUSDT: 'XRP-USD',
};

const PRODUCT_TO_PAIR = Object.fromEntries(
  Object.entries(PAIR_TO_COINBASE_PRODUCT).map(([pair, product]) => [product, pair]),
);

const AUTH_COOKIE_NAME = 'mlt_auth_token';
const AUTH_COOKIE_URL = 'https://market-live-trainer-react.onrender.com'; // adjust for production
// const AUTH_COOKIE_URL = 'http://localhost:5173'; // adjust for production
const BACKEND_BASE_URL = 'https://market-live-trainer.onrender.com'; // adjust to match Vite's backendTarget
// const BACKEND_BASE_URL = 'http://localhost:8080'; // adjust to match Vite's backendTarget

let ws = null;
let wsReconnectTimer = null;
let wsReconnectAttempts = 0;
let wsSessionId = 0;
let streamApplyTimer = null;
let pendingMarkUpdates = {};
let stateCache = null;
let stateQueue = Promise.resolve();

let backendAuthToken = null;
let backendWsStructural = null;
let backendWsPnl = null;
let backendWsAccount = null;
let backendWsSessionId = 0;
let backendWsReconnectTimer = null;
let backendWsReconnectAttempts = 0;

let latestOrigin = AUTH_COOKIE_URL;
let backendRefreshTimer = null;
let lastMarketWsMessageAt = 0;

function toFiniteNumber(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function applyBadgeStyle() {
  if (!chrome.action?.setBadgeBackgroundColor) {
    return;
  }
  await chrome.action.setBadgeBackgroundColor({ color: BADGE_BG_COLOR });
}

function normalizeSide(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const safe = value.trim().toLowerCase();
  if (safe === 'long' || safe === 'short') {
    return safe;
  }

  return null;
}

function getMarkForPosition(position, marksByPair) {
  const localPair = position?.pair;
  const product = PAIR_TO_COINBASE_PRODUCT[localPair];

  const directMark = toFiniteNumber(marksByPair?.[localPair]);
  if (Number.isFinite(directMark) && directMark > 0) return directMark;

  const productMark = toFiniteNumber(marksByPair?.[product]);
  if (Number.isFinite(productMark) && productMark > 0) return productMark;

  const fallbackEntry = toFiniteNumber(position?.entryPrice);
  if (Number.isFinite(fallbackEntry) && fallbackEntry > 0) {
    return fallbackEntry;
  }
  return 0;
}

function computeUnrealizedNet(positions, marksByPair, feeRate) {
  if (!Array.isArray(positions) || positions.length === 0) {
    return 0;
  }

  return positions.reduce((sum, position) => {
    const side = normalizeSide(position?.side);
    const qty = toFiniteNumber(position?.qty);
    const entryPrice = toFiniteNumber(position?.entryPrice);
    const markPrice = getMarkForPosition(position, marksByPair);

    if (
      !side ||
      !Number.isFinite(qty) ||
      qty <= 0 ||
      !Number.isFinite(entryPrice) ||
      entryPrice <= 0 ||
      !Number.isFinite(markPrice) ||
      markPrice <= 0
    ) {
      return sum;
    }

    const direction = side === 'long' ? 1 : -1;
    const gross = (markPrice - entryPrice) * qty * direction;
    const estimatedCloseFee = markPrice * qty * feeRate;
    return sum + gross - estimatedCloseFee;
  }, 0);
}

function getOrderNotional(price, qty) {
  const safePrice = Number(price);
  const safeQty = Number(qty);
  if (!Number.isFinite(safePrice) || safePrice <= 0 || !Number.isFinite(safeQty) || safeQty <= 0) {
    return 0;
  }
  return safePrice * safeQty;
}

function getMarginRequirement(notional) {
  const safeNotional = Number(notional);
  if (!Number.isFinite(safeNotional) || safeNotional <= 0) {
    return 0;
  }
  return safeNotional / LEVERAGE;
}

function getUsedMargin(positions, pendingOrders = []) {
  const posMargin = positions.reduce((sum, pos) => {
    const qty = toFiniteNumber(pos.qty || pos.quantity, 0);
    const entry = Number(pos.entryPrice || pos.entry_price || 0);
    return sum + getMarginRequirement(getOrderNotional(entry, qty));
  }, 0);

  const pendMargin = (Array.isArray(pendingOrders) ? pendingOrders : []).reduce((sum, order) => {
    const qty = toFiniteNumber(order.qty, 0);
    const limit = Number(order.limitPrice || order.limit_price || 0);
    return sum + getMarginRequirement(getOrderNotional(limit, qty));
  }, 0);

  return posMargin + pendMargin;
}

function defaultState() {
  return {
    version: 4,
    initialBalance: 10000,
    sessionBalance: 10000,
    feeRate: 0.0004,
    positions: [],
    marksByPair: {},
    equity: 10000,
    sessionReturnPct: 0,
    status: 'idle',
    lastAppSyncAt: null,
    lastPriceSyncAt: null,
    updatedAt: Date.now(),
    // Snapshot fields
    availableMargin: 10000,
    cashBalance: 10000,
    netPnl: 0,
    pendingOrdersCount: 0,
    // new fields
    backendAuth: false,
    backendPositions: [],
    backendPnlByPositionId: {},
    backendAccount: null,
    lastBackendSyncAt: null,
  };
}

function deriveState(state, nowTs) {
  const safeState = {
    ...defaultState(),
    ...state,
  };

  const bridgePositions = Array.isArray(safeState.positions) ? safeState.positions : [];
  const marksByPair = safeState.marksByPair && typeof safeState.marksByPair === 'object' ? safeState.marksByPair : {};
  const feeRate = toFiniteNumber(safeState.feeRate, 0.0004);
  const initialBalance = toFiniteNumber(safeState.initialBalance, 10000);
  const sessionBalance = toFiniteNumber(safeState.sessionBalance, 0);

  const unrealizedNet = computeUnrealizedNet(bridgePositions, marksByPair, feeRate);
  const equity = sessionBalance + unrealizedNet;
  const sessionReturnPct = initialBalance > 0 ? ((equity - initialBalance) / initialBalance) * 100 : 0;

  const lastAppSyncAt = toFiniteNumber(safeState.lastAppSyncAt);
  const isStale = Number.isFinite(lastAppSyncAt) && nowTs - lastAppSyncAt > STALE_AFTER_MS;
  const status = isStale ? 'stale' : (Object.keys(marksByPair).length > 0 ? 'active' : safeState.status);

  const pendingOrders = Array.isArray(safeState.pendingOrders) ? safeState.pendingOrders : [];
  const combinedUsedMargin = getUsedMargin(bridgePositions, pendingOrders);

  return {
    ...safeState,
    initialBalance,
    sessionBalance,
    feeRate,
    positions: bridgePositions,
    pendingOrders,
    marksByPair,
    equity,
    sessionReturnPct,
    status,
    updatedAt: nowTs,
    availableMargin: Math.max(equity - combinedUsedMargin, 0),
    cashBalance: sessionBalance,
    netPnl: equity - initialBalance,
    pendingOrdersCount: pendingOrders.length,
    backendAuth: !!safeState.backendAuth,
    backendPositions: Array.isArray(safeState.backendPositions) ? safeState.backendPositions : [],
    backendPnlByPositionId: safeState.backendPnlByPositionId || {},
    backendAccount: (function () {
      const account = safeState.backendAccount;
      if (!account) return null;

      const pnlMap = safeState.backendPnlByPositionId || {};
      const backendPositions = Array.isArray(safeState.backendPositions) ? safeState.backendPositions : [];
      const openBackendIds = new Set(backendPositions.map((p) => String(p.id || p.positionId)));

      const sumPnl = (field) => Object.entries(pnlMap).reduce((sum, [id, p]) => {
        if (openBackendIds.has(String(id))) {
          return sum + (p[field] || 0);
        }
        return sum;
      }, 0);

      const unrealizedNet = sumPnl('unrealizedNetPnl');
      const unrealizedTotalNet = sumPnl('unrealizedTotalNetPnl');

      const cashBalance = toFiniteNumber(account.cashBalance, 0);
      const accInitialBalance = toFiniteNumber(account.initialBalance, 10000);
      const accEquity = cashBalance + unrealizedNet;
      const accNetPnl = accEquity - accInitialBalance;
      const accReturnPct = accInitialBalance > 0 ? (accNetPnl / accInitialBalance) * 100 : 0;

      return {
        ...account,
        cashBalance,
        initialBalance: accInitialBalance,
        equity: accEquity,
        netPnl: accNetPnl,
        unrealizedTotalNetPnl: unrealizedTotalNet,
        sessionReturnPct: accReturnPct,
        availableMargin: Math.max(accEquity - combinedUsedMargin, 0)
      };
    })(),
    lastBackendSyncAt: safeState.lastBackendSyncAt,
  };
}

async function loadStateFromStorage() {
  console.log('[MLT Background] Loading state from storage...');
  const payload = await chrome.storage.local.get(null);
  console.log('[MLT Background] Current storage keys:', Object.keys(payload));

  let stored = payload?.[STORAGE_KEY];

  // MIGRATION: If v4 is missing but v3 exists, migrate it
  if (!stored && payload?.['market-live-state-v3']) {
    console.log('[MLT Background] Migrating state from v3 to v4');
    stored = payload['market-live-state-v3'];
    // Clean up old key explicitly
    chrome.storage.local.remove('market-live-state-v3', () => {
      console.log('[MLT Background] Old v3 state removed');
    });
  }

  if (!stored || typeof stored !== 'object') {
    return defaultState();
  }

  return deriveState(stored, Date.now());
}

async function ensureStateCache() {
  if (stateCache !== null) {
    return stateCache;
  }

  stateCache = await loadStateFromStorage();
  return stateCache;
}

async function readState() {
  await stateQueue.catch(() => undefined);
  const state = await ensureStateCache();
  return deriveState(state, Date.now());
}

async function writeState(nextStateOrUpdater) {
  stateQueue = stateQueue
    .catch(() => undefined)
    .then(async () => {
      const current = await ensureStateCache();
      const draftState =
        typeof nextStateOrUpdater === 'function' ? nextStateOrUpdater(current) : nextStateOrUpdater;

      if (!draftState || typeof draftState !== 'object') {
        return current;
      }

      const nextState = deriveState(draftState, Date.now());
      stateCache = nextState;
      await chrome.storage.local.set({
        [STORAGE_KEY]: nextState,
      });
      return nextState;
    });

  return stateQueue;
}

function normalizeSessionPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const sessionBalance = toFiniteNumber(payload.sessionBalance);
  const initialBalance = toFiniteNumber(payload.initialBalance, 10000);
  const feeRate = toFiniteNumber(payload.feeRate, 0.0004);
  const pendingOrdersCount = toFiniteNumber(payload.pendingOrdersCount, 0);
  const syncedAt = toFiniteNumber(payload.syncedAt, Date.now());
  const incomingPendingOrders = Array.isArray(payload.pendingOrders) ? payload.pendingOrders : [];

  if (!Number.isFinite(sessionBalance) || !Number.isFinite(initialBalance) || initialBalance <= 0) {
    return null;
  }
  if (!Number.isFinite(feeRate) || feeRate < 0) {
    return null;
  }

  const incomingPositions = Array.isArray(payload.positions) ? payload.positions : [];
  const positions = incomingPositions
    .map((position, index) => {
      const pair = typeof position?.pair === 'string' ? position.pair : null;
      const side = normalizeSide(position?.side);
      const qty = toFiniteNumber(position?.qty);
      const entryPrice = toFiniteNumber(position?.entryPrice);

      if (!PAIR_TO_COINBASE_PRODUCT[pair] || !side || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(entryPrice) || entryPrice <= 0) {
        return null;
      }

      return {
        id: typeof position.id === 'string' ? position.id : String(index),
        pair,
        side,
        qty,
        entryPrice,
        openedAtTs: toFiniteNumber(position.openedAtTs),
      };
    })
    .filter(Boolean);

  const pendingOrders = incomingPendingOrders
    .map((order, index) => {
      const pair = typeof order?.pair === 'string' ? order.pair : null;
      const side = normalizeSide(order?.side);
      const qty = toFiniteNumber(order?.qty);
      const limitPrice = toFiniteNumber(order?.limitPrice);

      if (!PAIR_TO_COINBASE_PRODUCT[pair] || !side || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(limitPrice) || limitPrice <= 0) {
        return null;
      }

      return {
        id: typeof order.id === 'string' ? order.id : String(index),
        pair,
        side,
        qty,
        limitPrice,
        placedAtTs: toFiniteNumber(order.placedAtTs),
      };
    })
    .filter(Boolean);

  return {
    sessionBalance,
    initialBalance,
    feeRate,
    positions,
    pendingOrders,
    pendingOrdersCount,
    syncedAt,
  };
}

async function readAuthCookie() {
  try {
    const url = latestOrigin || AUTH_COOKIE_URL;
    const cookie = await chrome.cookies.get({ url, name: AUTH_COOKIE_NAME });
    if (!cookie || typeof cookie.value !== 'string' || cookie.value.length === 0) {
      return null;
    }
    return decodeURIComponent(cookie.value);
  } catch {
    return null;
  }
}

async function refreshAuthToken() {
  backendAuthToken = await readAuthCookie();
  console.log('[MLT Background] Auth token refreshed:', backendAuthToken ? 'Found' : 'Not found');
  return backendAuthToken;
}

async function backendFetch(path) {
  if (!backendAuthToken) {
    console.log('[MLT Background] backendFetch skipped: no token', path);
    return null;
  }

  const url = `${BACKEND_BASE_URL}${path}`;
  console.log('[MLT Background] Fetching:', url);

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${backendAuthToken}`,
        Accept: 'application/json',
      },
    });

    if (response.status === 401) {
      // Token expired — clear it so popup shows "login required"
      backendAuthToken = null;
      await writeState((state) => ({ ...state, backendAuth: false }));
      return null;
    }

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch {
    return null;
  }
}

async function fetchBackendPositions() {
  const data = await backendFetch('/api/positions?status=open');
  return Array.isArray(data?.data) ? data.data : null;
}

async function fetchBackendAccount() {
  const data = await backendFetch('/api/account');
  return data?.data ?? null;
}

async function refreshBackendData() {
  if (!backendAuthToken) {
    await refreshAuthToken();
  }
  if (!backendAuthToken) {
    // Ensure storage state reflects being logged out
    await writeState((state) => {
      if (!state.backendAuth) return state;
      return {
        ...state,
        backendAuth: false,
        backendPositions: [],
        backendAccount: null,
      };
    });
    return;
  }

  const [positions, account] = await Promise.all([
    fetchBackendPositions(),
    fetchBackendAccount(),
  ]);

  if (positions !== null || account !== null) {
    await writeState((state) => ({
      ...state,
      backendPositions: positions ?? state.backendPositions ?? [],
      backendAccount: account ?? state.backendAccount ?? null,
      backendAuth: true,
      lastBackendSyncAt: Date.now(),
    }));
  }
}

function queueBackendRefresh() {
  if (backendRefreshTimer !== null) {
    return;
  }

  backendRefreshTimer = setTimeout(() => {
    backendRefreshTimer = null;
    void refreshBackendData();
  }, BACKEND_REFRESH_THROTTLE_MS);
}

function buildBackendWsUrl(path) {
  const base = BACKEND_BASE_URL.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
  const tokenPart = backendAuthToken ? `?token=${encodeURIComponent(backendAuthToken)}` : '';
  return `${base}${path}${tokenPart}`;
}

function stopBackendSocket() {
  backendWsSessionId += 1;
  if (backendWsReconnectTimer !== null) {
    clearTimeout(backendWsReconnectTimer);
    backendWsReconnectTimer = null;
  }

  const sockets = [backendWsStructural, backendWsPnl, backendWsAccount];
  backendWsStructural = null;
  backendWsPnl = null;
  backendWsAccount = null;

  for (const s of sockets) {
    if (s) {
      try {
        s.onopen = null;
        s.onmessage = null;
        s.onerror = null;
        s.onclose = null;
        s.close();
      } catch {
        /* ignore */
      }
    }
  }
  backendWsReconnectAttempts = 0;
}

function startBackendSocket() {
  if (!backendAuthToken) return;

  const isAnyConnecting = (s) => s && (s.readyState === WebSocket.OPEN || s.readyState === WebSocket.CONNECTING);
  if (isAnyConnecting(backendWsStructural) && isAnyConnecting(backendWsPnl) && isAnyConnecting(backendWsAccount)) {
    return;
  }

  const localSessionId = ++backendWsSessionId;

  // 1. Structural Channel (/ws)
  if (!isAnyConnecting(backendWsStructural)) {
    const s1 = new WebSocket(buildBackendWsUrl('/ws'));
    backendWsStructural = s1;
    s1.onopen = () => { if (localSessionId === backendWsSessionId) backendWsReconnectAttempts = 0; };
    s1.onmessage = (e) => {
      if (localSessionId !== backendWsSessionId) return;
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'position.created' && msg.position) {
          void writeState((state) => {
            const existing = Array.isArray(state.backendPositions) ? state.backendPositions : [];
            // Avoid duplicates in case REST already synced it
            if (existing.some((p) => p.id === msg.position.id)) return state;
            return { ...state, backendPositions: [...existing, msg.position] };
          });
          queueBackendRefresh();
        } else if (msg.type === 'position.closed' && msg.position) {
          void writeState((state) => {
            const existing = Array.isArray(state.backendPositions) ? state.backendPositions : [];
            const nextPnlMap = { ...(state.backendPnlByPositionId || {}) };
            delete nextPnlMap[msg.position.id];
            return {
              ...state,
              backendPositions: existing.filter((p) => p.id !== msg.position.id),
              backendPnlByPositionId: nextPnlMap,
            };
          });
          queueBackendRefresh();
        }
        // connection.ready and unknown types are intentionally ignored
      } catch {
        // ignore malformed messages
      }
    };
    s1.onclose = () => handleBackendWsClose(localSessionId);
  }

  // 2. PnL Channel (/ws/positions)
  if (!isAnyConnecting(backendWsPnl)) {
    const s2 = new WebSocket(buildBackendWsUrl('/ws/positions'));
    backendWsPnl = s2;
    s2.onmessage = (e) => {
      if (localSessionId !== backendWsSessionId) return;
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'position.pnl' && msg.position) {
          void writeState((state) => {
            const nextPnlMap = { ...(state.backendPnlByPositionId || {}) };
            const p = msg.position;
            nextPnlMap[p.positionId] = {
              unrealizedNetPnl: p.unrealizedNetPnl,
              unrealizedTotalNetPnl: p.unrealizedTotalNetPnl,
              markPrice: p.markPrice
            };
            return { ...state, backendPnlByPositionId: nextPnlMap };
          });
        }
      } catch { }
    };
    s2.onclose = () => handleBackendWsClose(localSessionId);
  }

  // 3. Account Channel (/ws/account)
  if (!isAnyConnecting(backendWsAccount)) {
    const s3 = new WebSocket(buildBackendWsUrl('/ws/account'));
    backendWsAccount = s3;
    s3.onmessage = (e) => {
      if (localSessionId !== backendWsSessionId) return;
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'account.balance' && msg.account) {
          void writeState((state) => ({
            ...state,
            backendAccount: {
              ...(state.backendAccount || {}),
              ...msg.account
            }
          }));
        }
      } catch { }
    };
    s3.onclose = () => handleBackendWsClose(localSessionId);
  }
}

function handleBackendWsClose(localSessionId) {
  if (localSessionId !== backendWsSessionId) return;
  if (backendWsReconnectTimer !== null) return;

  backendWsReconnectAttempts++;
  const delay = Math.min(30000, 1000 * backendWsReconnectAttempts);
  backendWsReconnectTimer = setTimeout(() => {
    backendWsReconnectTimer = null;
    startBackendSocket();
  }, delay);
}

function clearReconnectTimer() {
  if (wsReconnectTimer !== null) {
    clearTimeout(wsReconnectTimer);
    wsReconnectTimer = null;
  }
}

function clearStreamApplyTimer() {
  if (streamApplyTimer !== null) {
    clearTimeout(streamApplyTimer);
    streamApplyTimer = null;
  }
}

function closeSocketWithoutReconnect() {
  if (!ws) {
    return;
  }

  try {
    ws.onopen = null;
    ws.onmessage = null;
    ws.onerror = null;
    ws.onclose = null;
    ws.close();
  } catch {
    // Ignore close errors.
  }

  ws = null;
}

function stopMarketSocket() {
  wsSessionId += 1;
  clearReconnectTimer();
  clearStreamApplyTimer();
  pendingMarkUpdates = {};
  wsReconnectAttempts = 0;
  closeSocketWithoutReconnect();
}

function scheduleSocketReconnect() {
  clearReconnectTimer();
  wsReconnectAttempts += 1;

  const expDelay = WS_BASE_RECONNECT_MS * 2 ** Math.max(0, wsReconnectAttempts - 1);
  const delayMs = Math.min(WS_MAX_RECONNECT_MS, expDelay);

  wsReconnectTimer = setTimeout(() => {
    wsReconnectTimer = null;
    startMarketSocket();
  }, delayMs);
}

async function applyMarkUpdates(markUpdates) {
  await writeState((state) => {
    const nowTs = Date.now();
    const nextMarksByPair = {
      ...(state.marksByPair ?? {}),
    };

    let changed = false;
    for (const [pair, markPrice] of Object.entries(markUpdates)) {
      const safeMark = toFiniteNumber(markPrice);
      if (!Number.isFinite(safeMark) || safeMark <= 0) {
        continue;
      }
      if (nextMarksByPair[pair] === safeMark) {
        continue;
      }

      nextMarksByPair[pair] = safeMark;
      changed = true;
    }

    if (!changed) {
      return state;
    }

    return {
      ...state,
      marksByPair: nextMarksByPair,
      lastPriceSyncAt: nowTs,
      updatedAt: nowTs,
    };
  });
}

function queueMarkUpdate(pair, markPrice) {
  pendingMarkUpdates[pair] = markPrice;

  if (streamApplyTimer !== null) {
    return;
  }

  streamApplyTimer = setTimeout(() => {
    streamApplyTimer = null;

    const batch = pendingMarkUpdates;
    pendingMarkUpdates = {};

    void applyMarkUpdates(batch);
  }, WS_WRITE_THROTTLE_MS);
}

function startMarketSocket() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  clearReconnectTimer();
  clearStreamApplyTimer();
  pendingMarkUpdates = {};

  closeSocketWithoutReconnect();

  const localSessionId = ++wsSessionId;
  const socket = new WebSocket(buildBackendWsUrl('/ws/market'));
  ws = socket;

  socket.onopen = () => {
    if (localSessionId !== wsSessionId) {
      return;
    }
    wsReconnectAttempts = 0;
  };

  socket.onmessage = (event) => {
    if (localSessionId !== wsSessionId) {
      return;
    }
    lastMarketWsMessageAt = Date.now();

    try {
      const payload = JSON.parse(event.data);
      if (payload?.type !== 'market.tick') {
        return;
      }

      const pair = payload.symbol;
      if (!pair) {
        return;
      }

      const markPrice = toFiniteNumber(payload.price);
      if (!Number.isFinite(markPrice) || markPrice <= 0) {
        return;
      }

      queueMarkUpdate(pair, markPrice);
    } catch {
      // Ignore malformed ws payloads.
    }
  };

  socket.onerror = () => {
    if (localSessionId !== wsSessionId) {
      return;
    }

    try {
      socket.close();
    } catch { }
  };

  socket.onclose = () => {
    if (localSessionId !== wsSessionId) {
      return;
    }

    if (ws === socket) {
      ws = null;
    }

    scheduleSocketReconnect();
  };
}

async function refreshMarksViaRest() {
  const entries = Object.entries(PAIR_TO_COINBASE_PRODUCT);
  const updates = {};

  await Promise.all(
    entries.map(async ([pair, product]) => {
      try {
        const response = await fetch(`https://api.exchange.coinbase.com/products/${product}/ticker`, {
          headers: {
            Accept: 'application/json',
          },
        });

        if (!response.ok) {
          return;
        }

        const payload = await response.json();
        const markPrice = toFiniteNumber(payload?.price);
        if (!Number.isFinite(markPrice) || markPrice <= 0) {
          return;
        }

        updates[pair] = markPrice;
      } catch {
        // Ignore per-pair rest failures.
      }
    }),
  );

  if (Object.keys(updates).length === 0) {
    return readState();
  }

  await writeState((state) => ({
    ...state,
    marksByPair: {
      ...(state.marksByPair ?? {}),
      ...updates,
    },
    lastPriceSyncAt: Date.now(),
  }));

  return readState();
}

async function ensureStateReady() {
  await stateQueue.catch(() => undefined);
  await ensureStateCache();
}

async function initializeStateFromStorage() {
  stateCache = await loadStateFromStorage();
}

async function touchState() {
  await writeState((state) => ({
    ...state,
  }));
}

async function updateSessionState(payload) {
  await writeState((state) => ({
    ...state,
    sessionBalance: payload.sessionBalance,
    initialBalance: payload.initialBalance,
    feeRate: payload.feeRate,
    positions: payload.positions,
    pendingOrders: payload.pendingOrders,
    lastAppSyncAt: payload.syncedAt,
    status: 'active',
  }));
}

async function ensureAlarm() {
  const existing = await chrome.alarms.get(REFRESH_ALARM_NAME);
  if (!existing) {
    chrome.alarms.create(REFRESH_ALARM_NAME, {
      periodInMinutes: REFRESH_INTERVAL_MINUTES,
    });
  }
}

async function bootstrap() {
  console.log('[MLT Background] Bootstrapping...');

  // Extra safety check for old state
  chrome.storage.local.get('market-live-state-v3', (res) => {
    if (res['market-live-state-v3']) {
      console.log('[MLT Background] Found legacy v3 state in bootstrap, removing...!');
      chrome.storage.local.remove('market-live-state-v3');
    }
  });

  await applyBadgeStyle();
  await initializeStateFromStorage();
  await touchState();
  await ensureAlarm();
  startMarketSocket();

  // NEW: initialize backend auth and connection
  await refreshAuthToken();
  if (backendAuthToken) {
    console.log('[MLT Background] Starting backend socket and sync...');
    startBackendSocket();
    void refreshBackendData();
  } else {
    console.log('[MLT Background] No backend auth, skipping sync');
  }
}

chrome.runtime.onInstalled.addListener(() => {
  void bootstrap();
});

chrome.runtime.onStartup.addListener(() => {
  void bootstrap();
});

chrome.runtime.onSuspend.addListener(() => {
  stopBackendSocket();
  stopMarketSocket();
  stateCache = null;
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === REFRESH_ALARM_NAME) {
    void refreshMarksViaRest();
    queueBackendRefresh();

    // Detect zombie market socket: appears OPEN but no message received in 90s
    // (Coinbase ticks arrive every ~1s, so 90s silence = definitely dead)
    const marketIsZombie = ws
      && ws.readyState === WebSocket.OPEN
      && lastMarketWsMessageAt > 0
      && Date.now() - lastMarketWsMessageAt > 90_000;

    if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING || marketIsZombie) {
      stopMarketSocket();
      startMarketSocket();
    }

    // Restart backend sockets if they were closed (e.g. service worker was terminated)
    if (backendAuthToken && (!backendWsStructural || backendWsStructural.readyState === WebSocket.CLOSED || backendWsStructural.readyState === WebSocket.CLOSING)) {
      startBackendSocket();
    }
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const type = message?.type;

  void (async () => {
    await applyBadgeStyle();

    if (type === 'APP_SESSION_SYNC') {
      const payload = normalizeSessionPayload(message.payload);
      if (!payload) {
        sendResponse({ ok: false, error: 'Invalid payload.' });
        return;
      }

      await ensureStateReady();
      await updateSessionState(payload);

      // Re-read token in case app just logged in or refreshed JWT
      if (typeof message.token === 'string' && message.token.length > 0) {
        backendAuthToken = message.token;
      } else {
        await refreshAuthToken();
      }

      if (backendAuthToken) {
        startBackendSocket();
        queueBackendRefresh();
      }

      startMarketSocket();
      const nextState = await readState();
      sendResponse({ ok: true, state: nextState });
      return;
    }

    if (type === 'AUTH_REFRESH') {
      if (message.origin) {
        latestOrigin = message.origin;
      }

      if (typeof message.token === 'string' && message.token.length > 0) {
        backendAuthToken = message.token;
      } else {
        await refreshAuthToken();
      }

      if (backendAuthToken) {
        startBackendSocket();
        void refreshBackendData();
        sendResponse({ ok: true });
      } else {
        stopBackendSocket();
        stopMarketSocket();
        // Force clear state if no token
        void writeState((state) => ({
          ...state,
          backendAuth: false,
          backendPositions: [],
          backendAccount: null,
        }));
        sendResponse({ ok: false, error: 'No auth cookie found.' });
      }
      return;
    }

    if (type === 'POPUP_OPEN') {
      await ensureAlarm();

      // If market socket hasn't received a message in 30s it's likely a zombie (after sleep).
      // Force-close everything so startMarketSocket / startBackendSocket create fresh connections.
      const isStale = !lastMarketWsMessageAt || Date.now() - lastMarketWsMessageAt > 30_000;
      if (isStale) {
        stopMarketSocket();
        stopBackendSocket();
      }

      startMarketSocket();
      await refreshAuthToken();
      if (backendAuthToken) {
        startBackendSocket();
        queueBackendRefresh();
      }
      const nextState = await refreshMarksViaRest();
      sendResponse({ ok: true, state: nextState });
      return;
    }

    if (type === 'FORCE_REFRESH') {
      startMarketSocket();
      await refreshAuthToken();
      if (backendAuthToken) {
        startBackendSocket();
        queueBackendRefresh();
      }
      const nextState = await readState();
      sendResponse({ ok: true, state: nextState });
      return;
    }

    sendResponse({ ok: false, error: 'Unknown message type.' });
  })();

  return true;
});
