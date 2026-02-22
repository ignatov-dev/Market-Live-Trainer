const STORAGE_KEY = 'market-live-state-v4';
const APP_BASE_URL = 'https://market-live-trainer-react.onrender.com';
// const APP_BASE_URL = 'http://localhost:5173';

const PAIR_TO_COINBASE_PRODUCT = {
  BTCUSDT: 'BTC-USD',
  ETHUSDT: 'ETH-USD',
  SOLUSDT: 'SOL-USD',
  XRPUSDT: 'XRP-USD',
};

const statusEl = document.getElementById('status');
const metaEl = document.getElementById('meta');
const updatedAtEl = document.getElementById('updatedAt');
const backendAuthNoticeEl = document.getElementById('backendAuthNotice');
const liveSnapshotEl = document.getElementById('liveSnapshot');
const liveBalanceEl = document.getElementById('liveBalance');
const liveNetPnlEl = document.getElementById('liveNetPnl');
const liveMarginEl = document.getElementById('liveMargin');
const liveCashEl = document.getElementById('liveCash');
const liveOpenPnlEl = document.getElementById('liveOpenPnl');
const liveReturnEl = document.getElementById('liveReturn');
const livePositionsSummaryEl = document.getElementById('livePositionsSummary');
const priceTickerEl = document.getElementById('priceTicker');
const backendPositionsSectionEl = document.getElementById('backendPositionsSection');
const backendPositionsListEl = document.getElementById('backendPositionsList');

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

function toFiniteNumber(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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

  // Handle explicit separators first
  if (pair.includes('-')) return pair.split('-')[0];
  if (pair.includes('/')) return pair.split('/')[0];

  const knownSuffixes = ['USDT', 'USDC', 'BUSD', 'USD', 'EUR', 'BTC', 'ETH'];
  for (const suffix of knownSuffixes) {
    if (pair.endsWith(suffix) && pair.length > suffix.length) {
      return pair.slice(0, -suffix.length);
    }
  }

  return pair;
}

function renderPriceTicker(marksByPair) {
  if (!priceTickerEl) return;

  const pairs = Object.keys(marksByPair || {})
    .filter(p => (p.endsWith('USD') || p.endsWith('USDC')) && !p.endsWith('USDT'))
    .sort();
  if (pairs.length === 0) {
    setHidden(priceTickerEl, true);
    return;
  }

  setHidden(priceTickerEl, false);
  const fragment = document.createDocumentFragment();

  pairs.forEach((pair) => {
    const price = marksByPair[pair];
    const base = getPairBaseSymbol(pair);

    const cardEl = document.createElement('div');
    cardEl.className = 'price-card';

    // Icon
    const iconEl = document.createElement('img');
    iconEl.className = 'price-card-icon';
    iconEl.src = `icons/${base.toLowerCase()}.svg`;
    iconEl.onerror = () => { iconEl.style.display = 'none'; }; // Hide if icon missing

    // Info Container
    const infoEl = document.createElement('div');
    infoEl.className = 'price-card-info';

    const quote = (pair.endsWith('USDC') && !pair.includes('-')) ? 'USDC' : 'USD';
    const symbolEl = document.createElement('span');
    symbolEl.className = 'price-card-symbol';
    symbolEl.textContent = `${base} / ${quote}`;

    const valueEl = document.createElement('span');
    valueEl.className = 'price-card-value';
    valueEl.textContent = fmtUsd(price);

    infoEl.append(symbolEl, valueEl);
    cardEl.append(iconEl, infoEl);

    // Make card clickable
    cardEl.onclick = () => {
      const targetUrl = `${APP_BASE_URL}/${base.toLowerCase()}-${quote.toLowerCase()}`;
      chrome.tabs.query({}, (tabs) => {
        const foundTab = tabs.find(
          t => t.url && (t.url.startsWith(APP_BASE_URL) || t.url.startsWith(APP_BASE_URL.replace('localhost', '127.0.0.1')))
        );
        if (foundTab) {
          // If we have any tab open on the app url, navigate the first one and focus it
          chrome.tabs.update(foundTab.id, { url: targetUrl, active: true });
          chrome.windows.update(foundTab.windowId, { focused: true });
        } else {
          // No tab found, create a new one
          chrome.tabs.create({ url: targetUrl });
        }
      });
    };

    fragment.append(cardEl);
  });

  priceTickerEl.textContent = '';
  priceTickerEl.append(fragment);
}

function renderBackendPositions(state) {
  if (!backendPositionsSectionEl || !backendPositionsListEl) {
    return;
  }

  backendPositionsListEl.textContent = '';

  const positions = Array.isArray(state?.backendPositions) ? state.backendPositions : [];
  if (positions.length === 0) {
    setHidden(backendPositionsSectionEl, true);
    return;
  }

  const marksByPair = state?.marksByPair && typeof state.marksByPair === 'object' ? state.marksByPair : {};

  const fragment = document.createDocumentFragment();

  positions.forEach((position) => {
    const sideRaw = typeof position?.side === 'string' ? position.side.trim().toLowerCase() : '';
    const sideText = sideRaw === 'long' ? 'LONG' : sideRaw === 'short' ? 'SHORT' : '-';
    const sideClass = sideRaw === 'long' || sideRaw === 'short' ? sideRaw : '';
    const pair = position?.symbol || position?.pair;
    const baseSymbol = getPairBaseSymbol(pair);

    // Support both quantity (backend) and qty (local)
    const qty = Number(position?.quantity ?? position?.qty);
    const qtyText = Number.isFinite(qty)
      ? qty.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 3 })
      : '-';

    const entryPrice = Number(position?.entryPrice ?? position?.entry_price);
    const entryText = Number.isFinite(entryPrice) ? fmtUsd(entryPrice) : '-';

    // Prioritize Live WebSocket PnL from state (Total Net includes both fees)
    const pnlMap = state?.backendPnlByPositionId || {};
    const posId = position?.positionId || position?.id;
    let pnl = pnlMap[posId]?.unrealizedTotalNetPnl ?? null;

    // Fallback to manual calculation if mark price is available
    if (pnl === null) {
      // Use the robust mark price lookup (supports XRPUSDT -> XRP-USD mapping)
      const markPrice = getMarkForPosition({ pair, entryPrice: Number(position.entryPrice) }, marksByPair);
      if (Number.isFinite(markPrice) && markPrice > 0 && Number.isFinite(qty) && Number.isFinite(entryPrice)) {
        const direction = sideRaw === 'long' ? 1 : -1;
        const gross = (markPrice - entryPrice) * qty * direction;
        const openFee = entryPrice * qty * 0.0004;
        const closeFee = markPrice * qty * 0.0004;
        pnl = gross - openFee - closeFee;
      }
    }

    const pnlText = pnl === null ? '-' : fmtSignedUsd(pnl);
    const pnlClass = pnl === null ? '' : signedTone(pnl);

    const cardEl = document.createElement('article');
    cardEl.className = 'position-card';

    const iconEl = document.createElement('img');
    iconEl.className = 'position-icon';
    iconEl.src = `icons/${baseSymbol.toLowerCase()}.svg`;
    iconEl.onerror = () => { iconEl.style.display = 'none'; };

    const detailsEl = document.createElement('div');
    detailsEl.className = 'position-details';

    const topEl = document.createElement('div');
    topEl.className = 'position-top';

    const quote = (pair.endsWith('USDC') && !pair.includes('-')) ? 'USDC' : 'USD';
    const pairEl = document.createElement('span');
    pairEl.className = 'position-pair';
    pairEl.textContent = `${baseSymbol} / ${quote}`;

    const qtyEl = document.createElement('span');
    qtyEl.className = 'position-qty';
    qtyEl.textContent = baseSymbol ? `${qtyText} ${baseSymbol}` : qtyText;

    topEl.append(pairEl, qtyEl);

    const bottomEl = document.createElement('div');
    bottomEl.className = 'position-bottom';

    const entryEl = document.createElement('span');
    entryEl.className = `position-entry ${sideClass}`.trim();
    entryEl.textContent = `${sideText} FROM ${entryText}`;

    const pnlEl = document.createElement('span');
    pnlEl.className = `position-pnl ${pnlClass}`.trim();
    pnlEl.textContent = pnlText;

    bottomEl.append(entryEl, pnlEl);
    detailsEl.append(topEl, bottomEl);
    cardEl.append(iconEl, detailsEl);

    fragment.appendChild(cardEl);
  });

  backendPositionsListEl.appendChild(fragment);
  setHidden(backendPositionsSectionEl, false);
}

function renderState(state) {
  if (!state || typeof state !== 'object') {
    showStatus('No data yet. Open Market Live Trainer to seed extension state.');
    setHidden(liveSnapshotEl, true);
    setHidden(metaEl, true);
    setHidden(backendPositionsSectionEl, true);
    return;
  }

  const status = typeof state.status === 'string' ? state.status : 'idle';
  const updatedAt = Number(state.updatedAt);

  if (Number.isFinite(updatedAt)) {
    setText(updatedAtEl, `Updated: ${fmtTime24(updatedAt)}`);
  } else {
    setText(updatedAtEl, 'Updated: -');
  }

  hideStatus();
  setHidden(metaEl, false);

  if (status === 'stale') {
    showStatus('State is stale. Open the app to sync session.');
  }

  // Render backend data
  const backendAuth = !!state.backendAuth;
  const backendAccount = state.backendAccount;

  setHidden(backendAuthNoticeEl, backendAuth);

  if (backendAuth && backendAccount) {
    const equity = Number(backendAccount.equity);
    const netPnl = Number(backendAccount.netPnl);
    const availableMargin = Number(backendAccount.availableMargin);
    const cashBalance = Number(backendAccount.cashBalance);
    const sessionReturnPct = Number(backendAccount.sessionReturnPct);
    const livePositionsCount = Array.isArray(state.backendPositions) ? state.backendPositions.length : 0;

    setText(liveBalanceEl, fmtUsd(equity));
    setText(liveNetPnlEl, fmtSignedUsd(netPnl));
    liveNetPnlEl?.classList.remove('value-pos', 'value-neg');
    const pnlTone = signedTone(netPnl);
    if (pnlTone === 'pos') liveNetPnlEl?.classList.add('value-pos');
    if (pnlTone === 'neg') liveNetPnlEl?.classList.add('value-neg');

    setText(liveMarginEl, fmtUsd(availableMargin));
    setText(liveCashEl, fmtUsd(cashBalance));

    // Aggregate Open PnL (Unrealized)
    const totalOpenPnl = Number(backendAccount.unrealizedTotalNetPnl || 0);
    setText(liveOpenPnlEl, fmtSignedUsd(totalOpenPnl));
    liveOpenPnlEl?.classList.remove('value-pos', 'value-neg');
    const openTone = signedTone(totalOpenPnl);
    if (openTone === 'pos') liveOpenPnlEl?.classList.add('value-pos');
    if (openTone === 'neg') liveOpenPnlEl?.classList.add('value-neg');

    setText(liveReturnEl, fmtSignedPct(sessionReturnPct));
    liveReturnEl?.classList.remove('value-pos', 'value-neg');
    const returnTone = signedTone(sessionReturnPct);
    if (returnTone === 'pos') liveReturnEl?.classList.add('value-pos');
    if (returnTone === 'neg') liveReturnEl?.classList.add('value-neg');

    setHidden(liveSnapshotEl, false);
  } else {
    setHidden(liveSnapshotEl, true);
  }

  renderPriceTicker(state.marksByPair);
  renderBackendPositions(state);
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
