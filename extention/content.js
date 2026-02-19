const APP_STORAGE_KEY = 'market-live-session-v1';
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

function getSnapshotSequence(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    return 0;
  }
  const sequence = Number(snapshot.sequence);
  return Number.isFinite(sequence) && sequence > 0 ? sequence : 0;
}

function pickLatestSnapshot(primary, secondary) {
  if (!primary) {
    return secondary ?? null;
  }
  if (!secondary) {
    return primary;
  }
  return getSnapshotSequence(secondary) > getSnapshotSequence(primary) ? secondary : primary;
}

function readSessionSnapshot() {
  try {
    const raw = window.localStorage.getItem(APP_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

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
        id: typeof position?.id === 'string' ? position.id : `pos-${index}`,
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
  const localSnapshot = readSessionSnapshot();
  const snapshot = snapshotOverride ?? pickLatestSnapshot(localSnapshot, lastBridgeSnapshot);
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

  return {
    sessionBalance,
    initialBalance: INITIAL_BALANCE,
    feeRate: FEE_RATE,
    positions: normalizePositions(snapshot.positions),
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

  chrome.runtime.sendMessage(
    {
      type: 'APP_SESSION_SYNC',
      payload,
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
  if (!data || typeof data !== 'object' || data.type !== APP_BRIDGE_TYPE || !data.payload) {
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
  window.addEventListener('storage', (event) => {
    if (event.key === APP_STORAGE_KEY) {
      sendState(true);
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      sendState(true);
    }
  });
}

startSync();
