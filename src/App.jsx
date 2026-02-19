import { useEffect, useMemo, useRef, useState } from 'react';
import './styles.css';
import { useLocalStorage } from 'usehooks-ts';
import { motion, useScroll, useSpring, useTransform } from 'framer-motion';
import { FiArrowRight } from 'react-icons/fi';
import { LuRotateCcw } from 'react-icons/lu';
import Tabs from './components/Tabs/Tabs';
import Modal from './components/Modal/Modal';
import BracketField from './components/BracketField/BracketField';

const INITIAL_BALANCE = 10000;
const FEE_RATE = 0.0004;
const LEVERAGE = 1;
const MAX_TIMELINE_ITEMS = 160;
const COINBASE_BATCH_SIZE = 300;
const COINBASE_MAX_REQUESTS = 20;
const MIN_CANDLES_REQUIRED = 80;
const DEFAULT_CHART_VIEW_SIZE = 92;
const MIN_CHART_VIEW_SIZE = 24;
const MAX_CHART_VIEW_SIZE = 1400;
const CHART_ZOOM_SENSITIVITY = 0.0014;
const CHART_PAN_SENSITIVITY = 0.08;
const CHART_RIGHT_GAP_SLOTS = 6;
const CHART_PRICE_SCALE_TEXT_RIGHT_INSET = 4;
const CHART_SCALE_TAG_HEIGHT = 16;
const CHART_SCALE_TAG_GAP = 3;
const CHART_MARKER_DOT_RADIUS = 4;
const CHART_MARKER_STACK_OFFSET = 9;
const CHART_MARKER_POSITIVE_COLOR = '#12b981';
const CHART_MARKER_NEGATIVE_COLOR = '#ef4444';
const CHART_MARKER_OPEN_FILL = 'rgba(223, 235, 255, 0.98)';
const CHART_MARKER_OPEN_STROKE = '#1e3a8a';
const CHART_PAN_TO_LIVE_MIN_MS = 220;
const CHART_PAN_TO_LIVE_MAX_MS = 620;
const NEWS_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const MAX_NEWS_ITEMS = 10;
const ENABLE_PATTERN_NOTIFICATIONS = false;
const MAX_PATTERN_NOTIFICATIONS = 5;
const PATTERN_NOTIFICATION_TTL_MS = 15000;
const PATTERN_SMALL_BODY_RATIO = 0.35;
const PATTERN_DOJI_BODY_RATIO = 0.1;
const PATTERN_LONG_SHADOW_RATIO = 0.55;
const PATTERN_SHORT_SHADOW_RATIO = 0.12;
const PATTERN_BODY_TOP_MIN_RATIO = 0.55;
const PATTERN_BODY_BOTTOM_MAX_RATIO = 0.45;
const PATTERN_DOJI_MIN_SHADOW_RATIO = 0.2;

const TIMEFRAMES = [
  { id: '1m', label: '1M', bucketMs: 60 * 1000, restGranularitySeconds: 60 },
  { id: '15m', label: '15M', bucketMs: 15 * 60 * 1000, restGranularitySeconds: 900 },
  { id: '1h', label: '1H', bucketMs: 60 * 60 * 1000, restGranularitySeconds: 3600 },
  { id: '1d', label: '1D', bucketMs: 24 * 60 * 60 * 1000, restGranularitySeconds: 86400 },
  { id: '1w', label: '1W', bucketMs: 7 * 24 * 60 * 60 * 1000, restGranularitySeconds: 86400 },
];
const ORDER_TYPE_TABS = [
  { value: 'market', label: 'Market' },
  { value: 'limit', label: 'Limit' },
];
const MAX_STORED_CANDLES = 12000;
const SKELETON_CANDLE_COUNT = 72;
const SKELETON_RIGHT_GAP_RATIO = CHART_RIGHT_GAP_SLOTS / (SKELETON_CANDLE_COUNT + CHART_RIGHT_GAP_SLOTS);
const SKELETON_PRICE_LABEL_WIDTHS = [34, 30, 36, 31, 35];
const SKELETON_TIME_LABEL_WIDTHS = [64, 76, 72, 68, 74];
const SKELETON_CANDLE_MODEL = Array.from({ length: SKELETON_CANDLE_COUNT }, (_, index) => {
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const trendWave = Math.sin(index * 0.2) * 18 + Math.sin(index * 0.07 + 0.8) * 9;
  const center = clamp(50 + trendWave, 15, 85);
  const wickSpan = 3 + (Math.sin(index * 0.43 + 1.15) + 1) * 2.4;
  const wickTop = clamp(center - wickSpan, 3, 90);
  const wickBottom = clamp(center + wickSpan, wickTop + 8, 97);

  const bodySpan = 2.8 + (Math.cos(index * 0.37 + 0.2) + 1) * 2.3;
  const bodyCenter = clamp(
    center + Math.sin(index * 0.58 + 0.4) * 1.6,
    wickTop + bodySpan / 2 + 1,
    wickBottom - bodySpan / 2 - 1,
  );
  const bodyTop = clamp(bodyCenter - bodySpan / 2, wickTop + 1, wickBottom - 2.5);
  const bodyBottom = clamp(bodyTop + bodySpan, bodyTop + 1.6, wickBottom - 1);

  return {
    wickTop: Number(wickTop.toFixed(2)),
    wickHeight: Number((wickBottom - wickTop).toFixed(2)),
    bodyTop: Number(bodyTop.toFixed(2)),
    bodyHeight: Number((bodyBottom - bodyTop).toFixed(2)),
    isBull: Math.sin(index * 0.47 + 0.3) >= 0,
  };
});

const PAIRS = [
  {
    id: 'BTCUSDT',
    label: 'BTC / USDT',
    coinbaseProduct: 'BTC-USD',
    coinPaprikaId: 'btc-bitcoin',
  },
  {
    id: 'ETHUSDT',
    label: 'ETH / USDT',
    coinbaseProduct: 'ETH-USD',
    coinPaprikaId: 'eth-ethereum',
  },
  {
    id: 'SOLUSDT',
    label: 'SOL / USDT',
    coinbaseProduct: 'SOL-USD',
    coinPaprikaId: 'sol-solana',
  },
  {
    id: 'XRPUSDT',
    label: 'XRP / USD',
    coinbaseProduct: 'XRP-USD',
    coinPaprikaId: 'xrp-xrp',
  },
];
const PRODUCT_TO_PAIR = Object.fromEntries(PAIRS.map((item) => [item.coinbaseProduct, item.id]));

function getTimeframeById(timeframeId) {
  return TIMEFRAMES.find((item) => item.id === timeframeId) ?? TIMEFRAMES[1];
}

function clampChartViewSize(value) {
  return Math.min(MAX_CHART_VIEW_SIZE, Math.max(MIN_CHART_VIEW_SIZE, value));
}

function easeOutCubic(progress) {
  return 1 - (1 - progress) ** 3;
}

function getBucketStartTs(timestampMs, timeframeId) {
  const safeTs = Number(timestampMs);
  if (!Number.isFinite(safeTs)) {
    return null;
  }

  if (timeframeId === '1w') {
    const date = new Date(safeTs);
    const dayFromMonday = (date.getUTCDay() + 6) % 7;
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() - dayFromMonday);
    return date.getTime();
  }

  const timeframe = getTimeframeById(timeframeId);
  return Math.floor(safeTs / timeframe.bucketMs) * timeframe.bucketMs;
}

function reindexCandles(candles) {
  return candles.map((item, index) => ({
    ...item,
    index,
  }));
}

function aggregateCandlesByTimeframe(candles, timeframeId) {
  if (!Array.isArray(candles) || candles.length === 0) {
    return [];
  }

  const sorted = [...candles].sort((left, right) => left.timestamp - right.timestamp);
  const aggregated = [];

  for (const candle of sorted) {
    const bucketStart = getBucketStartTs(candle.timestamp, timeframeId);
    if (bucketStart === null) {
      continue;
    }

    const prev = aggregated[aggregated.length - 1];
    if (!prev || prev.timestamp !== bucketStart) {
      aggregated.push({
        index: aggregated.length,
        timestamp: bucketStart,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume,
      });
      continue;
    }

    prev.high = Math.max(prev.high, candle.high);
    prev.low = Math.min(prev.low, candle.low);
    prev.close = candle.close;
    prev.volume += candle.volume;
  }

  return aggregated;
}

async function fetchCoinbaseCandles(productId, timeframeId) {
  const timeframe = getTimeframeById(timeframeId);
  const requestGranularitySeconds = timeframe.restGranularitySeconds;
  const candles = [];
  let cursorEndMs = Date.now();

  for (let i = 0; i < COINBASE_MAX_REQUESTS; i += 1) {
    const cursorStartMs = cursorEndMs - COINBASE_BATCH_SIZE * requestGranularitySeconds * 1000;

    const params = new URLSearchParams({
      granularity: String(requestGranularitySeconds),
      start: new Date(cursorStartMs).toISOString(),
      end: new Date(cursorEndMs).toISOString(),
    });

    const response = await fetch(
      `https://api.exchange.coinbase.com/products/${productId}/candles?${params.toString()}`,
      {
        headers: {
          Accept: 'application/json',
        },
      },
    );

    if (!response.ok) {
      throw new Error(`Coinbase HTTP ${response.status}`);
    }

    const payload = await response.json();
    if (!Array.isArray(payload)) {
      throw new Error('Unexpected Coinbase candles response.');
    }

    const batch = payload
      .filter((row) => Array.isArray(row) && row.length >= 6)
      .map((row) => ({
        timestamp: Number(row[0]) * 1000,
        low: Number(row[1]),
        high: Number(row[2]),
        open: Number(row[3]),
        close: Number(row[4]),
        volume: Number(row[5]),
      }))
      .filter(
        (item) =>
          Number.isFinite(item.timestamp) &&
          Number.isFinite(item.low) &&
          Number.isFinite(item.high) &&
          Number.isFinite(item.open) &&
          Number.isFinite(item.close) &&
          Number.isFinite(item.volume),
      );

    if (batch.length === 0) {
      break;
    }

    candles.push(...batch);

    const oldestBatchTs = Math.min(...batch.map((item) => item.timestamp));
    cursorEndMs = oldestBatchTs - 1000;

    if (batch.length < COINBASE_BATCH_SIZE) {
      break;
    }
  }

  candles.sort((left, right) => left.timestamp - right.timestamp);

  const deduped = [];
  for (const candle of candles) {
    const prev = deduped[deduped.length - 1];
    if (prev && prev.timestamp === candle.timestamp) {
      continue;
    }
    deduped.push(candle);
  }

  let normalized = deduped.map((item, index) => ({
    index,
    timestamp: item.timestamp,
    open: item.open,
    high: item.high,
    low: item.low,
    close: item.close,
    volume: item.volume,
  }));

  if (timeframeId === '1w') {
    normalized = aggregateCandlesByTimeframe(normalized, '1w');
  }

  if (normalized.length < MIN_CANDLES_REQUIRED) {
    throw new Error(`Not enough candles returned (${normalized.length}).`);
  }

  return normalized;
}

function sanitizeNewsText(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function clampNewsText(value, maxLength = 240) {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

function normalizeCoinPaprikaEvents(payload) {
  if (!Array.isArray(payload)) {
    return [];
  }

  const normalized = payload
    .map((item, index) => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const title = sanitizeNewsText(item.name || item.title || item.type || '');
      if (!title) {
        return null;
      }

      const summaryRaw = sanitizeNewsText(item.description || item.proof || '');
      const dateString = item.date || item.created_at || item.start_date || '';
      const parsedTs = Date.parse(String(dateString));
      const link = typeof item.link === 'string' && item.link.startsWith('http') ? item.link : null;
      const proofImageLink =
        typeof item.proof_image_link === 'string' && item.proof_image_link.startsWith('http')
          ? item.proof_image_link
          : null;

      return {
        id: String(item.id || `${title}-${index}`),
        title,
        summary: summaryRaw ? clampNewsText(summaryRaw, 220) : 'No extra details provided.',
        timestamp: Number.isFinite(parsedTs) ? parsedTs : 0,
        link,
        proofImageLink,
      };
    })
    .filter((item) => item !== null);

  normalized.sort((left, right) => right.timestamp - left.timestamp);
  return normalized.slice(0, MAX_NEWS_ITEMS);
}

async function fetchCoinPaprikaEvents(coinPaprikaId, signal) {
  const params = new URLSearchParams({
    limit: '30',
  });

  const response = await fetch(`https://api.coinpaprika.com/v1/coins/${coinPaprikaId}/events?${params.toString()}`, {
    headers: {
      Accept: 'application/json',
    },
    signal,
  });

  if (!response.ok) {
    throw new Error(`CoinPaprika HTTP ${response.status}`);
  }

  const payload = await response.json();
  return normalizeCoinPaprikaEvents(payload);
}

function fmtPrice(value) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '-';
  }
  if (value >= 1000) {
    return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  if (value >= 1) {
    return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
  }
  return value.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

function fmtPriceScale(value) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '-';
  }

  if (value >= 1000) {
    return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (value >= 1) {
    return value.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  }
  return value.toLocaleString(undefined, { minimumFractionDigits: 6, maximumFractionDigits: 6 });
}

function fmtSigned(value, digits = 2) {
  const safe = Number(value || 0);
  const abs = Math.abs(safe).toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits });
  return safe >= 0 ? `+$${abs}` : `-$${abs}`;
}

function fmtNumber(value, digits = 2) {
  return Number(value || 0).toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

function fmtPct(value, digits = 2) {
  if (!Number.isFinite(value)) {
    return '-';
  }
  return `${value >= 0 ? '+' : ''}${fmtNumber(value, digits)}%`;
}

function candleLabel(ts) {
  return new Date(ts).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function candleAxisLabel(ts) {
  const date = new Date(ts);
  if (!Number.isFinite(date.getTime())) {
    return '-';
  }

  const day = date.getDate();
  const month = date.toLocaleString([], { month: 'short' });
  const time = date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return `${day} ${month} ${time}`;
}

function candleTooltipLabel(ts) {
  return new Date(ts).toLocaleString([], {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function getPairBaseSymbol(pairId) {
  if (typeof pairId !== 'string' || pairId.length === 0) {
    return '';
  }

  const knownSuffixes = ['USDT', 'USDC', 'BUSD', 'USD', 'EUR', 'BTC', 'ETH'];
  for (const suffix of knownSuffixes) {
    if (pairId.endsWith(suffix) && pairId.length > suffix.length) {
      return pairId.slice(0, -suffix.length);
    }
  }

  return pairId;
}

function getPairCompactLabel(pairId) {
  const label = PAIRS.find((item) => item.id === pairId)?.label ?? pairId;
  return String(label).replace(/\s+/g, '');
}

function describePatternFromRatios({ bodyRatio, upperRatio, lowerRatio, locationRatio }, patternName) {
  const bodyPct = Math.round(bodyRatio * 100);
  const upperPct = Math.round(upperRatio * 100);
  const lowerPct = Math.round(lowerRatio * 100);
  const locationPct = Math.round(locationRatio * 100);

  if (patternName === 'Hammer') {
    return `Body is near top (${locationPct}% of range), lower shadow is ${lowerPct}% and upper shadow is ${upperPct}% of range (body ${bodyPct}%).`;
  }

  if (patternName === 'Shooting Star') {
    return `Body is near bottom (${locationPct}% of range), upper shadow is ${upperPct}% and lower shadow is ${lowerPct}% of range (body ${bodyPct}%).`;
  }

  return `Open and close are very close (body ${bodyPct}% of range), with upper/lower shadows ${upperPct}% and ${lowerPct}%.`;
}

function detectSingleCandlePattern(candle) {
  if (!candle || typeof candle !== 'object') {
    return null;
  }

  const open = Number(candle.open);
  const high = Number(candle.high);
  const low = Number(candle.low);
  const close = Number(candle.close);
  if (![open, high, low, close].every((value) => Number.isFinite(value))) {
    return null;
  }

  const range = high - low;
  if (!Number.isFinite(range) || range <= 0) {
    return null;
  }

  const body = Math.abs(close - open);
  const bodyTop = Math.max(open, close);
  const bodyBottom = Math.min(open, close);
  const upperShadow = Math.max(0, high - bodyTop);
  const lowerShadow = Math.max(0, bodyBottom - low);

  const bodyRatio = body / range;
  const upperRatio = upperShadow / range;
  const lowerRatio = lowerShadow / range;
  const bodyBottomLocation = (bodyBottom - low) / range;
  const bodyTopLocation = (bodyTop - low) / range;

  const hammer =
    bodyRatio <= PATTERN_SMALL_BODY_RATIO &&
    lowerRatio >= PATTERN_LONG_SHADOW_RATIO &&
    upperRatio <= PATTERN_SHORT_SHADOW_RATIO &&
    bodyBottomLocation >= PATTERN_BODY_TOP_MIN_RATIO;
  if (hammer) {
    return {
      patternName: 'Hammer',
      description: describePatternFromRatios(
        { bodyRatio, upperRatio, lowerRatio, locationRatio: bodyBottomLocation },
        'Hammer',
      ),
    };
  }

  const shootingStar =
    bodyRatio <= PATTERN_SMALL_BODY_RATIO &&
    upperRatio >= PATTERN_LONG_SHADOW_RATIO &&
    lowerRatio <= PATTERN_SHORT_SHADOW_RATIO &&
    bodyTopLocation <= PATTERN_BODY_BOTTOM_MAX_RATIO;
  if (shootingStar) {
    return {
      patternName: 'Shooting Star',
      description: describePatternFromRatios(
        { bodyRatio, upperRatio, lowerRatio, locationRatio: bodyTopLocation },
        'Shooting Star',
      ),
    };
  }

  const doji =
    bodyRatio <= PATTERN_DOJI_BODY_RATIO &&
    upperRatio >= PATTERN_DOJI_MIN_SHADOW_RATIO &&
    lowerRatio >= PATTERN_DOJI_MIN_SHADOW_RATIO;
  if (doji) {
    return {
      patternName: 'Doji',
      description: describePatternFromRatios({ bodyRatio, upperRatio, lowerRatio, locationRatio: 0 }, 'Doji'),
    };
  }

  if (close > open) {
    const pctMove = ((close - open) / open) * 100;
    return {
      patternName: 'Reverse',
      description: `Bullish close detected: candle closed above open by ${fmtNumber(pctMove, 2)}%.`,
    };
  }

  return null;
}

function newsTimestampLabel(ts) {
  if (!Number.isFinite(ts) || ts <= 0) {
    return 'Date unavailable';
  }

  return new Date(ts).toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getDirectionMultiplier(side) {
  return side === 'long' ? 1 : -1;
}

function getPositionMarkPrice(position, marksByPair = {}, fallbackPrice = null) {
  const byPair = position?.pair ? Number(marksByPair?.[position.pair]) : Number.NaN;
  if (Number.isFinite(byPair) && byPair > 0) {
    return byPair;
  }

  const safeFallback = Number(fallbackPrice);
  if (Number.isFinite(safeFallback) && safeFallback > 0) {
    return safeFallback;
  }

  const entryPrice = Number(position?.entryPrice);
  if (Number.isFinite(entryPrice) && entryPrice > 0) {
    return entryPrice;
  }

  return null;
}

function getUnrealizedPnl(positions, marksByPair = {}) {
  if (!Array.isArray(positions) || positions.length === 0) {
    return 0;
  }

  return positions.reduce((sum, position) => {
    const markPrice = getPositionMarkPrice(position, marksByPair);
    if (!Number.isFinite(markPrice) || markPrice <= 0) {
      return sum;
    }

    const direction = getDirectionMultiplier(position.side);
    const gross = (markPrice - position.entryPrice) * position.qty * direction;
    const estimatedCloseFee = markPrice * position.qty * FEE_RATE;
    return sum + gross - estimatedCloseFee;
  }, 0);
}

function getEstimatedNetPnl({ side, entryPrice, qty, exitPrice }) {
  const safeExitPrice = Number(exitPrice);
  const safeEntryPrice = Number(entryPrice);
  const safeQty = Number(qty);
  if (
    !Number.isFinite(safeExitPrice) ||
    safeExitPrice <= 0 ||
    !Number.isFinite(safeEntryPrice) ||
    safeEntryPrice <= 0 ||
    !Number.isFinite(safeQty) ||
    safeQty <= 0
  ) {
    return null;
  }

  const direction = getDirectionMultiplier(side);
  const gross = (safeExitPrice - safeEntryPrice) * safeQty * direction;
  const estimatedCloseFee = safeExitPrice * safeQty * FEE_RATE;
  return gross - estimatedCloseFee;
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

function getUsedMargin(session, options = {}) {
  const { excludePendingOrderId = null } = options;

  const positionsMargin = session.positions.reduce(
    (sum, position) => sum + getMarginRequirement(getOrderNotional(position.entryPrice, position.qty)),
    0,
  );

  const pendingMargin = session.pendingOrders.reduce((sum, order) => {
    if (excludePendingOrderId !== null && order.id === excludePendingOrderId) {
      return sum;
    }
    return sum + getMarginRequirement(getOrderNotional(order.limitPrice, order.qty));
  }, 0);

  return positionsMargin + pendingMargin;
}

function validateTicketOrder({ ticket, session, hasCandles, currentPrice, isLoadingData }) {
  const result = {
    marketDataError: null,
    qtyError: null,
    limitPriceError: null,
    marginError: null,
    qty: null,
    limitPrice: null,
    canSubmit: false,
  };

  if (isLoadingData) {
    return result;
  }

  if (!hasCandles || !Number.isFinite(currentPrice) || currentPrice <= 0) {
    result.marketDataError = 'No valid live candle available yet.';
    return result;
  }

  const qty = Number(ticket.qty);
  if (!Number.isFinite(qty) || qty <= 0) {
    return result;
  }
  result.qty = qty;

  let entryPrice = currentPrice;
  if (ticket.type === 'limit') {
    const limitPrice = sanitizePriceInput(ticket.limitPrice);
    if (limitPrice === null) {
      result.limitPriceError = 'Limit price must be a valid positive number.';
      return result;
    }
    result.limitPrice = limitPrice;
    entryPrice = limitPrice;
  }

  const notional = getOrderNotional(entryPrice, qty);
  const requiredMargin = getMarginRequirement(notional);
  const estimatedOpenFee = notional * FEE_RATE;
  const usedMargin = getUsedMargin(session);
  const availableMargin = session.balance - usedMargin;

  if (requiredMargin + estimatedOpenFee > availableMargin + 1e-9) {
    result.marginError = 'Insufficient balance.';
    return result;
  }

  result.canSubmit = true;
  return result;
}

function buildTimelineEvent(index, timestamp, text) {
  return {
    id: `${index}-${timestamp}-${Math.random().toString(36).slice(2, 8)}`,
    index,
    timestamp,
    text,
  };
}

function sanitizePriceInput(value) {
  if (value === '' || value === null || value === undefined) {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function parseOptionalPriceInput(rawValue, label) {
  const normalized = String(rawValue ?? '').trim();
  if (normalized.length === 0) {
    return { value: null, error: null };
  }
  const value = sanitizePriceInput(normalized);
  if (value === null) {
    return { value: null, error: `${label} must be a valid positive number.` };
  }
  return { value, error: null };
}

function defaultTicket(price) {
  const safePrice = Number.isFinite(Number(price)) && Number(price) > 0 ? Number(price) : 1;
  return {
    type: 'market',
    qty: '',
    limitPrice: safePrice.toFixed(2),
    stopLoss: '',
    takeProfit: '',
  };
}

function createSession(candles = []) {
  const hasCandles = Array.isArray(candles) && candles.length > 0;
  const index = hasCandles ? candles.length - 1 : 0;
  const startTs = hasCandles ? candles[index].timestamp : Date.now();
  return {
    replayIndex: index,
    sequence: 1,
    balance: INITIAL_BALANCE,
    positions: [],
    pendingOrders: [],
    closedTrades: [],
    timeline: [buildTimelineEvent(index, startTs, 'Session started with $10,000 virtual balance.')],
    equityHistory: [{ index, equity: INITIAL_BALANCE }],
  };
}

function normalizeStoredOrdersSnapshot(value) {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const balance = Number(value.balance);
  const sequence = Number(value.sequence);
  const positions = Array.isArray(value.positions)
    ? value.positions.filter((item) => typeof item?.pair === 'string' && item.pair.length > 0)
    : [];
  const pendingOrders = Array.isArray(value.pendingOrders)
    ? value.pendingOrders.filter((item) => typeof item?.pair === 'string' && item.pair.length > 0)
    : [];
  const closedTrades = Array.isArray(value.closedTrades)
    ? value.closedTrades.filter((item) => typeof item?.pair === 'string' && item.pair.length > 0)
    : [];

  if (!Number.isFinite(balance) || !Number.isFinite(sequence) || sequence < 1) {
    return null;
  }

  return {
    balance,
    sequence,
    positions,
    pendingOrders,
    closedTrades,
  };
}

function applyLiveTickToCandles(candles, tick, timeframeId) {
  const tradePrice = Number(tick.price);
  const tradeSize = Number(tick.size || 0);
  const tradeTs = Number(tick.timestamp);

  if (!Number.isFinite(tradePrice) || !Number.isFinite(tradeTs)) {
    return candles;
  }

  const timeframe = getTimeframeById(timeframeId);
  const bucketMs = timeframe.bucketMs;
  const bucketStart = getBucketStartTs(tradeTs, timeframeId);
  if (bucketStart === null) {
    return candles;
  }

  if (!Array.isArray(candles) || candles.length === 0) {
    return [
      {
        index: 0,
        timestamp: bucketStart,
        open: tradePrice,
        high: tradePrice,
        low: tradePrice,
        close: tradePrice,
        volume: Number.isFinite(tradeSize) ? tradeSize : 0,
      },
    ];
  }

  const last = candles[candles.length - 1];

  if (bucketStart < last.timestamp) {
    let targetIndex = -1;
    for (let i = candles.length - 1; i >= 0; i -= 1) {
      if (candles[i].timestamp === bucketStart) {
        targetIndex = i;
        break;
      }
      if (candles[i].timestamp < bucketStart) {
        break;
      }
    }

    if (targetIndex === -1) {
      return candles;
    }

    const target = candles[targetIndex];
    const updated = {
      ...target,
      high: Math.max(target.high, tradePrice),
      low: Math.min(target.low, tradePrice),
      close: tradePrice,
      volume: target.volume + (Number.isFinite(tradeSize) ? tradeSize : 0),
    };

    const next = [...candles];
    next[targetIndex] = updated;
    return next;
  }

  if (bucketStart === last.timestamp) {
    const updatedLast = {
      ...last,
      high: Math.max(last.high, tradePrice),
      low: Math.min(last.low, tradePrice),
      close: tradePrice,
      volume: last.volume + (Number.isFinite(tradeSize) ? tradeSize : 0),
    };
    return [...candles.slice(0, -1), updatedLast];
  }

  const next = [...candles];
  let cursorTs = last.timestamp + bucketMs;
  let cursorClose = last.close;

  while (cursorTs < bucketStart) {
    next.push({
      index: next.length,
      timestamp: cursorTs,
      open: cursorClose,
      high: cursorClose,
      low: cursorClose,
      close: cursorClose,
      volume: 0,
    });
    cursorTs += bucketMs;
  }

  const open = cursorClose;
  next.push({
    index: next.length,
    timestamp: bucketStart,
    open,
    high: Math.max(open, tradePrice),
    low: Math.min(open, tradePrice),
    close: tradePrice,
    volume: Number.isFinite(tradeSize) ? tradeSize : 0,
  });

  if (next.length <= MAX_STORED_CANDLES) {
    return next;
  }

  const trimmed = next.slice(next.length - MAX_STORED_CANDLES);
  return reindexCandles(trimmed);
}

function getLatestMarksByPair(datasets) {
  const marks = {};
  for (const pairMeta of PAIRS) {
    const series = Array.isArray(datasets?.[pairMeta.id]) ? datasets[pairMeta.id] : [];
    const lastCandle = series[series.length - 1];
    const mark = Number(lastCandle?.close);
    if (Number.isFinite(mark) && mark > 0) {
      marks[pairMeta.id] = mark;
    }
  }
  return marks;
}

function trimTimeline(timeline) {
  if (timeline.length <= MAX_TIMELINE_ITEMS) {
    return timeline;
  }
  return timeline.slice(timeline.length - MAX_TIMELINE_ITEMS);
}

function appendTimeline(session, event) {
  return {
    ...session,
    timeline: trimTimeline([...session.timeline, event]),
  };
}

function validateBracketPrices(side, entryPrice, stopLoss, takeProfit) {
  if (stopLoss !== null) {
    if (side === 'long' && stopLoss > entryPrice) {
      return 'For long positions, stop-loss cannot be above entry price.';
    }
    if (side === 'short' && stopLoss < entryPrice) {
      return 'For short positions, stop-loss cannot be below entry price.';
    }
  }

  if (takeProfit !== null) {
    if (side === 'long' && takeProfit < entryPrice) {
      return 'For long positions, take-profit cannot be below entry price.';
    }
    if (side === 'short' && takeProfit > entryPrice) {
      return 'For short positions, take-profit cannot be above entry price.';
    }
  }

  return null;
}

function getPlannedRMultiple(side, entryPrice, stopLoss, takeProfit) {
  if (stopLoss === null || takeProfit === null) {
    return null;
  }

  const riskDistance = side === 'long' ? entryPrice - stopLoss : stopLoss - entryPrice;
  const rewardDistance = side === 'long' ? takeProfit - entryPrice : entryPrice - takeProfit;

  if (riskDistance <= 0 || rewardDistance <= 0) {
    return null;
  }

  return rewardDistance / riskDistance;
}

function openPosition(session, candle, order, marksByPair = {}) {
  const side = order.side === 'buy' ? 'long' : 'short';
  const entryPrice = order.entryPrice;
  const qty = Number(order.qty);
  const stopLoss = order.stopLoss;
  const takeProfit = order.takeProfit;
  const pair = typeof order.pair === 'string' && order.pair ? order.pair : null;

  if (!Number.isFinite(qty) || qty <= 0 || !pair) {
    return { session, error: 'Invalid order.' };
  }

  const validationError = validateBracketPrices(side, entryPrice, stopLoss, takeProfit);
  if (validationError) {
    return { session, error: validationError };
  }

  const notional = getOrderNotional(entryPrice, qty);
  const requiredMargin = getMarginRequirement(notional);
  const openFee = notional * FEE_RATE;
  const usedMargin = getUsedMargin(session, {
    excludePendingOrderId: Number.isFinite(Number(order.pendingOrderId)) ? Number(order.pendingOrderId) : null,
  });
  const availableMargin = session.balance - usedMargin;

  if (requiredMargin + openFee > availableMargin + 1e-9) {
    return {
      session,
      error: 'Insufficient balance.',
    };
  }

  const equityBefore = session.balance + getUnrealizedPnl(session.positions, marksByPair);
  const riskAmount = stopLoss === null ? null : Math.abs(entryPrice - stopLoss) * qty;
  const riskPct = riskAmount === null || equityBefore <= 0 ? null : (riskAmount / equityBefore) * 100;
  const plannedR = getPlannedRMultiple(side, entryPrice, stopLoss, takeProfit);

  const position = {
    id: session.sequence,
    pair,
    side,
    qty,
    entryPrice,
    stopLoss,
    takeProfit,
    openedAtIndex: candle.index,
    openedAtTs: candle.timestamp,
    entryType: order.entryType,
    riskAmount,
    riskPct,
    plannedR,
  };

  let next = {
    ...session,
    sequence: session.sequence + 1,
    balance: session.balance - openFee,
    positions: [...session.positions, position],
  };

  const text = `${pair} ${side === 'long' ? 'Long' : 'Short'} opened (${fmtNumber(qty, 3)} @ $${fmtPrice(entryPrice)}) via ${order.entryType}.`;
  next = appendTimeline(next, buildTimelineEvent(candle.index, candle.timestamp, text));

  return { session: next, error: null };
}

function closePosition(session, candle, positionId, reason, forcedPrice = null) {
  const position = session.positions.find((item) => item.id === positionId);
  if (!position) {
    return session;
  }

  const exitPrice = forcedPrice ?? candle.close;
  const direction = getDirectionMultiplier(position.side);
  const pnl = (exitPrice - position.entryPrice) * position.qty * direction;
  const closeFee = exitPrice * position.qty * FEE_RATE;
  const netPnl = pnl - closeFee;

  const updatedPositions = session.positions.filter((item) => item.id !== positionId);
  const risk = position.riskAmount;
  const rMultiple = risk && risk > 0 ? pnl / risk : null;

  const closedTrade = {
    id: session.sequence,
    pair: position.pair,
    side: position.side,
    qty: position.qty,
    entryPrice: position.entryPrice,
    exitPrice,
    openedAtIndex: position.openedAtIndex,
    closedAtIndex: candle.index,
    openedAtTs: position.openedAtTs,
    closedAtTs: candle.timestamp,
    durationCandles: candle.index - position.openedAtIndex,
    reason,
    pnl: netPnl,
    rawPnl: pnl,
    fee: closeFee,
    stopLoss: position.stopLoss,
    takeProfit: position.takeProfit,
    plannedR: position.plannedR,
    rMultiple,
    riskPct: position.riskPct,
  };

  let next = {
    ...session,
    sequence: session.sequence + 1,
    balance: session.balance + netPnl,
    positions: updatedPositions,
    closedTrades: [closedTrade, ...session.closedTrades],
  };

  const text = `${position.pair ?? 'Unknown'} ${position.side === 'long' ? 'Long' : 'Short'} closed @ $${fmtPrice(exitPrice)} (${fmtSigned(netPnl)}), ${reason}.`;
  next = appendTimeline(next, buildTimelineEvent(candle.index, candle.timestamp, text));

  return next;
}

function evaluatePendingOrders(session, candle, pairId, marksByPair = {}) {
  let nextSession = session;
  const remainingOrders = [];
  let hasChanges = false;

  for (const order of session.pendingOrders) {
    if (order.pair !== pairId) {
      remainingOrders.push(order);
      continue;
    }

    const isBuyFill = order.side === 'buy' && candle.low <= order.limitPrice;
    const isSellFill = order.side === 'sell' && candle.high >= order.limitPrice;

    if (isBuyFill || isSellFill) {
      const fill = openPosition(nextSession, candle, {
        pair: order.pair,
        side: order.side,
        qty: order.qty,
        stopLoss: order.stopLoss,
        takeProfit: order.takeProfit,
        entryPrice: order.limitPrice,
        entryType: 'limit',
        pendingOrderId: order.id,
      }, marksByPair);

      if (fill.error) {
        hasChanges = true;
        nextSession = appendTimeline(
          nextSession,
          buildTimelineEvent(candle.index, candle.timestamp, `${order.pair} order #${order.id} rejected on fill: ${fill.error}`),
        );
        continue;
      }

      hasChanges = true;
      nextSession = fill.session;
    } else {
      remainingOrders.push(order);
    }
  }

  if (!hasChanges && remainingOrders.length === session.pendingOrders.length) {
    return session;
  }

  return {
    ...nextSession,
    pendingOrders: remainingOrders,
  };
}

function evaluateRiskExits(session, candle, pairId) {
  let next = session;

  for (const position of session.positions) {
    if (position.pair !== pairId) {
      continue;
    }

    let exitPrice = null;
    let reason = null;

    if (position.side === 'long') {
      const stopHit = position.stopLoss !== null && candle.low <= position.stopLoss;
      const tpHit = position.takeProfit !== null && candle.high >= position.takeProfit;

      if (stopHit && tpHit) {
        exitPrice = position.stopLoss;
        reason = 'stop-loss and take-profit touched in same candle (conservative stop fill)';
      } else if (stopHit) {
        exitPrice = position.stopLoss;
        reason = 'stop-loss hit';
      } else if (tpHit) {
        exitPrice = position.takeProfit;
        reason = 'take-profit hit';
      }
    } else {
      const stopHit = position.stopLoss !== null && candle.high >= position.stopLoss;
      const tpHit = position.takeProfit !== null && candle.low <= position.takeProfit;

      if (stopHit && tpHit) {
        exitPrice = position.stopLoss;
        reason = 'stop-loss and take-profit touched in same candle (conservative stop fill)';
      } else if (stopHit) {
        exitPrice = position.stopLoss;
        reason = 'stop-loss hit';
      } else if (tpHit) {
        exitPrice = position.takeProfit;
        reason = 'take-profit hit';
      }
    }

    if (exitPrice !== null) {
      next = closePosition(next, candle, position.id, reason, exitPrice);
    }
  }

  return next;
}

function getMetrics(session, marksByPair = {}) {
  const unrealized = getUnrealizedPnl(session.positions, marksByPair);
  const equity = session.balance + unrealized;
  const netPnl = equity - INITIAL_BALANCE;

  const wins = session.closedTrades.filter((trade) => trade.pnl > 0);
  const losses = session.closedTrades.filter((trade) => trade.pnl < 0);
  const grossProfit = wins.reduce((sum, trade) => sum + trade.pnl, 0);
  const grossLossAbs = Math.abs(losses.reduce((sum, trade) => sum + trade.pnl, 0));
  const profitFactor = grossLossAbs === 0 ? null : grossProfit / grossLossAbs;
  const winRate = session.closedTrades.length === 0 ? 0 : (wins.length / session.closedTrades.length) * 100;

  const rValues = session.closedTrades.map((trade) => trade.rMultiple).filter((r) => Number.isFinite(r));
  const avgR = rValues.length === 0 ? null : rValues.reduce((sum, value) => sum + value, 0) / rValues.length;

  const avgHold =
    session.closedTrades.length === 0
      ? null
      : session.closedTrades.reduce((sum, trade) => sum + trade.durationCandles, 0) / session.closedTrades.length;

  let peak = session.equityHistory[0]?.equity ?? INITIAL_BALANCE;
  let maxDrawdown = 0;

  for (const point of session.equityHistory) {
    if (point.equity > peak) {
      peak = point.equity;
    }
    const drawdown = peak === 0 ? 0 : ((peak - point.equity) / peak) * 100;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }

  return {
    unrealized,
    equity,
    netPnl,
    grossProfit,
    grossLossAbs,
    profitFactor,
    winRate,
    avgR,
    avgHold,
    maxDrawdown,
  };
}

function getAverageRange(candles, index, window = 14) {
  const start = Math.max(0, index - window);
  const subset = candles.slice(start, index + 1);
  if (subset.length === 0) {
    return 0;
  }
  return subset.reduce((sum, candle) => sum + (candle.high - candle.low), 0) / subset.length;
}

function generateCoachReport(session, candles, metrics) {
  const trades = session.closedTrades;
  if (trades.length < 3) {
    return {
      headline: 'Need More Trades For Reliable Coaching',
      summary:
        'At least 3 closed trades are needed for meaningful behavior analysis. Continue the replay and generate again.',
      mistakes: ['Not enough closed trades to establish repeatable patterns yet.'],
      improvements: ['Run another 30-50 candles and close more positions before reviewing.'],
      score: 50,
    };
  }

  const issues = [];
  const improvements = [];

  const noStopCount = trades.filter((trade) => trade.stopLoss === null).length;
  const noStopRate = noStopCount / trades.length;

  if (noStopRate > 0.35) {
    issues.push(`Stops missing on ${Math.round(noStopRate * 100)}% of trades.`);
    improvements.push('Add a stop-loss to every trade and cap risk at 1-2% of equity.');
  }

  const highRiskCount = trades.filter((trade) => trade.riskPct !== null && trade.riskPct > 2.5).length;
  if (highRiskCount / trades.length > 0.3) {
    issues.push('Position sizing was too aggressive relative to account size.');
    improvements.push('Reduce size when stop distance is wide so per-trade risk stays controlled.');
  }

  const plannedR = trades.map((trade) => trade.plannedR).filter((value) => Number.isFinite(value));
  const avgPlannedR =
    plannedR.length === 0 ? null : plannedR.reduce((sum, value) => sum + value, 0) / plannedR.length;

  if (avgPlannedR !== null && avgPlannedR < 1.25) {
    issues.push(`Average planned reward-to-risk was ${fmtNumber(avgPlannedR, 2)}R, which is too low.`);
    improvements.push('Target setups with minimum 1.5R potential unless conviction is exceptionally high.');
  }

  const chasingCount = trades.reduce((count, trade) => {
    const candle = candles[trade.openedAtIndex];
    if (!candle) {
      return count;
    }

    const range = candle.high - candle.low;
    if (range <= 0) {
      return count;
    }

    const body = Math.abs(candle.close - candle.open);
    const bodyRatio = body / range;
    const avgRange = getAverageRange(candles, trade.openedAtIndex, 14);
    const expansion = avgRange === 0 ? 0 : range / avgRange;

    const buyingBullBreak = trade.side === 'long' && candle.close > candle.open;
    const sellingBearBreak = trade.side === 'short' && candle.close < candle.open;

    if (bodyRatio > 0.62 && expansion > 1.3 && (buyingBullBreak || sellingBearBreak)) {
      return count + 1;
    }

    return count;
  }, 0);

  if (chasingCount / trades.length > 0.35) {
    issues.push('Entries often chased expanded momentum candles.');
    improvements.push('Wait for pullbacks or structure retests before entering after large impulse candles.');
  }

  if (trades.length > Math.max(10, session.replayIndex / 6)) {
    issues.push('Trade frequency was high for the observed market window (overtrading risk).');
    improvements.push('Filter setups more aggressively and avoid back-to-back impulse entries.');
  }

  if (metrics.winRate < 35 && metrics.netPnl < 0) {
    issues.push(`Win rate (${fmtNumber(metrics.winRate, 1)}%) and net PnL are both weak.`);
    improvements.push('Tighten entry criteria and prioritize trades aligned with prevailing trend context.');
  }

  if (issues.length === 0) {
    issues.push('No major behavioral errors detected in this sample.');
    improvements.push('Keep execution consistent and increase sample size before scaling risk.');
  }

  const scorePenalty = issues.length * 8 + Math.max(0, 45 - metrics.winRate) * 0.25 + metrics.maxDrawdown * 0.4;
  const score = Math.max(15, Math.min(95, Math.round(85 - scorePenalty)));

  let headline = 'Balanced Session';
  if (score < 45) {
    headline = 'Risky Session Pattern';
  } else if (score < 65) {
    headline = 'Needs More Discipline';
  } else if (score > 80) {
    headline = 'Strong Session Execution';
  }

  const summary =
    metrics.netPnl >= 0
      ? `Session finished positive with ${fmtSigned(metrics.netPnl)} and max drawdown ${fmtNumber(metrics.maxDrawdown, 2)}%.`
      : `Session finished negative with ${fmtSigned(metrics.netPnl)} and max drawdown ${fmtNumber(metrics.maxDrawdown, 2)}%.`;

  return {
    headline,
    summary,
    mistakes: issues.slice(0, 3),
    improvements: improvements.slice(0, 3),
    score,
  };
}

function drawCandles(
  canvas,
  candles,
  replayIndex,
  positions,
  closedTrades,
  viewSize,
  timeframeId,
  crosshair = null,
  markerHotspotsRef = null,
) {
  if (markerHotspotsRef) {
    markerHotspotsRef.current = [];
  }

  if (!canvas || replayIndex < 1) {
    return;
  }

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(300, Math.floor(rect.width));
  const height = Math.max(220, Math.floor(rect.height));

  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);

  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  ctx.fillStyle = '#f9fbff';
  ctx.fillRect(0, 0, width, height);

  const padding = { top: 20, right: 58, bottom: 52, left: 16 };
  const safeViewSize = Math.max(2, Math.floor(viewSize));
  const start = Math.max(0, replayIndex - safeViewSize + 1);
  const visible = candles.slice(start, replayIndex + 1);

  if (visible.length === 0) {
    return;
  }

  const min = Math.min(...visible.map((item) => item.low));
  const max = Math.max(...visible.map((item) => item.high));
  const range = Math.max(max - min, max * 0.003);
  const yMin = min - range * 0.08;
  const yMax = max + range * 0.08;

  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const yFromPrice = (price) => {
    const ratio = (price - yMin) / (yMax - yMin);
    return padding.top + chartHeight - ratio * chartHeight;
  };

  const xStep = chartWidth / (visible.length + CHART_RIGHT_GAP_SLOTS);
  const bodyWidth = Math.max(2, xStep * 0.62);

  ctx.strokeStyle = '#e3e8f2';
  ctx.lineWidth = 1;

  const yTickCount = 5;
  for (let i = 0; i < yTickCount; i += 1) {
    const y = padding.top + (i / (yTickCount - 1)) * chartHeight;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();
  }

  const priceScaleX = width - padding.right;
  const priceScaleTextX = priceScaleX + CHART_PRICE_SCALE_TEXT_RIGHT_INSET;
  ctx.strokeStyle = '#cfd8e3';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(priceScaleX, padding.top);
  ctx.lineTo(priceScaleX, padding.top + chartHeight);
  ctx.stroke();

  ctx.font = '10px Avenir Next';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < yTickCount; i += 1) {
    const ratio = i / (yTickCount - 1);
    const price = yMax - ratio * (yMax - yMin);
    const y = padding.top + ratio * chartHeight;
    const label = `$${fmtPriceScale(price)}`;
    const labelWidth = ctx.measureText(label).width;

    ctx.fillStyle = 'rgba(249, 251, 255, 0.92)';
    ctx.fillRect(priceScaleTextX - 3, y - 7, labelWidth + 6, 14);

    ctx.fillStyle = '#5f6d82';
    ctx.fillText(label, priceScaleTextX, y);
  }
  ctx.textBaseline = 'alphabetic';

  const tickCount = Math.max(2, Math.min(6, Math.floor(chartWidth / 130)));
  const axisTop = padding.top;
  const axisBottom = padding.top + chartHeight;

  for (let i = 0; i < tickCount; i += 1) {
    const index = Math.round((i * (visible.length - 1)) / Math.max(1, tickCount - 1));
    const candle = visible[index];
    const x = padding.left + index * xStep + xStep / 2;

    ctx.strokeStyle = '#e9edf4';
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(x, axisTop);
    ctx.lineTo(x, axisBottom);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = '#cfd8e3';
    ctx.beginPath();
    ctx.moveTo(x, axisBottom);
    ctx.lineTo(x, axisBottom + 5);
    ctx.stroke();

    ctx.fillStyle = '#5f6d82';
    ctx.font = '10px Avenir Next';
    if (i === 0) {
      ctx.textAlign = 'left';
    } else if (i === tickCount - 1) {
      ctx.textAlign = 'right';
    } else {
      ctx.textAlign = 'center';
    }
    ctx.fillText(candleAxisLabel(candle.timestamp), x, axisBottom + 24);
  }

  visible.forEach((candle, idx) => {
    const x = padding.left + idx * xStep + xStep / 2;
    const openY = yFromPrice(candle.open);
    const closeY = yFromPrice(candle.close);
    const highY = yFromPrice(candle.high);
    const lowY = yFromPrice(candle.low);

    const rising = candle.close >= candle.open;
    ctx.strokeStyle = rising ? '#0f766e' : '#b42318';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, highY);
    ctx.lineTo(x, lowY);
    ctx.stroke();

    const bodyTop = Math.min(openY, closeY);
    const bodyHeight = Math.max(1.2, Math.abs(closeY - openY));
    ctx.fillStyle = rising ? '#12b981' : '#ef4444';
    ctx.fillRect(x - bodyWidth / 2, bodyTop, bodyWidth, bodyHeight);
  });

  const lastActiveCandle = candles[candles.length - 1];
  const lastActivePrice = Number(lastActiveCandle?.close);
  const lastActiveYRaw = yFromPrice(lastActivePrice);
  const plotTop = padding.top;
  const plotBottom = padding.top + chartHeight;
  const lastActiveY = Math.max(plotTop, Math.min(plotBottom, lastActiveYRaw));
  const lastActiveIsVisible =
    Number.isFinite(lastActiveCandle?.index) &&
    lastActiveCandle.index >= start &&
    lastActiveCandle.index <= replayIndex;
  const lastActiveX = lastActiveIsVisible
    ? padding.left + (lastActiveCandle.index - start) * xStep + xStep / 2
    : padding.left;
  const activePriceScaleAnchorX = priceScaleX;

  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = '#1d4ed8';
  ctx.beginPath();
  ctx.moveTo(activePriceScaleAnchorX, lastActiveY);
  ctx.lineTo(lastActiveX, lastActiveY);
  ctx.stroke();
  ctx.setLineDash([]);

  const latestLabel = `$${fmtPriceScale(lastActivePrice)}`;
  const latestLabelY = Math.max(padding.top + 8, Math.min(padding.top + chartHeight - 8, lastActiveY));
  const latestLabelWidth = ctx.measureText(latestLabel).width;

  const openScaleEntries = positions
    .map((position) => ({
      side: position.side,
      price: Number(position.entryPrice),
    }))
    .filter(
      (item) =>
        (item.side === 'long' || item.side === 'short') && Number.isFinite(item.price) && item.price > 0,
    )
    .map((item) => ({
      ...item,
      targetY: Math.max(plotTop, Math.min(plotBottom, yFromPrice(item.price))),
      y: 0,
    }))
    .sort((left, right) => left.targetY - right.targetY);

  const labelHalfHeight = CHART_SCALE_TAG_HEIGHT / 2;
  const minTagCenterY = plotTop + labelHalfHeight;
  const maxTagCenterY = plotBottom - labelHalfHeight;
  for (let i = 0; i < openScaleEntries.length; i += 1) {
    const previous = openScaleEntries[i - 1];
    let y = Math.max(minTagCenterY, Math.min(maxTagCenterY, openScaleEntries[i].targetY));
    if (previous) {
      y = Math.max(y, previous.y + CHART_SCALE_TAG_HEIGHT + CHART_SCALE_TAG_GAP);
    }
    openScaleEntries[i].y = y;
  }

  if (openScaleEntries.length > 0) {
    const overflow = openScaleEntries[openScaleEntries.length - 1].y - maxTagCenterY;
    if (overflow > 0) {
      for (const item of openScaleEntries) {
        item.y -= overflow;
      }
    }
  }

  ctx.font = '11px Avenir Next';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  for (const item of openScaleEntries) {
    const label = `$${fmtPriceScale(item.price)}`;
    const labelWidth = ctx.measureText(label).width;
    const chipX = priceScaleTextX - 4;
    const chipY = item.y - labelHalfHeight;

    ctx.fillStyle = item.side === 'long' ? 'rgba(16, 129, 81, 0.3)' : 'rgba(191, 35, 61, 0.3)';
    ctx.fillRect(chipX, chipY, labelWidth + 8, CHART_SCALE_TAG_HEIGHT);
    ctx.fillStyle = item.side === 'long' ? '#0f5132' : '#7f1d2d';
    ctx.fillText(label, priceScaleTextX, item.y);
  }
  ctx.textBaseline = 'alphabetic';

  const resolveMarkerIndex = (fallbackIndex, markerTimestamp) => {
    const ts = Number(markerTimestamp);
    if (Number.isFinite(ts) && candles.length > 0) {
      const bucketTs = getBucketStartTs(ts, timeframeId);
      const targetTs = Number.isFinite(bucketTs) ? bucketTs : ts;
      let left = 0;
      let right = candles.length - 1;
      let match = -1;

      while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        if (candles[mid].timestamp <= targetTs) {
          match = mid;
          left = mid + 1;
        } else {
          right = mid - 1;
        }
      }

      if (match >= 0) {
        return match;
      }

      return null;
    }

    if (Number.isFinite(fallbackIndex)) {
      return Math.max(0, Math.min(Number(fallbackIndex), candles.length - 1));
    }

    return null;
  };

  const markers = [];
  for (const position of positions) {
    const markerIndex = resolveMarkerIndex(position.openedAtIndex, position.openedAtTs);
    if (!Number.isFinite(markerIndex)) {
      continue;
    }

    markers.push({
      id: `open-${position.id}`,
      index: markerIndex,
      groupType: 'open',
      color: CHART_MARKER_OPEN_FILL,
      title: `Open ${position.side === 'long' ? 'Long' : 'Short'}`,
      lines: [
        { label: 'Opened', value: candleTooltipLabel(position.openedAtTs) },
        { label: 'Qty', value: fmtNumber(position.qty, 3) },
        { label: 'Entry', value: `$${fmtPrice(position.entryPrice)}` },
      ],
    });
  }

  for (const trade of closedTrades.slice(0, 30)) {
    const markerIndex = resolveMarkerIndex(trade.closedAtIndex, trade.closedAtTs);
    if (!Number.isFinite(markerIndex)) {
      continue;
    }

    const closedLines = [
      { label: 'Opened', value: candleTooltipLabel(trade.openedAtTs) },
      { label: 'Closed', value: candleTooltipLabel(trade.closedAtTs) },
      { label: 'Exit', value: `$${fmtPrice(trade.exitPrice)}` },
      { label: 'PnL', value: fmtSigned(trade.pnl) },
    ];
    const safeReason = typeof trade.reason === 'string' ? trade.reason.trim() : '';
    if (safeReason && safeReason.toLowerCase() !== 'manual close') {
      closedLines.push({ label: 'Reason', value: safeReason });
    }

    markers.push({
      id: `closed-${trade.id}`,
      index: markerIndex,
      groupType: 'closed',
      sideGroup: trade.side,
      color: trade.side === 'long' ? CHART_MARKER_POSITIVE_COLOR : CHART_MARKER_NEGATIVE_COLOR,
      title: `Closed ${trade.side === 'long' ? 'Long' : 'Short'}`,
      lines: closedLines,
    });
  }

  const groupedMarkersByKey = new Map();
  for (const marker of markers) {
    const relative = marker.index - start;
    if (relative < 0 || relative >= visible.length) {
      continue;
    }

    const isOpenGroup = marker.groupType === 'open';
    const sideGroup = marker.sideGroup === 'long' ? 'long' : 'short';
    const groupKind = isOpenGroup ? 'open' : sideGroup;
    const groupKey = `${relative}:${groupKind}`;
    const existing = groupedMarkersByKey.get(groupKey);
    if (existing) {
      existing.items.push({
        id: marker.id,
        title: marker.title,
        lines: marker.lines,
      });
      continue;
    }

    groupedMarkersByKey.set(groupKey, {
      id: groupKey,
      relative,
      kind: groupKind,
      color: marker.color,
      sortOrder: isOpenGroup ? 0 : sideGroup === 'long' ? 1 : 2,
      items: [
        {
          id: marker.id,
          title: marker.title,
          lines: marker.lines,
        },
      ],
    });
  }

  const groupedMarkers = [...groupedMarkersByKey.values()].sort((left, right) => {
    if (left.relative !== right.relative) {
      return left.relative - right.relative;
    }
    if (left.sortOrder === right.sortOrder) {
      return 0;
    }
    return left.sortOrder - right.sortOrder;
  });

  const markerHotspots = [];
  const markerStacks = new Map();
  const markerBaseY = axisBottom - 7;
  for (const group of groupedMarkers) {
    const stackIndex = markerStacks.get(group.relative) ?? 0;
    markerStacks.set(group.relative, stackIndex + 1);

    const x = padding.left + group.relative * xStep + xStep / 2;
    const y = Math.max(axisTop + 8, markerBaseY - stackIndex * CHART_MARKER_STACK_OFFSET);
    ctx.fillStyle = group.color;
    ctx.beginPath();
    ctx.arc(x, y, CHART_MARKER_DOT_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    if (group.kind === 'open') {
      ctx.strokeStyle = CHART_MARKER_OPEN_STROKE;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    markerHotspots.push({
      id: group.id,
      x,
      y,
      radius: CHART_MARKER_DOT_RADIUS + 4,
      title:
        group.kind === 'open'
          ? `${group.items.length} Open position${group.items.length > 1 ? 's' : ''}`
          : `${group.items.length} ${group.kind === 'long' ? 'Long' : 'Short'} trade${group.items.length > 1 ? 's' : ''}`,
      entries: group.items,
    });
  }

  if (markerHotspotsRef) {
    markerHotspotsRef.current = markerHotspots;
  }

  if (crosshair && Number.isFinite(crosshair.x) && Number.isFinite(crosshair.y)) {
    const plotLeft = padding.left;
    const plotRight = width - padding.right;
    const plotTop = padding.top;
    const plotBottom = padding.top + chartHeight;
    const crosshairX = Math.max(plotLeft, Math.min(crosshair.x, plotRight));
    const crosshairY = Math.max(plotTop, Math.min(crosshair.y, plotBottom));
    const crosshairPrice = yMax - ((crosshairY - plotTop) / chartHeight) * (yMax - yMin);

    ctx.save();
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = 'rgba(72, 91, 121, 0.62)';
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.moveTo(plotLeft, crosshairY);
    ctx.lineTo(plotRight, crosshairY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(crosshairX, plotTop);
    ctx.lineTo(crosshairX, plotBottom);
    ctx.stroke();
    ctx.restore();

    const crosshairLabel = `$${fmtPriceScale(crosshairPrice)}`;
    ctx.font = '10px Avenir Next';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const crosshairLabelWidth = ctx.measureText(crosshairLabel).width;
    const crosshairLabelX = priceScaleTextX - 3;
    const crosshairLabelY = Math.max(plotTop + 8, Math.min(plotBottom - 8, crosshairY));
    ctx.fillStyle = 'rgba(255, 255, 255, 0.98)';
    ctx.fillRect(crosshairLabelX, crosshairLabelY - 8, crosshairLabelWidth + 6, 16);
    ctx.strokeStyle = 'rgba(72, 91, 121, 0.42)';
    ctx.lineWidth = 1;
    ctx.strokeRect(crosshairLabelX, crosshairLabelY - 8, crosshairLabelWidth + 6, 16);
    ctx.fillStyle = '#334155';
    ctx.fillText(crosshairLabel, priceScaleTextX, crosshairLabelY);

    const crosshairRelativeIndex = Math.round((crosshairX - padding.left - xStep / 2) / xStep);
    const safeCrosshairIndex = Math.max(0, Math.min(visible.length - 1, crosshairRelativeIndex));
    const crosshairCandle = visible[safeCrosshairIndex];
    if (crosshairCandle) {
      const crosshairTimeLabel = candleAxisLabel(crosshairCandle.timestamp);
      ctx.font = '10px Avenir Next';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const timeLabelWidth = ctx.measureText(crosshairTimeLabel).width;
      const timeChipWidth = timeLabelWidth + 10;
      const timeChipHalfWidth = timeChipWidth / 2;
      const timeChipCenterX = Math.max(
        padding.left + timeChipHalfWidth,
        Math.min(width - padding.right - timeChipHalfWidth, crosshairX),
      );
      const timeChipY = axisBottom + 24;

      ctx.fillStyle = 'rgba(255, 255, 255, 0.98)';
      ctx.fillRect(timeChipCenterX - timeChipHalfWidth, timeChipY - 8, timeChipWidth, 16);
      ctx.strokeStyle = 'rgba(72, 91, 121, 0.42)';
      ctx.lineWidth = 1;
      ctx.strokeRect(timeChipCenterX - timeChipHalfWidth, timeChipY - 8, timeChipWidth, 16);
      ctx.fillStyle = '#334155';
      ctx.fillText(crosshairTimeLabel, timeChipCenterX, timeChipY);
    }
    ctx.textBaseline = 'alphabetic';
  }

  ctx.font = '10px Avenir Next';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(223, 235, 255, 0.98)';
  ctx.fillRect(priceScaleTextX - 3, latestLabelY - 8, latestLabelWidth + 6, 16);
  ctx.strokeStyle = 'rgba(29, 78, 216, 0.38)';
  ctx.lineWidth = 1;
  ctx.strokeRect(priceScaleTextX - 3, latestLabelY - 8, latestLabelWidth + 6, 16);
  ctx.fillStyle = '#1e3a8a';
  ctx.fillText(latestLabel, priceScaleTextX, latestLabelY);
  ctx.textBaseline = 'alphabetic';
}

function drawEquityCurve(canvas, equityHistory) {
  if (!canvas || equityHistory.length < 2) {
    return;
  }

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(280, Math.floor(rect.width));
  const height = Math.max(100, Math.floor(rect.height));

  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);

  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  ctx.fillStyle = '#f9fbff';
  ctx.fillRect(0, 0, width, height);

  const padding = 10;
  const values = equityHistory.map((point) => point.equity);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 1);

  const xFrom = (i) => padding + (i / (equityHistory.length - 1)) * (width - padding * 2);
  const yFrom = (value) => padding + (1 - (value - min) / span) * (height - padding * 2);

  ctx.strokeStyle = '#bae6fd';
  ctx.lineWidth = 1;
  for (let i = 0; i < 3; i += 1) {
    const y = padding + (i / 2) * (height - padding * 2);
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(width - padding, y);
    ctx.stroke();
  }

  ctx.beginPath();
  equityHistory.forEach((point, index) => {
    const x = xFrom(index);
    const y = yFrom(point.equity);
    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });

  const isPositive = values[values.length - 1] >= values[0];
  ctx.strokeStyle = isPositive ? '#0ea5e9' : '#ef4444';
  ctx.lineWidth = 2;
  ctx.stroke();
}

function MetricCard({ label, value, isPositive = null }) {
  const className =
    isPositive === null ? 'metric-value' : isPositive ? 'metric-value pos' : 'metric-value neg';

  return (
    <div className="metric">
      <p className="metric-label">{label}</p>
      <p className={className}>{value}</p>
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="chart-skeleton" aria-hidden="true">
      <div className="chart-skeleton-grid" />
      <div className="chart-skeleton-price-axis" />
      <div className="chart-skeleton-price-labels">
        {SKELETON_PRICE_LABEL_WIDTHS.map((width, index) => (
          <span key={`skeleton-price-${width}-${index}`} style={{ width }} />
        ))}
      </div>
      <div
        className="chart-skeleton-candles"
        style={{
          '--skeleton-gap-right': `${SKELETON_RIGHT_GAP_RATIO * 100}%`,
        }}
      >
        {SKELETON_CANDLE_MODEL.map((item, index) => (
          <span
            key={`skeleton-candle-${index}`}
            className={`chart-skeleton-candle${item.isBull ? ' is-bull' : ' is-bear'}`}
            style={{
              '--wick-top': `${item.wickTop}%`,
              '--wick-height': `${item.wickHeight}%`,
              '--body-top': `${item.bodyTop}%`,
              '--body-height': `${item.bodyHeight}%`,
              animationDelay: `${index * 22}ms`,
            }}
          >
            <span className="chart-skeleton-wick" />
            <span className="chart-skeleton-body" />
          </span>
        ))}
      </div>
      <div className="chart-skeleton-time-axis">
        {SKELETON_TIME_LABEL_WIDTHS.map((width, index) => (
          <span key={`skeleton-time-${width}-${index}`} style={{ width }} />
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const coinbaseCacheRef = useRef({});
  const newsCacheRef = useRef({});
  const lastPersistedPayloadRef = useRef('');
  const [pair, setPair] = useState(PAIRS[0].id);
  const [timeframeId, setTimeframeId] = useState(TIMEFRAMES[1].id);
  const [datasets, setDatasets] = useState({});
  const [newsByPair, setNewsByPair] = useState({});
  const [storedSession, setStoredSession, removeStoredSession] = useLocalStorage('market-live-session-v1', null);
  const [datasetRevision, setDatasetRevision] = useState(0);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [isLoadingNews, setIsLoadingNews] = useState(false);
  const [newsStatus, setNewsStatus] = useState('');
  const [resizeToken, setResizeToken] = useState(0);
  const pairMeta = PAIRS.find((item) => item.id === pair) ?? PAIRS[0];
  const timeframe = getTimeframeById(timeframeId);
  const candles = datasets[pair] ?? [];
  const newsItems = newsByPair[pair] ?? [];
  const hasCandles = candles.length > 0;
  const [session, setSession] = useState(() => {
    const restored = normalizeStoredOrdersSnapshot(storedSession);
    if (!restored) {
      return createSession();
    }

    const fresh = createSession();
    fresh.balance = restored.balance;
    fresh.sequence = Math.max(1, restored.sequence);
    fresh.positions = restored.positions;
    fresh.pendingOrders = restored.pendingOrders;
    fresh.closedTrades = restored.closedTrades;
    fresh.timeline = [
      buildTimelineEvent(
        fresh.replayIndex,
        Date.now(),
        `Session restored from local storage (${restored.positions.length} open, ${restored.pendingOrders.length} pending).`,
      ),
    ];
    fresh.equityHistory = [{ index: fresh.replayIndex, equity: restored.balance }];
    return fresh;
  });
  const [ticket, setTicket] = useState(() => defaultTicket(candles[candles.length - 1]?.close));
  const [ticketPreviewSide, setTicketPreviewSide] = useState('buy');
  const [coachReport, setCoachReport] = useState(null);
  const [patternNotifications, setPatternNotifications] = useState([]);
  const [chartMarkerTooltip, setChartMarkerTooltip] = useState(null);
  const [chartViewSize, setChartViewSize] = useState(DEFAULT_CHART_VIEW_SIZE);
  const [chartEndIndex, setChartEndIndex] = useState(null);
  const [positionBracketEditor, setPositionBracketEditor] = useState({
    isOpen: false,
    positionId: null,
    stopLoss: '',
    takeProfit: '',
    error: '',
  });

  const chartWrapRef = useRef(null);
  const chartRef = useRef(null);
  const equityRef = useRef(null);
  const chartPanAnimationRef = useRef(null);
  const chartCrosshairRef = useRef(null);
  const chartMarkerHotspotsRef = useRef([]);
  const chartHoveredMarkerIdRef = useRef(null);
  const chartHoverRedrawRafRef = useRef(null);
  const chartDrawStateRef = useRef({
    candles: [],
    replayIndex: 0,
    positions: [],
    closedTrades: [],
    viewSize: DEFAULT_CHART_VIEW_SIZE,
    timeframeId: TIMEFRAMES[1].id,
  });
  const patternNotificationTimersRef = useRef(new Map());
  const processedPatternCandleTsRef = useRef({});
  const processedSessionCandleTsRef = useRef({});

  const fallbackCandle = useMemo(
    () => ({ index: 0, timestamp: Date.now(), open: null, high: null, low: null, close: null, volume: 0 }),
    [],
  );
  const safeReplayIndex = hasCandles ? Math.max(0, Math.min(session.replayIndex, candles.length - 1)) : 0;
  const liveReplayIndex = hasCandles ? candles.length - 1 : 0;
  const chartReplayIndex = hasCandles
    ? chartEndIndex === null
      ? liveReplayIndex
      : Math.max(0, Math.min(chartEndIndex, liveReplayIndex))
    : 0;
  const currentCandle = hasCandles ? candles[safeReplayIndex] : fallbackCandle;
  const currentPrice = currentCandle.close;
  const marksByPair = useMemo(() => getLatestMarksByPair(datasets), [datasets]);
  const metrics = useMemo(() => getMetrics(session, marksByPair), [session, marksByPair]);
  const currentPairPositions = useMemo(
    () => session.positions.filter((item) => item.pair === pair),
    [session.positions, pair],
  );
  const currentPairClosedTrades = useMemo(
    () => session.closedTrades.filter((item) => item.pair === pair),
    [session.closedTrades, pair],
  );
  const editingPosition = useMemo(
    () => session.positions.find((item) => item.id === positionBracketEditor.positionId) ?? null,
    [session.positions, positionBracketEditor.positionId],
  );
  const ticketValidation = useMemo(
    () =>
      validateTicketOrder({
        ticket,
        session,
        hasCandles,
        currentPrice,
        isLoadingData,
      }),
    [ticket, session, hasCandles, currentPrice, isLoadingData],
  );
  const isOrderActionDisabled = !ticketValidation.canSubmit;
  const ticketSideBracketValidation = useMemo(() => {
    const stopLoss = sanitizePriceInput(ticket.stopLoss);
    const takeProfit = sanitizePriceInput(ticket.takeProfit);
    const entryPrice = ticket.type === 'limit' ? ticketValidation.limitPrice : currentPrice;

    if (!Number.isFinite(entryPrice) || entryPrice <= 0) {
      return { buyError: null, sellError: null };
    }

    return {
      buyError: validateBracketPrices('long', entryPrice, stopLoss, takeProfit),
      sellError: validateBracketPrices('short', entryPrice, stopLoss, takeProfit),
    };
  }, [ticket.stopLoss, ticket.takeProfit, ticket.type, ticketValidation.limitPrice, currentPrice]);
  const isBuyActionDisabled = isOrderActionDisabled || ticketSideBracketValidation.buyError !== null;
  const isSellActionDisabled = isOrderActionDisabled || ticketSideBracketValidation.sellError !== null;
  const availableBalance = useMemo(() => Math.max(session.balance - getUsedMargin(session), 0), [session]);
  chartDrawStateRef.current = {
    candles,
    replayIndex: chartReplayIndex,
    positions: currentPairPositions,
    closedTrades: currentPairClosedTrades,
    viewSize: chartViewSize,
    timeframeId,
  };

  function redrawChartWithCurrentState() {
    const state = chartDrawStateRef.current;
    drawCandles(
      chartRef.current,
      state.candles,
      state.replayIndex,
      state.positions,
      state.closedTrades,
      state.viewSize,
      state.timeframeId,
      chartCrosshairRef.current,
      chartMarkerHotspotsRef,
    );
  }

  function requestChartHoverRedraw() {
    if (chartHoverRedrawRafRef.current !== null) {
      return;
    }

    chartHoverRedrawRafRef.current = window.requestAnimationFrame(() => {
      chartHoverRedrawRafRef.current = null;
      redrawChartWithCurrentState();
    });
  }

  function handleChartMouseMove(event) {
    if (isLoadingData || !chartRef.current) {
      return;
    }

    const rect = chartRef.current.getBoundingClientRect();
    chartCrosshairRef.current = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };

    const pointerX = chartCrosshairRef.current.x;
    const pointerY = chartCrosshairRef.current.y;
    let hoveredMarker = null;
    let minDistanceSq = Number.POSITIVE_INFINITY;
    for (const item of chartMarkerHotspotsRef.current) {
      const dx = pointerX - item.x;
      const dy = pointerY - item.y;
      const distanceSq = dx * dx + dy * dy;
      if (distanceSq <= item.radius * item.radius && distanceSq < minDistanceSq) {
        hoveredMarker = item;
        minDistanceSq = distanceSq;
      }
    }

    if (hoveredMarker) {
      if (chartHoveredMarkerIdRef.current !== hoveredMarker.id) {
        chartHoveredMarkerIdRef.current = hoveredMarker.id;
        setChartMarkerTooltip({
          id: hoveredMarker.id,
          x: hoveredMarker.x,
          y: hoveredMarker.y,
          title: hoveredMarker.title,
          entries: hoveredMarker.entries,
        });
      }
    } else if (chartHoveredMarkerIdRef.current !== null) {
      chartHoveredMarkerIdRef.current = null;
      setChartMarkerTooltip(null);
    }

    requestChartHoverRedraw();
  }

  function handleChartMouseLeave() {
    const hadCrosshair = Boolean(chartCrosshairRef.current);
    chartCrosshairRef.current = null;
    if (chartHoveredMarkerIdRef.current !== null || chartMarkerTooltip !== null) {
      chartHoveredMarkerIdRef.current = null;
      setChartMarkerTooltip(null);
    }
    if (hadCrosshair) {
      requestChartHoverRedraw();
    }
  }

  function dismissPatternNotification(notificationId) {
    const timer = patternNotificationTimersRef.current.get(notificationId);
    if (timer) {
      window.clearTimeout(timer);
      patternNotificationTimersRef.current.delete(notificationId);
    }
    setPatternNotifications((previous) => previous.filter((item) => item.id !== notificationId));
  }

  function emitPatternNotification(payload) {
    if (!ENABLE_PATTERN_NOTIFICATIONS) {
      return;
    }

    const id = `${payload.timestamp}-${payload.patternName}-${Math.random().toString(36).slice(2, 8)}`;
    const notification = {
      id,
      ...payload,
    };

    setPatternNotifications((previous) => {
      const next = [notification, ...previous];
      if (next.length > MAX_PATTERN_NOTIFICATIONS) {
        const dropped = next.slice(MAX_PATTERN_NOTIFICATIONS);
        for (const item of dropped) {
          const timer = patternNotificationTimersRef.current.get(item.id);
          if (timer) {
            window.clearTimeout(timer);
            patternNotificationTimersRef.current.delete(item.id);
          }
        }
      }
      return next.slice(0, MAX_PATTERN_NOTIFICATIONS);
    });

    const timeoutId = window.setTimeout(() => {
      dismissPatternNotification(id);
    }, PATTERN_NOTIFICATION_TTL_MS);
    patternNotificationTimersRef.current.set(id, timeoutId);

    window.dispatchEvent(
      new CustomEvent('pattern-detected', {
        detail: {
          patternName: notification.patternName,
          timestamp: notification.timestamp,
          symbol: notification.symbol,
          description: notification.description,
        },
      }),
    );
  }

  useEffect(() => {
    if (storedSession !== null && typeof storedSession !== 'object') {
      removeStoredSession();
    }
  }, [storedSession, removeStoredSession]);

  useEffect(
    () => () => {
      for (const timeoutId of patternNotificationTimersRef.current.values()) {
        window.clearTimeout(timeoutId);
      }
      patternNotificationTimersRef.current.clear();
      if (chartHoverRedrawRafRef.current !== null) {
        window.cancelAnimationFrame(chartHoverRedrawRafRef.current);
        chartHoverRedrawRafRef.current = null;
      }
    },
    [],
  );

  useEffect(() => {
    chartHoveredMarkerIdRef.current = null;
    setChartMarkerTooltip(null);
  }, [isLoadingData, pair, timeframeId]);

  useEffect(() => {
    let isCancelled = false;

    async function loadCandles() {
      const cacheKey = `coinbase:${pair}:${timeframeId}`;
      const cached = coinbaseCacheRef.current[cacheKey];
      if (cached) {
        setDatasets((previous) => ({
          ...previous,
          [pair]: cached,
        }));
        setDatasetRevision((value) => value + 1);
        return;
      }

      setIsLoadingData(true);

      try {
        const loaded = await fetchCoinbaseCandles(pairMeta.coinbaseProduct, timeframeId);
        if (isCancelled) {
          return;
        }

        coinbaseCacheRef.current[cacheKey] = loaded;
        setDatasets((previous) => ({
          ...previous,
          [pair]: loaded,
        }));
        setDatasetRevision((value) => value + 1);
      } catch (error) {
        if (isCancelled) {
          return;
        }

      } finally {
        if (!isCancelled) {
          setIsLoadingData(false);
        }
      }
    }

    loadCandles();

    return () => {
      isCancelled = true;
    };
  }, [pair, pairMeta.coinbaseProduct, timeframeId, timeframe.label]);

  useEffect(() => {
    let isCancelled = false;
    let refreshTimer = null;
    let isFetching = false;
    let controller = null;

    const cacheKey = `coinpaprika:${pairMeta.coinPaprikaId}`;
    const cached = newsCacheRef.current[cacheKey];

    if (cached) {
      setNewsByPair((previous) => ({
        ...previous,
        [pair]: cached,
      }));
      setNewsStatus(`Pair events from CoinPaprika (${cached.length} items).`);
      setIsLoadingNews(false);
    }

    async function loadEvents(silent = false) {
      if (isCancelled || isFetching) {
        return;
      }

      isFetching = true;
      if (!silent && !cached) {
        setIsLoadingNews(true);
        setNewsStatus(`Loading ${pairMeta.label} events from CoinPaprika...`);
      }

      if (controller) {
        controller.abort();
      }
      controller = new AbortController();

      try {
        const events = await fetchCoinPaprikaEvents(pairMeta.coinPaprikaId, controller.signal);
        if (isCancelled) {
          return;
        }

        newsCacheRef.current[cacheKey] = events;
        setNewsByPair((previous) => ({
          ...previous,
          [pair]: events,
        }));

        if (events.length === 0) {
          setNewsStatus(`No recent ${pairMeta.label} events from CoinPaprika.`);
        } else {
          setNewsStatus(`Pair events from CoinPaprika (${events.length} items).`);
        }
      } catch (error) {
        if (isCancelled || (error instanceof Error && error.name === 'AbortError')) {
          return;
        }

        const reason = error instanceof Error ? error.message : String(error);
        setNewsStatus(`CoinPaprika events failed (${reason}).`);
      } finally {
        if (!isCancelled) {
          setIsLoadingNews(false);
        }
        isFetching = false;
      }
    }

    loadEvents();
    refreshTimer = window.setInterval(() => {
      loadEvents(true);
    }, NEWS_REFRESH_INTERVAL_MS);

    return () => {
      isCancelled = true;
      if (refreshTimer) {
        window.clearInterval(refreshTimer);
      }
      if (controller) {
        controller.abort();
      }
    };
  }, [pair, pairMeta.coinPaprikaId, pairMeta.label]);

  useEffect(() => {
    const latestIndex = Math.max(0, candles.length - 1);
    setSession((previous) => {
      if (previous.replayIndex === latestIndex) {
        return previous;
      }
      return {
        ...previous,
        replayIndex: latestIndex,
      };
    });
    setTicket(defaultTicket(candles[latestIndex]?.close));
    if (chartPanAnimationRef.current !== null) {
      window.cancelAnimationFrame(chartPanAnimationRef.current);
      chartPanAnimationRef.current = null;
    }
    setChartEndIndex(null);
  }, [pair, timeframe.label, timeframeId, datasetRevision]);

  useEffect(() => {
    const snapshot = {
      balance: session.balance,
      sequence: session.sequence,
      positions: session.positions,
      pendingOrders: session.pendingOrders,
      closedTrades: session.closedTrades,
    };

    const nextHash = JSON.stringify(snapshot);
    if (nextHash === lastPersistedPayloadRef.current) {
      return;
    }
    lastPersistedPayloadRef.current = nextHash;

    setStoredSession(snapshot);
    window.postMessage(
      {
        type: 'MARKET_LIVE_SESSION_SYNC',
        payload: snapshot,
      },
      window.location.origin,
    );
  }, [
    session.balance,
    session.sequence,
    session.positions,
    session.pendingOrders,
    session.closedTrades,
    setStoredSession,
  ]);

  useEffect(() => {
    if (isLoadingData) {
      return undefined;
    }

    let isCancelled = false;
    let ws = null;
    let reconnectTimer = null;
    let reconnectAttempt = 0;

    const connect = () => {
      if (isCancelled) {
        return;
      }

      ws = new WebSocket('wss://ws-feed.exchange.coinbase.com');

      ws.onopen = () => {
        reconnectAttempt = 0;
        ws.send(
          JSON.stringify({
            type: 'subscribe',
            product_ids: PAIRS.map((item) => item.coinbaseProduct),
            channels: ['ticker', 'heartbeat'],
          }),
        );
      };

      ws.onmessage = (event) => {
        if (isCancelled) {
          return;
        }

        try {
          const payload = JSON.parse(event.data);
          if (payload.type !== 'ticker') {
            return;
          }

          const targetPair = PRODUCT_TO_PAIR[payload.product_id];
          if (!targetPair) {
            return;
          }

          const ts = payload.time ? Date.parse(payload.time) : Date.now();
          if (!Number.isFinite(ts)) {
            return;
          }

          setDatasets((previous) => {
            const currentSeries = previous[targetPair] ?? [];
            const updatedSeries = applyLiveTickToCandles(currentSeries, {
              price: Number(payload.price),
              size: Number(payload.last_size || 0),
              timestamp: ts,
            }, timeframeId);

            if (updatedSeries === currentSeries) {
              return previous;
            }

            return {
              ...previous,
              [targetPair]: updatedSeries,
            };
          });
        } catch {
          // Ignore malformed socket messages.
        }
      };

      ws.onclose = () => {
        if (isCancelled) {
          return;
        }

        reconnectAttempt += 1;
        const delayMs = Math.min(10000, 1000 * reconnectAttempt);
        reconnectTimer = window.setTimeout(connect, delayMs);
      };

      ws.onerror = () => {
        if (ws && ws.readyState !== WebSocket.CLOSED) {
          ws.close();
        }
      };
    };

    connect();

    return () => {
      isCancelled = true;
      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer);
      }
      if (ws && ws.readyState !== WebSocket.CLOSED) {
        ws.close();
      }
    };
  }, [isLoadingData, timeframeId, timeframe.label]);

  useEffect(() => {
    const changedPairs = [];

    for (const pairMetaItem of PAIRS) {
      const series = datasets[pairMetaItem.id] ?? [];
      if (!Array.isArray(series) || series.length === 0) {
        continue;
      }

      const liveCandle = series[series.length - 1];
      const key = `${pairMetaItem.id}:${timeframeId}`;
      const previousTs = processedSessionCandleTsRef.current[key];
      const currentTs = Number(liveCandle.timestamp);

      if (!Number.isFinite(currentTs)) {
        continue;
      }

      if (previousTs !== currentTs) {
        changedPairs.push({
          pairId: pairMetaItem.id,
          liveCandle,
          key,
          ts: currentTs,
        });
      }
    }

    if (changedPairs.length === 0) {
      return;
    }

    const marks = getLatestMarksByPair(datasets);

    setSession((previous) => {
      let next = previous;
      let changed = false;

      for (const item of changedPairs) {
        const afterPending = evaluatePendingOrders(next, item.liveCandle, item.pairId, marks);
        if (afterPending !== next) {
          next = afterPending;
          changed = true;
        }

        const afterRisk = evaluateRiskExits(next, item.liveCandle, item.pairId);
        if (afterRisk !== next) {
          next = afterRisk;
          changed = true;
        }

        if (item.pairId === pair && next.replayIndex !== item.liveCandle.index) {
          next = {
            ...next,
            replayIndex: item.liveCandle.index,
          };
          changed = true;
        }
      }

      const equity = next.balance + getUnrealizedPnl(next.positions, marks);
      const history = next.equityHistory;
      const lastPoint = history[history.length - 1];
      let nextHistory = history;

      if (!lastPoint) {
        nextHistory = [{ index: 0, equity }];
      } else if (lastPoint.equity !== equity) {
        nextHistory = [...history, { index: lastPoint.index + 1, equity }];
      }

      if (nextHistory !== history) {
        next = {
          ...next,
          equityHistory: nextHistory,
        };
        changed = true;
      }

      return changed ? next : previous;
    });

    for (const item of changedPairs) {
      processedSessionCandleTsRef.current[item.key] = item.ts;
    }
  }, [datasets, timeframeId, pair]);

  useEffect(() => {
    const streamKey = `${pair}:${timeframeId}`;
    if (candles.length < 2) {
      processedPatternCandleTsRef.current[streamKey] = null;
      return;
    }

    const closedCandles = candles.slice(0, -1);
    const latestClosed = closedCandles[closedCandles.length - 1];
    const latestClosedTs = Number(latestClosed.timestamp);
    if (!Number.isFinite(latestClosedTs)) {
      return;
    }

    const previousProcessed = processedPatternCandleTsRef.current[streamKey];
    if (!Number.isFinite(previousProcessed) || previousProcessed > latestClosedTs) {
      processedPatternCandleTsRef.current[streamKey] = latestClosedTs;
      return;
    }

    const newlyClosed = closedCandles.filter((candle) => candle.timestamp > previousProcessed);
    if (newlyClosed.length === 0) {
      return;
    }

    for (const closedCandle of newlyClosed) {
      const match = detectSingleCandlePattern(closedCandle);
      if (!match) {
        continue;
      }

      emitPatternNotification({
        patternName: match.patternName,
        timestamp: closedCandle.timestamp,
        symbol: pairMeta.coinbaseProduct,
        description: match.description,
      });
    }

    processedPatternCandleTsRef.current[streamKey] = newlyClosed[newlyClosed.length - 1].timestamp;
  }, [candles, pair, timeframeId, pairMeta.coinbaseProduct]);

  useEffect(() => {
    if (!hasCandles) {
      return;
    }

    const maxIndex = candles.length - 1;
    setChartEndIndex((previous) => {
      if (previous === null) {
        return previous;
      }

      const clamped = Math.max(0, Math.min(previous, maxIndex));
      return clamped === maxIndex ? null : clamped;
    });
  }, [hasCandles, candles.length]);

  useEffect(
    () => () => {
      if (chartPanAnimationRef.current !== null) {
        window.cancelAnimationFrame(chartPanAnimationRef.current);
        chartPanAnimationRef.current = null;
      }
    },
    [],
  );

  useEffect(() => {
    drawCandles(
      chartRef.current,
      candles,
      chartReplayIndex,
      currentPairPositions,
      currentPairClosedTrades,
      chartViewSize,
      timeframeId,
      chartCrosshairRef.current,
      chartMarkerHotspotsRef,
    );
  }, [candles, chartReplayIndex, currentPairPositions, currentPairClosedTrades, resizeToken, chartViewSize, timeframeId]);

  useEffect(() => {
    drawEquityCurve(equityRef.current, session.equityHistory);
  }, [session.equityHistory, resizeToken]);

  useEffect(() => {
    const handleResize = () => setResizeToken((value) => value + 1);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const container = chartWrapRef.current;
    if (!container) {
      return undefined;
    }

    const handleChartWheel = (event) => {
      if (event.cancelable) {
        event.preventDefault();
      }
      event.stopPropagation();

      const hasHorizontalIntent =
        Number.isFinite(event.deltaX) &&
        Math.abs(event.deltaX) > 0 &&
        Math.abs(event.deltaX) >= Math.abs(event.deltaY);

      if (hasHorizontalIntent) {
        if (chartPanAnimationRef.current !== null) {
          window.cancelAnimationFrame(chartPanAnimationRef.current);
          chartPanAnimationRef.current = null;
        }
        const panStepRaw = Math.round(event.deltaX * CHART_PAN_SENSITIVITY);
        const panStep = panStepRaw === 0 ? (event.deltaX > 0 ? 1 : -1) : panStepRaw;
        const maxIndex = Math.max(0, candles.length - 1);

        setChartEndIndex((previous) => {
          const baseIndex = previous === null ? maxIndex : previous;
          const nextIndex = Math.max(0, Math.min(baseIndex + panStep, maxIndex));
          return nextIndex === maxIndex ? null : nextIndex;
        });
        return;
      }

      if (!Number.isFinite(event.deltaY) || event.deltaY === 0) {
        return;
      }

      const scaleFactor = Math.exp(event.deltaY * CHART_ZOOM_SENSITIVITY);
      if (chartPanAnimationRef.current !== null) {
        window.cancelAnimationFrame(chartPanAnimationRef.current);
        chartPanAnimationRef.current = null;
      }
      setChartViewSize((previous) => clampChartViewSize(previous * scaleFactor));
    };

    container.addEventListener('wheel', handleChartWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleChartWheel);
    };
  }, [candles.length]);

  useEffect(() => {
    if (!positionBracketEditor.isOpen) {
      return;
    }
    if (editingPosition) {
      return;
    }
    setPositionBracketEditor({
      isOpen: false,
      positionId: null,
      stopLoss: '',
      takeProfit: '',
      error: '',
    });
  }, [positionBracketEditor.isOpen, editingPosition]);

  function submitOrder(side) {
    if (side !== 'buy' && side !== 'sell') {
      return;
    }

    if (!ticketValidation.canSubmit) {
      return;
    }

    const qty = ticketValidation.qty;
    const stopLoss = sanitizePriceInput(ticket.stopLoss);
    const takeProfit = sanitizePriceInput(ticket.takeProfit);
    const bracketEntryPrice = ticket.type === 'limit' ? ticketValidation.limitPrice : currentPrice;
    const bracketSide = side === 'buy' ? 'long' : 'short';

    if (Number.isFinite(bracketEntryPrice) && bracketEntryPrice > 0) {
      const bracketValidationError = validateBracketPrices(bracketSide, bracketEntryPrice, stopLoss, takeProfit);
      if (bracketValidationError) {
        return;
      }
    }

    if (ticket.type === 'market') {
      const result = openPosition(session, currentCandle, {
        pair,
        side,
        qty,
        stopLoss,
        takeProfit,
        entryPrice: currentPrice,
        entryType: 'market',
      }, {
        ...marksByPair,
        [pair]: currentPrice,
      });

      if (result.error) {
        return;
      }

      setSession(result.session);
      setTicket((previous) => ({ ...defaultTicket(currentPrice), type: previous.type }));
      return;
    }

    const limitPrice = ticketValidation.limitPrice;
    if (limitPrice === null) {
      return;
    }

    const pending = {
      id: session.sequence,
      pair,
      side,
      qty,
      limitPrice,
      stopLoss,
      takeProfit,
      createdAtIndex: currentCandle.index,
      createdAtTs: currentCandle.timestamp,
    };

    setSession((previous) => {
      let next = {
        ...previous,
        sequence: previous.sequence + 1,
        pendingOrders: [...previous.pendingOrders, pending],
      };

      next = appendTimeline(
        next,
        buildTimelineEvent(
          currentCandle.index,
          currentCandle.timestamp,
          `${pending.pair} limit ${pending.side === 'buy' ? 'buy' : 'sell'} order queued at $${fmtPrice(limitPrice)}.`,
        ),
      );

      return next;
    });

    setTicket((previous) => ({ ...defaultTicket(currentPrice), type: previous.type }));
  }

  function cancelPendingOrder(orderId) {
    function getLatestCandleForPair(pairId) {
      const series = datasets[pairId] ?? [];
      if (Array.isArray(series) && series.length > 0) {
        return series[series.length - 1];
      }
      return currentCandle;
    }

    setSession((previous) => {
      const order = previous.pendingOrders.find((item) => item.id === orderId);
      if (!order) {
        return previous;
      }
      const orderCandle = getLatestCandleForPair(order.pair);

      let next = {
        ...previous,
        pendingOrders: previous.pendingOrders.filter((item) => item.id !== orderId),
      };

      next = appendTimeline(
        next,
        buildTimelineEvent(
          orderCandle.index,
          orderCandle.timestamp,
          `${order.pair} limit order #${orderId} canceled.`,
        ),
      );

      return next;
    });

  }

  function closePositionNow(positionId) {
    const getLatestCandleForPair = (pairId) => {
      const series = datasets[pairId] ?? [];
      if (Array.isArray(series) && series.length > 0) {
        return series[series.length - 1];
      }
      return currentCandle;
    };

    setSession((previous) => {
      const position = previous.positions.find((item) => item.id === positionId);
      if (!position) {
        return previous;
      }

      return closePosition(previous, getLatestCandleForPair(position.pair), positionId, 'manual close');
    });
  }

  function closePositionBracketEditor() {
    setPositionBracketEditor({
      isOpen: false,
      positionId: null,
      stopLoss: '',
      takeProfit: '',
      error: '',
    });
  }

  function openPositionBracketEditor(positionId) {
    const position = session.positions.find((item) => item.id === positionId);
    if (!position) {
      return;
    }

    setPositionBracketEditor({
      isOpen: true,
      positionId: position.id,
      stopLoss: position.stopLoss === null ? '' : String(position.stopLoss),
      takeProfit: position.takeProfit === null ? '' : String(position.takeProfit),
      error: '',
    });
  }

  function updatePositionBracketEditorField(field, value) {
    setPositionBracketEditor((previous) => ({
      ...previous,
      [field]: value,
      error: '',
    }));
  }

  function savePositionBrackets() {
    if (!editingPosition) {
      closePositionBracketEditor();
      return;
    }

    const parsedTakeProfit = parseOptionalPriceInput(positionBracketEditor.takeProfit, 'Take-profit');
    if (parsedTakeProfit.error) {
      setPositionBracketEditor((previous) => ({ ...previous, error: parsedTakeProfit.error }));
      return;
    }

    const parsedStopLoss = parseOptionalPriceInput(positionBracketEditor.stopLoss, 'Stop-loss');
    if (parsedStopLoss.error) {
      setPositionBracketEditor((previous) => ({ ...previous, error: parsedStopLoss.error }));
      return;
    }

    const takeProfit = parsedTakeProfit.value;
    const stopLoss = parsedStopLoss.value;
    const validationError = validateBracketPrices(editingPosition.side, editingPosition.entryPrice, stopLoss, takeProfit);
    if (validationError) {
      setPositionBracketEditor((previous) => ({ ...previous, error: validationError }));
      return;
    }

    const didChange = editingPosition.takeProfit !== takeProfit || editingPosition.stopLoss !== stopLoss;
    if (!didChange) {
      closePositionBracketEditor();
      return;
    }

    const getLatestCandleForPair = (pairId) => {
      const series = datasets[pairId] ?? [];
      if (Array.isArray(series) && series.length > 0) {
        return series[series.length - 1];
      }
      return currentCandle;
    };

    setSession((previous) => {
      const position = previous.positions.find((item) => item.id === editingPosition.id);
      if (!position) {
        return previous;
      }

      let next = {
        ...previous,
        positions: previous.positions.map((item) =>
          item.id === position.id ? { ...item, stopLoss, takeProfit } : item
        ),
      };

      const latestCandle = getLatestCandleForPair(position.pair);
      const bracketsLabel = `${takeProfit === null ? '-' : fmtPrice(takeProfit)}/${stopLoss === null ? '-' : fmtPrice(stopLoss)}`;
      next = appendTimeline(
        next,
        buildTimelineEvent(
          latestCandle.index,
          latestCandle.timestamp,
          `${position.pair} position #${position.id} TP/SL updated to ${bracketsLabel}.`,
        ),
      );

      return next;
    });

    closePositionBracketEditor();
  }

  function deletePositionBrackets() {
    if (!editingPosition) {
      closePositionBracketEditor();
      return;
    }

    const getLatestCandleForPair = (pairId) => {
      const series = datasets[pairId] ?? [];
      if (Array.isArray(series) && series.length > 0) {
        return series[series.length - 1];
      }
      return currentCandle;
    };

    setSession((previous) => {
      const position = previous.positions.find((item) => item.id === editingPosition.id);
      if (!position) {
        return previous;
      }
      if (position.stopLoss === null && position.takeProfit === null) {
        return previous;
      }

      let next = {
        ...previous,
        positions: previous.positions.map((item) =>
          item.id === position.id ? { ...item, stopLoss: null, takeProfit: null } : item
        ),
      };

      const latestCandle = getLatestCandleForPair(position.pair);
      next = appendTimeline(
        next,
        buildTimelineEvent(
          latestCandle.index,
          latestCandle.timestamp,
          `${position.pair} position #${position.id} TP/SL removed.`,
        ),
      );

      return next;
    });

    closePositionBracketEditor();
  }

  function resetSession() {
    if (session.balance === INITIAL_BALANCE
      && session.positions.length === 0
      && session.pendingOrders.length === 0
      && session.closedTrades.length === 0
      && session.sequence <= 1) {
      return;
    }

    for (const timeoutId of patternNotificationTimersRef.current.values()) {
      window.clearTimeout(timeoutId);
    }
    patternNotificationTimersRef.current.clear();
    setPatternNotifications([]);

    if (chartPanAnimationRef.current !== null) {
      window.cancelAnimationFrame(chartPanAnimationRef.current);
      chartPanAnimationRef.current = null;
    }
    setChartEndIndex(null);
    chartHoveredMarkerIdRef.current = null;
    setChartMarkerTooltip(null);
    chartCrosshairRef.current = null;

    removeStoredSession();
    lastPersistedPayloadRef.current = '';
    setSession(createSession(candles));
    setTicket((previous) => ({ ...defaultTicket(currentPrice), type: previous.type }));
    setCoachReport(null);
  }

  function generateReport() {
    const report = generateCoachReport(session, candles, metrics);
    setCoachReport(report);
  }

  const sessionReturn = ((metrics.equity - INITIAL_BALANCE) / INITIAL_BALANCE) * 100;
  const canResetSession = session.balance !== INITIAL_BALANCE
    || session.positions.length > 0
    || session.pendingOrders.length > 0
    || session.closedTrades.length > 0
    || session.sequence > 1;
  const tickerTitles = useMemo(() => {
    const fallback = `No fresh ${pairMeta.label} headlines right now.`;
    if (!Array.isArray(newsItems) || newsItems.length === 0) {
      return [fallback];
    }

    const uniqueTitles = [...new Set(newsItems.map((item) => item.title).filter((title) => typeof title === 'string'))]
      .map((title) => title.trim())
      .filter((title) => title.length > 0);

    return uniqueTitles.length > 0 ? uniqueTitles : [fallback];
  }, [newsItems, pairMeta.label]);
  const tickerItems = useMemo(() => [...tickerTitles, ...tickerTitles], [tickerTitles]);
  const { scrollY } = useScroll();
  const heroFadeOpacity = useTransform(scrollY, [0, 100, 160], [1, 0.6, 0]);
  const layoutGridPaddingXRaw = useTransform(scrollY, [0, 160], [100, 60]);
  const layoutGridPaddingX = useSpring(layoutGridPaddingXRaw, { stiffness: 220, damping: 34, mass: 0.35 });
  const hasCustomChartScale = Math.abs(chartViewSize - DEFAULT_CHART_VIEW_SIZE) > 0.01;
  const canPanChartRight = hasCandles && chartEndIndex !== null && chartReplayIndex < liveReplayIndex;
  const canDeleteEditingPositionBrackets = Boolean(editingPosition && (editingPosition.takeProfit !== null || editingPosition.stopLoss !== null));
  const positionBracketPnlPreview = useMemo(() => {
    const parseTargetPrice = (value) => {
      const trimmed = String(value ?? '').trim();
      if (trimmed.length === 0) {
        return { status: 'empty', value: null };
      }
      const parsed = Number(trimmed);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return { status: 'invalid', value: null };
      }
      return { status: 'valid', value: parsed };
    };

    if (!editingPosition) {
      return {
        takeProfit: { status: 'empty', pnl: null },
        stopLoss: { status: 'empty', pnl: null },
      };
    }

    const takeProfitTarget = parseTargetPrice(positionBracketEditor.takeProfit);
    const stopLossTarget = parseTargetPrice(positionBracketEditor.stopLoss);

    const takeProfitPnl = takeProfitTarget.status === 'valid'
      ? getEstimatedNetPnl({
        side: editingPosition.side,
        entryPrice: editingPosition.entryPrice,
        qty: editingPosition.qty,
        exitPrice: takeProfitTarget.value,
      })
      : null;
    const stopLossPnl = stopLossTarget.status === 'valid'
      ? getEstimatedNetPnl({
        side: editingPosition.side,
        entryPrice: editingPosition.entryPrice,
        qty: editingPosition.qty,
        exitPrice: stopLossTarget.value,
      })
      : null;

    return {
      takeProfit: { status: takeProfitTarget.status, pnl: takeProfitPnl },
      stopLoss: { status: stopLossTarget.status, pnl: stopLossPnl },
    };
  }, [editingPosition, positionBracketEditor.takeProfit, positionBracketEditor.stopLoss]);
  const ticketBracketPnlPreview = useMemo(() => {
    const qty = Number(ticket.qty);
    const entryPrice = ticket.type === 'limit'
      ? sanitizePriceInput(ticket.limitPrice)
      : Number.isFinite(currentPrice) && currentPrice > 0
        ? currentPrice
        : null;
    const side = ticketPreviewSide === 'sell' ? 'short' : 'long';
    const takeProfit = sanitizePriceInput(ticket.takeProfit);
    const stopLoss = sanitizePriceInput(ticket.stopLoss);

    if (!Number.isFinite(qty) || qty <= 0 || entryPrice === null) {
      return { takeProfit: null, stopLoss: null };
    }

    return {
      takeProfit: takeProfit === null
        ? null
        : getEstimatedNetPnl({ side, entryPrice, qty, exitPrice: takeProfit }),
      stopLoss: stopLoss === null
        ? null
        : getEstimatedNetPnl({ side, entryPrice, qty, exitPrice: stopLoss }),
    };
  }, [ticket.qty, ticket.type, ticket.limitPrice, ticket.takeProfit, ticket.stopLoss, currentPrice, ticketPreviewSide]);

  function panChartRight() {
    if (!hasCandles) {
      return;
    }

    if (chartPanAnimationRef.current !== null) {
      window.cancelAnimationFrame(chartPanAnimationRef.current);
      chartPanAnimationRef.current = null;
    }

    const maxIndex = candles.length - 1;
    const startIndex = Math.max(0, Math.min(chartReplayIndex, maxIndex));
    if (startIndex >= maxIndex) {
      setChartEndIndex(null);
      return;
    }

    const distance = maxIndex - startIndex;
    const durationMs = Math.min(
      CHART_PAN_TO_LIVE_MAX_MS,
      Math.max(CHART_PAN_TO_LIVE_MIN_MS, Math.round(distance * 1.4)),
    );
    const startedAt = performance.now();

    const animate = (now) => {
      const progress = Math.min(1, (now - startedAt) / durationMs);
      const eased = easeOutCubic(progress);
      const nextIndex = Math.round(startIndex + distance * eased);

      if (nextIndex >= maxIndex || progress >= 1) {
        setChartEndIndex(null);
        chartPanAnimationRef.current = null;
        return;
      }

      setChartEndIndex(nextIndex);
      chartPanAnimationRef.current = window.requestAnimationFrame(animate);
    };

    chartPanAnimationRef.current = window.requestAnimationFrame(animate);
  }

  return (
    <div className="app-shell">
      <header className="hero">
        <motion.div style={{ opacity: heroFadeOpacity }}>
          <p className="eyebrow">Claude Code Challenge MVP</p>
          <h1>Market Live Trainer</h1>
          <p className="subhead">
            Live Coinbase candles with timeframe switching, paper trading, and a rule-driven AI coach report.
          </p>
        </motion.div>

        <motion.div className="session-summary" style={{ opacity: heroFadeOpacity }}>
          <div className="session-summary-header">
            <p className="session-summary-title">Session Snapshot</p>
            {canResetSession ? (
              <button type="button" className="session-summary-reset-btn" onClick={resetSession}>
                Reset session
              </button>
            ) : null}
          </div>
          <div className="session-summary-grid">
            <p>
              <span>Source</span>
              <strong>Coinbase</strong>
            </p>
            <p>
              <span>Mode</span>
              <strong>Live</strong>
            </p>
            <p>
              <span>Available Balance</span>
              <strong>${fmtNumber(availableBalance)}</strong>
            </p>
            <p>
              <span>Equity</span>
              <strong>${fmtNumber(metrics.equity)}</strong>
            </p>
            <p>
              <span>Session Return</span>
              <strong className={sessionReturn >= 0 ? 'session-value pos' : 'session-value neg'}>{fmtPct(sessionReturn)}</strong>
            </p>
            <p>
              <span>Positions</span>
              <strong>
                {session.positions.length} open / {session.pendingOrders.length} pending
              </strong>
            </p>
          </div>
        </motion.div>

        <motion.div className="hero-ticker" role="status" aria-live="polite" style={{ opacity: heroFadeOpacity }}>
          <div className="hero-ticker-track">
            {tickerItems.map((title, index) => (
              <span key={`${title}-${index}`} className="hero-ticker-item">
                {title}
              </span>
            ))}
          </div>
        </motion.div>
      </header>

      <motion.main
        className="layout-grid"
        style={{
          paddingTop: 400,
          paddingRight: layoutGridPaddingX,
          paddingBottom: 0,
          paddingLeft: layoutGridPaddingX,
        }}
      >
        <section className="panel chart-panel">
          <div className="panel-head chart-panel-head">
            <div className="chart-pairs-nav" role="tablist" aria-label="Trading pairs">
              {PAIRS.map((item, index) => {
                const isActive = pair === item.id;
                return (
                  <div key={item.id} className="chart-tab-item">
                    <button
                      type="button"
                      className={`chart-pair-tab${isActive ? ' is-active' : ''}`}
                      onClick={() => setPair(item.id)}
                      role="tab"
                      aria-selected={isActive}
                    >
                      {item.label}
                    </button>
                    {index < PAIRS.length - 1 ? <span className="chart-tab-divider" aria-hidden="true" /> : null}
                  </div>
                );
              })}
            </div>
            <div className="inline-controls">
              <div className="chart-timeframes-nav" role="tablist" aria-label="Chart timeframe">
                {TIMEFRAMES.map((item, index) => {
                  const isActive = timeframeId === item.id;
                  return (
                    <div key={item.id} className="chart-tab-item">
                      <button
                        type="button"
                        className={`chart-timeframe-tab${isActive ? ' is-active' : ''}`}
                        onClick={() => setTimeframeId(item.id)}
                        role="tab"
                        aria-selected={isActive}
                      >
                        {item.label}
                      </button>
                      {index < TIMEFRAMES.length - 1 ? <span className="chart-tab-divider" aria-hidden="true" /> : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="market-strip">
            <div className="pill">
              <p className="pill-label">Open</p>
              <p className="pill-value">${fmtPrice(currentCandle.open)}</p>
            </div>
            <div className="pill">
              <p className="pill-label">High</p>
              <p className="pill-value">${fmtPrice(currentCandle.high)}</p>
            </div>
            <div className="pill">
              <p className="pill-label">Low</p>
              <p className="pill-value">${fmtPrice(currentCandle.low)}</p>
            </div>
            <div className="pill">
              <p className="pill-label">Close</p>
              <p className="pill-value">${fmtPrice(currentCandle.close)}</p>
            </div>
            <div className="pill">
              <p className="pill-label">Volume</p>
              <p className="pill-value">{fmtNumber(currentCandle.volume, 0)}</p>
            </div>
          </div>

          <div className="chart-stage">
            <div
              className="chart-wrap"
              ref={chartWrapRef}
              onMouseMove={handleChartMouseMove}
              onMouseLeave={handleChartMouseLeave}
            >
              {isLoadingData ? <ChartSkeleton /> : <canvas ref={chartRef} aria-label="Live candlestick chart" />}
            </div>
            {hasCustomChartScale || canPanChartRight ? (
              <div className="chart-overlay-controls">
                {hasCustomChartScale ? (
                  <button
                    type="button"
                    className="chart-reset-scale-btn"
                    onClick={() => setChartViewSize(DEFAULT_CHART_VIEW_SIZE)}
                    aria-label="Reset chart scale"
                    title="Reset scale"
                  >
                    <LuRotateCcw aria-hidden="true" />
                  </button>
                ) : null}
                {canPanChartRight ? (
                  <button
                    type="button"
                    className="chart-pan-right-btn"
                    onClick={panChartRight}
                    aria-label="Pan chart right"
                    title="Pan right"
                  >
                    <FiArrowRight aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            ) : null}
            {chartMarkerTooltip ? (
              <div
                className="chart-marker-tooltip"
                style={{
                  left: chartMarkerTooltip.x,
                  top: chartMarkerTooltip.y,
                }}
              >
                <p className="chart-marker-tooltip-title">{chartMarkerTooltip.title}</p>
                {chartMarkerTooltip.entries.map((entry) => (
                  <div key={`${chartMarkerTooltip.id}-${entry.id}`} className="chart-marker-tooltip-entry">
                    <p className="chart-marker-tooltip-entry-title">{entry.title}</p>
                    {entry.lines.map((line, lineIndex) => {
                      const hasStructuredLine = typeof line === 'object' && line !== null;
                      const lineLabel = hasStructuredLine ? line.label : '';
                      const lineValue = hasStructuredLine ? line.value : String(line ?? '');

                      return (
                        <p key={`${entry.id}-${lineIndex}`} className="chart-marker-tooltip-line">
                          {lineLabel ? <span className="chart-marker-tooltip-line-label">{lineLabel}</span> : null}
                          <span className="chart-marker-tooltip-line-value">{lineValue}</span>
                        </p>
                      );
                    })}
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          {session.positions.length > 0 ? (
            <div className="subpanel chart-open-positions">
              <div className="open-positions-cards" aria-label="Open positions">
                {session.positions.map((position) => {
                  const markPrice = getPositionMarkPrice(position, marksByPair, position.entryPrice) ?? position.entryPrice;
                  const estimatedCloseFee = markPrice * position.qty * FEE_RATE;
                  const unrealizedNetEstimated =
                    (markPrice - position.entryPrice) * position.qty * getDirectionMultiplier(position.side) -
                    estimatedCloseFee;
                  const hasTakeProfit = position.takeProfit !== null;
                  const hasStopLoss = position.stopLoss !== null;
                  const takeProfitValue = position.takeProfit !== null ? fmtPrice(position.takeProfit) : '-';
                  const stopLossValue = position.stopLoss !== null ? fmtPrice(position.stopLoss) : '-';
                  const pairLabel = PAIRS.find((item) => item.id === position.pair)?.label ?? position.pair;

                  return (
                    <article className={`open-position-card ${unrealizedNetEstimated >= 0 ? 'is-pos' : 'is-neg'}`} key={position.id}>
                      <header className="open-position-card-head">
                        <span className={`badge ${position.side}`}>{position.side.toUpperCase()}</span>
                        <span className="open-position-card-pair">{pairLabel}</span>
                      </header>

                      <div className="open-position-card-body">
                        <p className="open-position-card-row">
                          <span>Qty</span>
                          <span className="open-position-card-value">{fmtNumber(position.qty, 3)} {getPairBaseSymbol(position.pair)}</span>
                        </p>
                        <p className="open-position-card-row">
                          <span>Entry</span>
                          <span className="open-position-card-value">${fmtPrice(position.entryPrice)}</span>
                        </p>
                        <p className="open-position-card-row">
                          <span>Take profit</span>
                          <span className="open-position-card-value open-position-brackets-cell">
                            {hasTakeProfit ? (
                              <button
                                type="button"
                                className="open-position-close-btn open-position-bracket-trigger"
                                onClick={() => openPositionBracketEditor(position.id)}
                                aria-label={`Configure take-profit and stop-loss for position ${position.id}`}
                              >
                                {takeProfitValue}
                              </button>
                            ) : !hasStopLoss ? (
                              <button
                                type="button"
                                className="open-position-close-btn"
                                onClick={() => openPositionBracketEditor(position.id)}
                              >
                                Configure
                              </button>
                            ) : (
                              <span>-</span>
                            )}
                          </span>
                        </p>
                        <p className="open-position-card-row">
                          <span>Stop loss</span>
                          <span className="open-position-card-value open-position-brackets-cell">
                            {hasStopLoss ? (
                              <button
                                type="button"
                                className="open-position-close-btn open-position-bracket-trigger"
                                onClick={() => openPositionBracketEditor(position.id)}
                                aria-label={`Configure take-profit and stop-loss for position ${position.id}`}
                              >
                                {stopLossValue}
                              </button>
                            ) : !hasTakeProfit ? (
                              <button
                                type="button"
                                className="open-position-close-btn"
                                onClick={() => openPositionBracketEditor(position.id)}
                              >
                                Configure
                              </button>
                            ) : (
                              <span>-</span>
                            )}
                          </span>
                        </p>
                        <p className="open-position-card-row">
                          <span>Profit/Loss</span>
                          <span className={`open-position-card-value ${unrealizedNetEstimated >= 0 ? 'metric-value pos' : 'metric-value neg'}`}>
                            {fmtSigned(unrealizedNetEstimated)}
                          </span>
                        </p>
                      </div>

                      <footer className="open-position-card-foot">
                        <button
                          type="button"
                          className="open-position-close-btn open-position-close-btn-footer"
                          onClick={() => closePositionNow(position.id)}
                        >
                          Close position
                        </button>
                      </footer>
                    </article>
                  );
                })}
              </div>
            </div>
          ) : null}
        </section>

        <section className="panel ticket-panel">
          <form className="ticket-form" onSubmit={(event) => event.preventDefault()}>

            <div className="ticket-tabs-row">
              <Tabs
                items={ORDER_TYPE_TABS}
                value={ticket.type}
                onChange={(nextType) => setTicket((previous) => ({ ...previous, type: nextType }))}
                ariaLabel="Order type"
                disabled={isLoadingData}
              />
            </div>

            <label htmlFor="qtyInput">
              Quantity
              <input
                id="qtyInput"
                type="number"
                step="0.001"
                min="0.001"
                value={ticket.qty}
                onChange={(event) => setTicket((previous) => ({ ...previous, qty: event.target.value }))}
                required
              />
            </label>
            {ticketValidation.qtyError ? <p className="field-error">{ticketValidation.qtyError}</p> : null}
            {ticket.type === 'market' && ticketValidation.marginError ? (
              <p className="field-error">{ticketValidation.marginError}</p>
            ) : null}

            {ticket.type === 'limit' ? (
              <>
                <label htmlFor="limitPriceInput">
                  Limit price
                  <input
                    id="limitPriceInput"
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={ticket.limitPrice}
                    onChange={(event) => setTicket((previous) => ({ ...previous, limitPrice: event.target.value }))}
                  />
                </label>
                {ticketValidation.limitPriceError ? <p className="field-error">{ticketValidation.limitPriceError}</p> : null}
                {ticketValidation.marginError ? <p className="field-error">{ticketValidation.marginError}</p> : null}
              </>
            ) : null}

            <div className="ticket-brackets-row">
              <BracketField
                id="tpInput"
                label="Take-profit"
                value={ticket.takeProfit}
                onChange={(event) => setTicket((previous) => ({ ...previous, takeProfit: event.target.value }))}
                pnlText={ticketBracketPnlPreview.takeProfit === null ? null : fmtSigned(ticketBracketPnlPreview.takeProfit)}
                pnlTone={ticketBracketPnlPreview.takeProfit === null ? 'neutral' : ticketBracketPnlPreview.takeProfit >= 0 ? 'pos' : 'neg'}
              />

              <BracketField
                id="stopInput"
                label="Stop-loss"
                value={ticket.stopLoss}
                onChange={(event) => setTicket((previous) => ({ ...previous, stopLoss: event.target.value }))}
                pnlText={ticketBracketPnlPreview.stopLoss === null ? null : fmtSigned(ticketBracketPnlPreview.stopLoss)}
                pnlTone={ticketBracketPnlPreview.stopLoss === null ? 'neutral' : ticketBracketPnlPreview.stopLoss >= 0 ? 'pos' : 'neg'}
              />
            </div>

            <div className="ticket-side-actions">
              <button
                type="button"
                className="ticket-side-btn ticket-side-btn-buy"
                disabled={isBuyActionDisabled}
                onMouseEnter={() => setTicketPreviewSide('buy')}
                onFocus={() => setTicketPreviewSide('buy')}
                onClick={() => submitOrder('buy')}
              >
                Buy / Long
              </button>
              <button
                type="button"
                className="ticket-side-btn ticket-side-btn-sell"
                disabled={isSellActionDisabled}
                onMouseEnter={() => setTicketPreviewSide('sell')}
                onFocus={() => setTicketPreviewSide('sell')}
                onClick={() => submitOrder('sell')}
              >
                Sell / Short
              </button>
            </div>
          </form>

          {ticketValidation.marketDataError ? <p className="field-error">{ticketValidation.marketDataError}</p> : null}

          <div className="subpanel">
            <h3>Pending Limit Orders</h3>
            <div className="list-box">
              {session.pendingOrders.length === 0 ? (
                <p className="empty">No pending orders.</p>
              ) : (
                session.pendingOrders.map((order) => (
                  <div className="list-item" key={order.id}>
                    <div>
                      <strong>#{order.id}</strong> [{order.pair}] {order.side === 'buy' ? 'Buy' : 'Sell'} {fmtNumber(order.qty, 3)} @ $
                      {fmtPrice(order.limitPrice)}
                      <br />
                      <small>
                        SL: {order.stopLoss ? `$${fmtPrice(order.stopLoss)}` : '-'} | TP:{' '}
                        {order.takeProfit ? `$${fmtPrice(order.takeProfit)}` : '-'}
                      </small>
                    </div>
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={() => cancelPendingOrder(order.id)}
                    >
                      Cancel
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

        </section>

        <section className="panel analytics-panel">
          <div className="panel-head">
            <h2>Session Analytics</h2>
          </div>

          <div className="metrics-grid">
            <MetricCard label="Net PnL" value={fmtSigned(metrics.netPnl)} isPositive={metrics.netPnl >= 0} />
            <MetricCard label="Unrealized" value={fmtSigned(metrics.unrealized)} isPositive={metrics.unrealized >= 0} />
            <MetricCard label="Equity" value={`$${fmtNumber(metrics.equity)}`} />
            <MetricCard
              label="Win Rate"
              value={`${fmtNumber(metrics.winRate, 1)}%`}
              isPositive={metrics.winRate >= 50}
            />
            <MetricCard
              label="Profit Factor"
              value={metrics.profitFactor === null ? '-' : fmtNumber(metrics.profitFactor, 2)}
              isPositive={metrics.profitFactor === null ? null : metrics.profitFactor >= 1.2}
            />
            <MetricCard
              label="Max Drawdown"
              value={`${fmtNumber(metrics.maxDrawdown, 2)}%`}
              isPositive={false}
            />
            <MetricCard label="Avg R" value={metrics.avgR === null ? '-' : `${fmtNumber(metrics.avgR, 2)}R`} />
            <MetricCard
              label="Avg Hold"
              value={metrics.avgHold === null ? '-' : `${fmtNumber(metrics.avgHold, 1)} candles`}
            />
            <MetricCard label="Closed Trades" value={`${session.closedTrades.length}`} />
          </div>

          <div className="equity-wrap">
            <h3>Equity Curve</h3>
            <canvas ref={equityRef} aria-label="Equity curve" />
          </div>
        </section>

        <section className="panel coach-panel">
          <div className="panel-head">
            <h2>AI Coach Report</h2>
            <button type="button" className="btn secondary" onClick={generateReport}>
              Generate
            </button>
          </div>

          <div className="coach-report">
            {coachReport ? (
              <>
                <h3>{coachReport.headline}</h3>
                <p>
                  <strong>Session Score:</strong> {coachReport.score}/100
                </p>
                <p>{coachReport.summary}</p>
                <h4>Top Mistakes</h4>
                <ul>
                  {coachReport.mistakes.map((mistake) => (
                    <li key={mistake}>{mistake}</li>
                  ))}
                </ul>
                <h4>Recommended Improvements</h4>
                <ul>
                  {coachReport.improvements.map((improvement) => (
                    <li key={improvement}>{improvement}</li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="empty">Generate the report after a few trades to get coaching insights.</p>
            )}
          </div>
        </section>

        <section className="panel logs-panel">
          <div className="panel-head">
            <h2>Closed Trades</h2>
          </div>

          <div className="table-wrap">
            {session.closedTrades.length === 0 ? (
              <p className="empty" style={{ padding: '10px' }}>
                No closed trades yet.
              </p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Side</th>
                    <th>Qty</th>
                    <th>Entry</th>
                    <th>Exit</th>
                    <th>PnL</th>
                    <th>R</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {session.closedTrades.map((trade) => (
                    <tr key={trade.id}>
                      <td>{trade.side}</td>
                      <td>
                        {fmtNumber(trade.qty, 3)} {getPairBaseSymbol(trade.pair)}
                      </td>
                      <td>${fmtPrice(trade.entryPrice)}</td>
                      <td>${fmtPrice(trade.exitPrice)}</td>
                      <td className={trade.pnl >= 0 ? 'metric-value pos' : 'metric-value neg'}>{fmtSigned(trade.pnl)}</td>
                      <td>{trade.rMultiple === null ? '-' : `${fmtNumber(trade.rMultiple, 2)}R`}</td>
                      <td>{trade.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        <section className="panel news-panel">
          <div className="panel-head">
            <h2>Pair News</h2>
          </div>
          <p className={newsStatus.toLowerCase().includes('failed') ? 'data-status warning' : 'data-status'}>
            {isLoadingNews ? 'Fetching pair events...' : newsStatus}
          </p>
          <div className="news-feed">
            {isLoadingNews && newsItems.length === 0 ? (
              <p className="empty">Loading coin-specific events...</p>
            ) : newsItems.length === 0 ? (
              <p className="empty">No recent events for this pair.</p>
            ) : (
              newsItems.map((item) => (
                <article className="news-item" key={item.id}>
                  {item.proofImageLink ? (
                    <div className="news-image-wrap">
                      <img
                        className="news-image"
                        src={item.proofImageLink}
                        alt={item.title}
                        loading="lazy"
                        decoding="async"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                  ) : null}
                  <h3>{item.title}</h3>
                  <p className="news-meta">{newsTimestampLabel(item.timestamp)}</p>
                  <p className="news-summary">{item.summary}</p>
                  {item.link ? (
                    <a className="news-link" href={item.link} target="_blank" rel="noreferrer">
                      Open source
                    </a>
                  ) : null}
                </article>
              ))
            )}
          </div>
        </section>

        <section className="panel timeline-panel">
          <div className="panel-head">
            <h2>Session Timeline</h2>
          </div>
          <div className="timeline">
            {session.timeline.length === 0 ? (
              <p className="empty">No timeline events yet.</p>
            ) : (
              [...session.timeline]
                .reverse()
                .map((item) => (
                  <div key={item.id} className="timeline-item">
                    <span className="timeline-time">{candleLabel(item.timestamp)}</span>
                    {item.text}
                  </div>
                ))
            )}
          </div>
        </section>
      </motion.main>

      <Modal
        isOpen={positionBracketEditor.isOpen}
        title="Configure TP/SL"
        onClose={closePositionBracketEditor}
      >
        <form
          className="position-brackets-form"
          onSubmit={(event) => {
            event.preventDefault();
            savePositionBrackets();
          }}
        >
          {editingPosition ? (
            <p className="position-brackets-meta">
              {editingPosition.side.toUpperCase()} {getPairCompactLabel(editingPosition.pair)}
            </p>
          ) : null}

          <label htmlFor="positionEntryPriceInput">
            Price
            <input
              id="positionEntryPriceInput"
              type="text"
              value={editingPosition ? `$${fmtPrice(editingPosition.entryPrice)}` : ''}
              disabled
              readOnly
            />
          </label>

          <BracketField
            id="positionTakeProfitInput"
            label="Take-profit"
            value={positionBracketEditor.takeProfit}
            onChange={(event) => updatePositionBracketEditorField('takeProfit', event.target.value)}
            pnlText={
              positionBracketPnlPreview.takeProfit.status === 'valid'
                ? fmtSigned(positionBracketPnlPreview.takeProfit.pnl)
                : null
            }
            pnlTone={
              positionBracketPnlPreview.takeProfit.status !== 'valid'
                ? 'neutral'
                : positionBracketPnlPreview.takeProfit.pnl >= 0
                  ? 'pos'
                  : 'neg'
            }
          />

          <BracketField
            id="positionStopLossInput"
            label="Stop-loss"
            value={positionBracketEditor.stopLoss}
            onChange={(event) => updatePositionBracketEditorField('stopLoss', event.target.value)}
            pnlText={
              positionBracketPnlPreview.stopLoss.status === 'valid'
                ? fmtSigned(positionBracketPnlPreview.stopLoss.pnl)
                : null
            }
            pnlTone={
              positionBracketPnlPreview.stopLoss.status !== 'valid'
                ? 'neutral'
                : positionBracketPnlPreview.stopLoss.pnl >= 0
                  ? 'pos'
                  : 'neg'
            }
          />

          {positionBracketEditor.error ? <p className="field-error">{positionBracketEditor.error}</p> : null}

          <div className="position-brackets-actions">
            <button
              type="button"
              className="position-brackets-btn position-brackets-btn-delete"
              onClick={deletePositionBrackets}
              disabled={!canDeleteEditingPositionBrackets}
            >
              Delete
            </button>
            <button type="submit" className="position-brackets-btn position-brackets-btn-save">
              Save
            </button>
          </div>
        </form>
      </Modal>

      {ENABLE_PATTERN_NOTIFICATIONS && patternNotifications.length > 0 ? (
        <div className="pattern-notifications" aria-live="polite" aria-atomic="false">
          {patternNotifications.map((item) => (
            <article key={item.id} className="pattern-toast">
              <div className="pattern-toast-head">
                <strong>{item.patternName}</strong>
                <span>{item.symbol}</span>
              </div>
              <p className="pattern-toast-time">{candleLabel(item.timestamp)}</p>
              <p className="pattern-toast-text">{item.description}</p>
              <button type="button" className="pattern-toast-close" onClick={() => dismissPatternNotification(item.id)}>
                Dismiss
              </button>
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}
