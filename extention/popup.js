const STORAGE_KEY = 'market-live-state-v3';

const statusEl = document.getElementById('status');
const statsEl = document.getElementById('stats');
const metaEl = document.getElementById('meta');
const sessionReturnEl = document.getElementById('sessionReturn');
const equityEl = document.getElementById('equity');
const positionsSectionEl = document.getElementById('positionsSection');
const positionsListEl = document.getElementById('positionsList');
const updatedAtEl = document.getElementById('updatedAt');

function setText(el, value) {
  if (el) {
    el.textContent = value;
  }
}

function setHidden(el, hidden) {
  if (el) {
    el.hidden = hidden;
  }
}

function showStatus(message) {
  setText(statusEl, message);
  setHidden(statusEl, false);
}

function hideStatus() {
  setHidden(statusEl, true);
}

function fmtSignedPct(value, digits = 2) {
  const safe = Number(value);
  if (!Number.isFinite(safe)) {
    return '-';
  }

  const sign = safe > 0 ? '+' : safe < 0 ? '-' : '';
  return `${sign}${Math.abs(safe).toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}%`;
}

function fmtUsd(value, digits = 2) {
  const safe = Number(value);
  if (!Number.isFinite(safe)) {
    return '-';
  }

  return `$${safe.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

function fmtSignedUsd(value, digits = 2) {
  const safe = Number(value);
  if (!Number.isFinite(safe)) {
    return '-';
  }

  const sign = safe > 0 ? '+' : safe < 0 ? '-' : '';
  return `${sign}${fmtUsd(Math.abs(safe), digits)}`;
}

function signedTone(value) {
  const safe = Number(value);
  if (!Number.isFinite(safe) || safe === 0) {
    return '';
  }

  return safe > 0 ? 'pos' : 'neg';
}

function fmtTime24(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return '-';
  }

  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function getPairBaseSymbol(pair) {
  if (typeof pair !== 'string' || pair.length === 0) {
    return '';
  }

  const knownSuffixes = ['USDT', 'USDC', 'BUSD', 'USD', 'EUR', 'BTC', 'ETH'];
  for (const suffix of knownSuffixes) {
    if (pair.endsWith(suffix) && pair.length > suffix.length) {
      return pair.slice(0, -suffix.length);
    }
  }

  return pair;
}

function computePositionNetPnl(position, marksByPair, feeRate) {
  const markPrice = Number(marksByPair?.[position?.pair]);
  const safeQty = Number(position?.qty);
  const safeEntryPrice = Number(position?.entryPrice);
  const side = typeof position?.side === 'string' ? position.side.trim().toLowerCase() : '';

  if (
    !Number.isFinite(markPrice) ||
    markPrice <= 0 ||
    !Number.isFinite(safeQty) ||
    safeQty <= 0 ||
    !Number.isFinite(safeEntryPrice) ||
    safeEntryPrice <= 0 ||
    (side !== 'long' && side !== 'short')
  ) {
    return null;
  }

  const direction = side === 'long' ? 1 : -1;
  const gross = (markPrice - safeEntryPrice) * safeQty * direction;
  const estimatedCloseFee = markPrice * safeQty * feeRate;
  return gross - estimatedCloseFee;
}

function renderPositions(state) {
  if (!positionsSectionEl || !positionsListEl) {
    return;
  }

  positionsListEl.textContent = '';

  const positions = Array.isArray(state?.positions) ? state.positions : [];
  if (positions.length === 0) {
    setHidden(positionsSectionEl, true);
    return;
  }

  const marksByPair = state?.marksByPair && typeof state.marksByPair === 'object' ? state.marksByPair : {};
  const feeRate = Number.isFinite(Number(state?.feeRate)) ? Number(state.feeRate) : 0.0004;

  const fragment = document.createDocumentFragment();

  positions.forEach((position, index) => {
    const sideRaw = typeof position?.side === 'string' ? position.side.trim().toLowerCase() : '';
    const sideText = sideRaw === 'long' ? 'LONG' : sideRaw === 'short' ? 'SHORT' : '-';
    const sideClass = sideRaw === 'long' || sideRaw === 'short' ? sideRaw : '';
    const baseSymbol = getPairBaseSymbol(position?.pair);

    const qty = Number(position?.qty);
    const qtyText = Number.isFinite(qty)
      ? qty.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 3 })
      : '-';

    const entryPrice = Number(position?.entryPrice);
    const entryText = Number.isFinite(entryPrice) ? fmtUsd(entryPrice) : '-';

    const pnl = computePositionNetPnl(position, marksByPair, feeRate);
    const pnlText = pnl === null ? '-' : fmtSignedUsd(pnl);
    const pnlClass = pnl === null ? '' : signedTone(pnl);

    const cardEl = document.createElement('article');
    cardEl.className = 'position-card';

    const topEl = document.createElement('div');
    topEl.className = 'position-top';

    const sideEl = document.createElement('span');
    sideEl.className = `position-side ${sideClass}`.trim();
    sideEl.textContent = sideText;

    const qtyEl = document.createElement('span');
    qtyEl.className = 'position-qty';
    qtyEl.textContent = baseSymbol ? `${qtyText} ${baseSymbol}` : qtyText;

    topEl.append(sideEl, qtyEl);

    const bottomEl = document.createElement('div');
    bottomEl.className = 'position-bottom';

    const entryEl = document.createElement('span');
    entryEl.className = 'position-entry';
    entryEl.textContent = `Entry ${entryText}`;

    const pnlEl = document.createElement('span');
    pnlEl.className = `position-pnl ${pnlClass}`.trim();
    pnlEl.textContent = pnlText;

    bottomEl.append(entryEl, pnlEl);
    cardEl.append(topEl, bottomEl);
    cardEl.dataset.positionIndex = String(index);

    fragment.appendChild(cardEl);
  });

  positionsListEl.appendChild(fragment);
  setHidden(positionsSectionEl, false);
}

function renderState(state) {
  if (!state || typeof state !== 'object') {
    showStatus('No data yet. Open Market Live Trainer to seed extension state.');
    setHidden(statsEl, true);
    setHidden(metaEl, true);
    setHidden(positionsSectionEl, true);
    return;
  }

  const sessionReturnPct = Number(state.sessionReturnPct);
  const equity = Number(state.equity);
  const initialBalance = Number(state.initialBalance);
  const status = typeof state.status === 'string' ? state.status : 'idle';
  const updatedAt = Number(state.updatedAt);

  setText(sessionReturnEl, fmtSignedPct(sessionReturnPct));
  sessionReturnEl?.classList.remove('pos', 'neg');
  const tone = signedTone(sessionReturnPct);
  if (tone) {
    sessionReturnEl?.classList.add(tone);
  }

  setText(equityEl, fmtUsd(equity));
  equityEl?.classList.remove('pos', 'neg');
  if (Number.isFinite(equity) && Number.isFinite(initialBalance)) {
    const equityDelta = equity - initialBalance;
    const equityTone = signedTone(equityDelta);
    if (equityTone) {
      equityEl?.classList.add(equityTone);
    }
  }

  if (Number.isFinite(updatedAt)) {
    setText(updatedAtEl, `Updated: ${fmtTime24(updatedAt)}`);
  } else {
    setText(updatedAtEl, 'Updated: -');
  }

  renderPositions(state);
  hideStatus();
  setHidden(statsEl, false);
  setHidden(metaEl, false);

  if (status === 'stale') {
    showStatus('State is stale. Open the app to sync session, extension still updates mark prices.');
  }
}

async function getInitialState() {
  const payload = await chrome.storage.local.get(STORAGE_KEY);
  return payload?.[STORAGE_KEY] ?? null;
}

function subscribeToStateChanges() {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') {
      return;
    }

    const stateChange = changes?.[STORAGE_KEY];
    if (!stateChange) {
      return;
    }

    renderState(stateChange.newValue ?? null);
  });
}

async function requestBackgroundRefresh() {
  try {
    await chrome.runtime.sendMessage({ type: 'POPUP_OPEN' });
  } catch {
    // Ignore runtime errors (e.g. extension reloading).
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  showStatus('Loading...');
  subscribeToStateChanges();

  const initialState = await getInitialState();
  renderState(initialState);

  await requestBackgroundRefresh();
});
