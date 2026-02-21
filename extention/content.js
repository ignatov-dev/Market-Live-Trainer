const APP_BRIDGE_TYPE = 'MARKET_LIVE_SESSION_SYNC';
const APP_STATE_SYNC_INTERVAL_MS = 2000;
const APP_STATE_HEARTBEAT_MS = 15000;
const INITIAL_BALANCE = 10000;
const FEE_RATE = 0.0004;

let lastPayloadHash = '';
let lastSentAt = 0;
let syncTimer = null;
let observer = null;
let lastBridgeSnapshot = null;

function normalizePositions(rawPositions) {
  if (!Array.isArray(rawPositions)) {
    return [];
  }

  return rawPositions
    .map((position, index) => {
      const pair = typeof position?.pair === 'string' ? position.pair : '';
      const qty = Number(position?.qty);
      const entryPrice = Number(position?.entryPrice);
      const side = typeof position?.side === 'string' ? position.side.trim().toLowerCase() : '';

      if (
        !pair ||
        !Number.isFinite(qty) ||
        qty <= 0 ||
        !Number.isFinite(entryPrice) ||
        entryPrice <= 0 ||
        (side !== 'long' && side !== 'short')
      ) {
        return null;
      }

      return {
        id: typeof position?.id === 'string' ? position.id : (position?.id ?? `pos-${index}`),
        backendPositionId: position?.backendPositionId || null,
        pair,
        side,
        qty,
        entryPrice,
        openedAtTs: Number.isFinite(Number(position?.openedAtTs)) ? Number(position.openedAtTs) : null,
      };
    })
    .filter(Boolean);
}

function buildPayload(snapshotOverride = null) {
  const snapshot = snapshotOverride ?? lastBridgeSnapshot;
  if (!snapshot) {
    return null;
  }

  if (snapshotOverride && typeof snapshotOverride === 'object') {
    lastBridgeSnapshot = snapshotOverride;
  }

  const sessionBalance = Number(snapshot.balance);
  if (!Number.isFinite(sessionBalance)) {
    return null;
  }

  const pendingOrders = Array.isArray(snapshot.pendingOrders) ? snapshot.pendingOrders : [];
  let pendingMargin = 0;
  for (const order of pendingOrders) {
    const p = Number(order.limitPrice || 0);
    const q = Number(order.qty || 0);
    if (p > 0 && q > 0) {
      pendingMargin += (p * q); // Assume LEVERAGE=1
    }
  }

  return {
    sessionBalance,
    initialBalance: Number.isFinite(Number(snapshot.initialBalance)) ? Number(snapshot.initialBalance) : INITIAL_BALANCE,
    feeRate: Number.isFinite(Number(snapshot.feeRate)) ? Number(snapshot.feeRate) : FEE_RATE,
    positions: normalizePositions(snapshot.positions),
    pendingOrders: Array.isArray(snapshot.pendingOrders) ? snapshot.pendingOrders : [],
    syncedAt: Date.now(),
  };
}

function hashPayload(payload) {
  try {
    return JSON.stringify({
      sessionBalance: payload.sessionBalance,
      initialBalance: payload.initialBalance,
      feeRate: payload.feeRate,
      positions: payload.positions,
      pendingOrders: payload.pendingOrders,
    });
  } catch {
    return '';
  }
}

function sendState(force = false, snapshotOverride = null) {
  const payload = buildPayload(snapshotOverride);
  if (!payload) {
    return;
  }

  const now = Date.now();
  const hash = hashPayload(payload);
  const isChanged = hash !== lastPayloadHash;
  const canHeartbeat = now - lastSentAt >= APP_STATE_HEARTBEAT_MS;

  if (!force && !isChanged && !canHeartbeat) {
    return;
  }

  const match = document.cookie.match(new RegExp('(^| )mlt_auth_token=([^;]+)'));
  const token = match ? decodeURIComponent(match[2]) : null;

  chrome.runtime.sendMessage(
    {
      type: 'APP_SESSION_SYNC',
      payload,
      token,
    },
    () => {
      if (chrome.runtime.lastError) {
        // Retry fast on the next interval when background worker is waking/reloading.
        lastPayloadHash = '';
        return;
      }
      lastPayloadHash = hash;
      lastSentAt = now;
    },
  );
}

function handleBridgeMessage(event) {
  if (event.source && event.source !== window) {
    return;
  }

  const data = event.data;
  if (!data || typeof data !== 'object') {
    return;
  }

  if (data.type === 'MLT_AUTH_CHANGED') {
    let token = data.token;
    if (!token) {
      const match = document.cookie.match(new RegExp('(^| )mlt_auth_token=([^;]+)'));
      token = match ? decodeURIComponent(match[2]) : null;
    }

    chrome.runtime.sendMessage(
      { type: 'AUTH_REFRESH', origin: window.location.origin, token },
      () => {
        void chrome.runtime.lastError;
      },
    );
    return;
  }

  if (data.type !== APP_BRIDGE_TYPE || !data.payload) {
    return;
  }

  if (typeof data.payload === 'object') {
    lastBridgeSnapshot = data.payload;
    sendState(true, data.payload);
  }
}

function startSync() {
  if (syncTimer !== null) {
    return;
  }

  sendState(true);

  const match = document.cookie.match(new RegExp('(^| )mlt_auth_token=([^;]+)'));
  const token = match ? decodeURIComponent(match[2]) : null;

  chrome.runtime.sendMessage(
    { type: 'AUTH_REFRESH', origin: window.location.origin, token },
    () => {
      // Ignore response — background handles it
      void chrome.runtime.lastError;
    },
  );

  syncTimer = window.setInterval(() => {
    sendState(false);
  }, APP_STATE_SYNC_INTERVAL_MS);

  observer = new MutationObserver(() => {
    sendState(false);
  });

  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    characterData: true,
  });

  window.addEventListener('focus', () => sendState(true));
  window.addEventListener('message', handleBridgeMessage);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      sendState(true);
    }
  });
}

startSync();
