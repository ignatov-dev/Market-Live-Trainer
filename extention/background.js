console.log('[MLT Background] Loaded v5 (no storage)');
const REFRESH_ALARM_NAME = 'market-live-refresh';
const REFRESH_INTERVAL_MINUTES = 1;
const BADGE_BG_COLOR = '#d1d0f4';

// Backend Market WS will be used instead of direct Coinbase feed
const WS_BASE_RECONNECT_MS = 1000;
const WS_MAX_RECONNECT_MS = 30000;
const WS_WRITE_THROTTLE_MS = 750;
const BACKEND_REFRESH_THROTTLE_MS = 2000;

const PAIR_TO_COINBASE_PRODUCT = {
  BTCUSDT: 'BTC-USD',
  ETHUSDT: 'ETH-USD',
  SOLUSDT: 'SOL-USD',
  XRPUSDT: 'XRP-USD',
};

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

// Popup ports for live push updates (no storage involved)
const popupPorts = new Set();

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

function defaultState() {
  return {
    marksByPair: {},
    status: 'idle',
    lastPriceSyncAt: null,
    updatedAt: Date.now(),
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

  const marksByPair =
    safeState.marksByPair && typeof safeState.marksByPair === 'object'
      ? safeState.marksByPair
      : {};
  const status = Object.keys(marksByPair).length > 0 ? 'active' : safeState.status;

  const backendPositions = Array.isArray(safeState.backendPositions)
    ? safeState.backendPositions
    : [];

  const backendAccount = (function () {
    const account = safeState.backendAccount;
    if (!account) return null;

    const pnlMap = safeState.backendPnlByPositionId || {};
    const openBackendIds = new Set(backendPositions.map((p) => String(p.id || p.positionId)));

    const sumPnl = (field) =>
      Object.entries(pnlMap).reduce((sum, [id, p]) => {
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
      // Use backend-provided availableMargin; fall back to equity if absent
      availableMargin: toFiniteNumber(account.availableMargin, Math.max(accEquity, 0)),
    };
  })();

  return {
    ...safeState,
    marksByPair,
    status,
    updatedAt: nowTs,
    backendAuth: !!safeState.backendAuth,
    backendPositions,
    backendPnlByPositionId: safeState.backendPnlByPositionId || {},
    backendAccount,
    lastBackendSyncAt: safeState.lastBackendSyncAt,
  };
}

// ---------------------------------------------------------------------------
// In-memory state management (no chrome.storage involved)
// ---------------------------------------------------------------------------

function initState() {
  if (stateCache === null) {
    stateCache = defaultState();
  }
}

function readState() {
  return deriveState(stateCache || defaultState(), Date.now());
}

function updateState(updaterFn) {
  const current = stateCache || defaultState();
  const draft = typeof updaterFn === 'function' ? updaterFn(current) : updaterFn;
  if (!draft || typeof draft !== 'object') return;
  stateCache = deriveState(draft, Date.now());
  notifyPopups();
}

// ---------------------------------------------------------------------------
// Popup port communication
// ---------------------------------------------------------------------------

function notifyPopups() {
  if (popupPorts.size === 0) return;
  const state = readState();
  for (const port of popupPorts) {
    try {
      port.postMessage({ type: 'STATE_UPDATE', state });
    } catch {
      popupPorts.delete(port);
    }
  }
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'popup') return;
  popupPorts.add(port);
  // Send current state immediately on connect
  try {
    port.postMessage({ type: 'STATE_UPDATE', state: readState() });
  } catch {
    /* ignore */
  }
  port.onDisconnect.addListener(() => popupPorts.delete(port));
});

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Backend REST
// ---------------------------------------------------------------------------

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
      updateState((state) => ({ ...state, backendAuth: false }));
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
    updateState((state) => {
      if (!state.backendAuth) return state;
      return { ...state, backendAuth: false, backendPositions: [], backendAccount: null };
    });
    return;
  }

  const [positions, account] = await Promise.all([
    fetchBackendPositions(),
    fetchBackendAccount(),
  ]);

  if (positions !== null || account !== null) {
    updateState((state) => ({
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

// ---------------------------------------------------------------------------
// Backend WebSocket
// ---------------------------------------------------------------------------

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

  const isAnyConnecting = (s) =>
    s && (s.readyState === WebSocket.OPEN || s.readyState === WebSocket.CONNECTING);
  if (
    isAnyConnecting(backendWsStructural) &&
    isAnyConnecting(backendWsPnl) &&
    isAnyConnecting(backendWsAccount)
  ) {
    return;
  }

  const localSessionId = ++backendWsSessionId;

  // 1. Structural Channel (/ws)
  if (!isAnyConnecting(backendWsStructural)) {
    const s1 = new WebSocket(buildBackendWsUrl('/ws'));
    backendWsStructural = s1;
    s1.onopen = () => {
      if (localSessionId === backendWsSessionId) backendWsReconnectAttempts = 0;
    };
    s1.onmessage = (e) => {
      if (localSessionId !== backendWsSessionId) return;
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'position.created' && msg.position) {
          updateState((state) => {
            const existing = Array.isArray(state.backendPositions) ? state.backendPositions : [];
            if (existing.some((p) => p.id === msg.position.id)) return state;
            return { ...state, backendPositions: [...existing, msg.position] };
          });
          queueBackendRefresh();
        } else if (msg.type === 'position.closed' && msg.position) {
          updateState((state) => {
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
          updateState((state) => {
            const nextPnlMap = { ...(state.backendPnlByPositionId || {}) };
            const p = msg.position;
            nextPnlMap[p.positionId] = {
              unrealizedNetPnl: p.unrealizedNetPnl,
              unrealizedTotalNetPnl: p.unrealizedTotalNetPnl,
              markPrice: p.markPrice,
            };
            return { ...state, backendPnlByPositionId: nextPnlMap };
          });
        }
      } catch {}
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
          updateState((state) => ({
            ...state,
            backendAccount: {
              ...(state.backendAccount || {}),
              ...msg.account,
            },
          }));
        }
      } catch {}
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

// ---------------------------------------------------------------------------
// Market WebSocket
// ---------------------------------------------------------------------------

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

function applyMarkUpdates(markUpdates) {
  const current = stateCache || defaultState();
  const nextMarksByPair = { ...(current.marksByPair ?? {}) };
  let changed = false;

  for (const [pair, markPrice] of Object.entries(markUpdates)) {
    const safeMark = toFiniteNumber(markPrice);
    if (!Number.isFinite(safeMark) || safeMark <= 0) continue;
    if (nextMarksByPair[pair] === safeMark) continue;
    nextMarksByPair[pair] = safeMark;
    changed = true;
  }

  if (!changed) return;

  updateState((state) => ({
    ...state,
    marksByPair: nextMarksByPair,
    lastPriceSyncAt: Date.now(),
  }));
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
    applyMarkUpdates(batch);
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
    } catch {}
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
        const response = await fetch(
          `https://api.exchange.coinbase.com/products/${product}/ticker`,
          { headers: { Accept: 'application/json' } },
        );

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

  if (Object.keys(updates).length > 0) {
    updateState((state) => ({
      ...state,
      marksByPair: {
        ...(state.marksByPair ?? {}),
        ...updates,
      },
      lastPriceSyncAt: Date.now(),
    }));
  }

  return readState();
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
  console.log('[MLT Background] Bootstrapping (v5, no storage)...');

  // Clear any previously persisted storage from older versions
  chrome.storage.local.clear();

  await applyBadgeStyle();
  initState();
  await ensureAlarm();
  startMarketSocket();

  // Initialize backend auth and connection
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
    const marketIsZombie =
      ws &&
      ws.readyState === WebSocket.OPEN &&
      lastMarketWsMessageAt > 0 &&
      Date.now() - lastMarketWsMessageAt > 90_000;

    if (
      !ws ||
      ws.readyState === WebSocket.CLOSED ||
      ws.readyState === WebSocket.CLOSING ||
      marketIsZombie
    ) {
      stopMarketSocket();
      startMarketSocket();
    }

    // Restart backend sockets if they were closed (e.g. service worker was terminated)
    if (
      backendAuthToken &&
      (!backendWsStructural ||
        backendWsStructural.readyState === WebSocket.CLOSED ||
        backendWsStructural.readyState === WebSocket.CLOSING)
    ) {
      startBackendSocket();
    }
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const type = message?.type;

  void (async () => {
    await applyBadgeStyle();

    if (type === 'APP_SESSION_SYNC') {
      // Session data is no longer stored — only use this to refresh auth and ensure sockets run
      if (typeof message.token === 'string' && message.token.length > 0) {
        backendAuthToken = message.token;
      } else {
        await refreshAuthToken();
      }

      if (backendAuthToken) {
        updateState((state) => ({ ...state, backendAuth: true }));
        startBackendSocket();
        queueBackendRefresh();
      }

      startMarketSocket();
      sendResponse({ ok: true, state: readState() });
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
        updateState((state) => ({
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
      const isStale = !lastMarketWsMessageAt || Date.now() - lastMarketWsMessageAt > 30_000;
      if (isStale) {
        stopMarketSocket();
        stopBackendSocket();
      }

      startMarketSocket();
      await refreshAuthToken();
      if (backendAuthToken) {
        startBackendSocket();
        // Fetch backend data immediately so popup shows up-to-date info
        void refreshBackendData();
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
      sendResponse({ ok: true, state: readState() });
      return;
    }

    sendResponse({ ok: false, error: 'Unknown message type.' });
  })();

  return true;
});
