const STORAGE_KEY = 'market-live-state-v3';
const REFRESH_ALARM_NAME = 'market-live-refresh';
const REFRESH_INTERVAL_MINUTES = 1;
const STALE_AFTER_MS = 15 * 60 * 1000;
const BADGE_BG_COLOR = '#d1d0f4';

const WS_URL = 'wss://ws-feed.exchange.coinbase.com';
const WS_BASE_RECONNECT_MS = 1000;
const WS_MAX_RECONNECT_MS = 30000;
const WS_WRITE_THROTTLE_MS = 750;

const PAIR_TO_COINBASE_PRODUCT = {
  BTCUSDT: 'BTC-USD',
  ETHUSDT: 'ETH-USD',
  SOLUSDT: 'SOL-USD',
  XRPUSDT: 'XRP-USD',
};

const PRODUCT_TO_PAIR = Object.fromEntries(
  Object.entries(PAIR_TO_COINBASE_PRODUCT).map(([pair, product]) => [product, pair]),
);

let ws = null;
let wsReconnectTimer = null;
let wsReconnectAttempts = 0;
let wsSessionId = 0;
let streamApplyTimer = null;
let pendingMarkUpdates = {};
let stateCache = null;
let stateQueue = Promise.resolve();

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
  const pairMark = toFiniteNumber(marksByPair?.[position?.pair]);
  if (Number.isFinite(pairMark) && pairMark > 0) {
    return pairMark;
  }

  const fallbackEntry = toFiniteNumber(position?.entryPrice);
  if (Number.isFinite(fallbackEntry) && fallbackEntry > 0) {
    return fallbackEntry;
  }

  return null;
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

function defaultState() {
  return {
    version: 3,
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
  };
}

function deriveState(state, nowTs) {
  const safeState = {
    ...defaultState(),
    ...state,
  };

  const positions = Array.isArray(safeState.positions) ? safeState.positions : [];
  const marksByPair = safeState.marksByPair && typeof safeState.marksByPair === 'object' ? safeState.marksByPair : {};
  const feeRate = toFiniteNumber(safeState.feeRate, 0.0004);
  const initialBalance = toFiniteNumber(safeState.initialBalance, 10000);
  const sessionBalance = toFiniteNumber(safeState.sessionBalance, 0);

  const unrealizedNet = computeUnrealizedNet(positions, marksByPair, feeRate);
  const equity = sessionBalance + unrealizedNet;
  const sessionReturnPct = initialBalance > 0 ? ((equity - initialBalance) / initialBalance) * 100 : 0;

  const lastAppSyncAt = toFiniteNumber(safeState.lastAppSyncAt);
  const isStale = Number.isFinite(lastAppSyncAt) && nowTs - lastAppSyncAt > STALE_AFTER_MS;

  const hasMarks = Object.keys(marksByPair).length > 0;
  const status = isStale ? 'stale' : hasMarks ? 'active' : safeState.status;

  return {
    ...safeState,
    initialBalance,
    sessionBalance,
    feeRate,
    positions,
    marksByPair,
    equity,
    sessionReturnPct,
    status,
    updatedAt: nowTs,
  };
}

async function loadStateFromStorage() {
  const payload = await chrome.storage.local.get(STORAGE_KEY);
  const stored = payload?.[STORAGE_KEY];

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
  const syncedAt = toFiniteNumber(payload.syncedAt, Date.now());

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
        id: typeof position?.id === 'string' && position.id ? position.id : `pos-${index}`,
        pair,
        side,
        qty,
        entryPrice,
        openedAtTs: toFiniteNumber(position?.openedAtTs, null),
      };
    })
    .filter(Boolean);

  return {
    sessionBalance,
    initialBalance,
    feeRate,
    positions,
    syncedAt,
  };
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

function stopCoinbaseSocket() {
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
    startCoinbaseSocket();
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

function startCoinbaseSocket() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  clearReconnectTimer();
  clearStreamApplyTimer();
  pendingMarkUpdates = {};

  closeSocketWithoutReconnect();

  const localSessionId = ++wsSessionId;
  const socket = new WebSocket(WS_URL);
  ws = socket;

  socket.onopen = () => {
    if (localSessionId !== wsSessionId) {
      return;
    }

    wsReconnectAttempts = 0;

    try {
      socket.send(
        JSON.stringify({
          type: 'subscribe',
          product_ids: Object.values(PAIR_TO_COINBASE_PRODUCT),
          channels: ['ticker', 'heartbeat'],
        }),
      );
    } catch {
      try {
        socket.close();
      } catch {
        // Ignore close errors.
      }
    }
  };

  socket.onmessage = (event) => {
    if (localSessionId !== wsSessionId) {
      return;
    }

    try {
      const payload = JSON.parse(event.data);
      if (payload?.type !== 'ticker') {
        return;
      }

      const product = typeof payload?.product_id === 'string' ? payload.product_id : null;
      const pair = product ? PRODUCT_TO_PAIR[product] : null;
      if (!pair) {
        return;
      }

      const markPrice = toFiniteNumber(payload?.price);
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
    } catch {
      // Ignore close errors.
    }
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
  await applyBadgeStyle();
  await initializeStateFromStorage();
  await touchState();
  await ensureAlarm();
  startCoinbaseSocket();
}

chrome.runtime.onInstalled.addListener(() => {
  void bootstrap();
});

chrome.runtime.onStartup.addListener(() => {
  void bootstrap();
});

chrome.runtime.onSuspend.addListener(() => {
  stopCoinbaseSocket();
  stateCache = null;
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === REFRESH_ALARM_NAME) {
    void refreshMarksViaRest();
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

      startCoinbaseSocket();
      const nextState = await refreshMarksViaRest();
      sendResponse({ ok: true, state: nextState });
      return;
    }

    if (type === 'POPUP_OPEN') {
      await ensureAlarm();
      startCoinbaseSocket();
      const nextState = await refreshMarksViaRest();
      sendResponse({ ok: true, state: nextState });
      return;
    }

    if (type === 'FORCE_REFRESH') {
      startCoinbaseSocket();
      const nextState = await refreshMarksViaRest();
      sendResponse({ ok: true, state: nextState });
      return;
    }

    sendResponse({ ok: false, error: 'Unknown message type.' });
  })();

  return true;
});
