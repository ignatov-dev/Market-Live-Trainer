export const DEFAULT_CHART_VIEW_SIZE = 92;
export const MIN_CHART_VIEW_SIZE = 24;
export const MAX_CHART_VIEW_SIZE = 1400;
export const CHART_ZOOM_SENSITIVITY = 0.00075;
export const CHART_PAN_SENSITIVITY = 0.095;
export const CHART_RIGHT_GAP_SLOTS = 6;
export const CHART_PRICE_SCALE_TEXT_RIGHT_INSET = 4;
export const CHART_SCALE_TAG_HEIGHT = 16;
export const CHART_SCALE_TAG_GAP = 3;
export const CHART_MARKER_DOT_RADIUS = 4;
export const CHART_MARKER_STACK_OFFSET = 9;
export const CHART_MARKER_POSITIVE_COLOR = '#00c17a';
export const CHART_MARKER_NEGATIVE_COLOR = '#bb3b51';
export const CHART_MARKER_OPEN_FILL = 'rgba(171, 205, 255, 0.95)';
export const CHART_MARKER_OPEN_STROKE = '#0066ff';
export const CHART_PAN_TO_LIVE_MIN_MS = 220;
export const CHART_PAN_TO_LIVE_MAX_MS = 620;
export const SKELETON_CANDLE_COUNT = 72;
export const SKELETON_PRICE_LABEL_WIDTHS: readonly number[] = [34, 30, 36, 31, 35];
export const SKELETON_TIME_LABEL_WIDTHS: readonly number[] = [64, 76, 72, 68, 74];

export const SKELETON_RIGHT_GAP_RATIO =
  CHART_RIGHT_GAP_SLOTS / (SKELETON_CANDLE_COUNT + CHART_RIGHT_GAP_SLOTS);

export interface SkeletonCandle {
  wickTop: number;
  wickHeight: number;
  bodyTop: number;
  bodyHeight: number;
  isBull: boolean;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const createDeterministicRng = (seed = 17) => {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
};

const driftByIndex = (index: number): number => {
  if (index < 10) return 0.05;
  if (index < 20) return -0.04;
  if (index < 30) return 0.03;
  if (index < 40) return -0.05;
  if (index < 50) return 0.04;
  if (index < 61) return -0.03;
  return 0.02;
};

export const SKELETON_CANDLE_MODEL: readonly SkeletonCandle[] = (() => {
  const rng = createDeterministicRng(79);
  const candles: Array<{ open: number; high: number; low: number; close: number }> = [];
  let price = 104;
  const meanPriceAnchor = 104;
  let lastDirection = 0;
  let sameDirectionStreak = 0;

  for (let index = 0; index < SKELETON_CANDLE_COUNT; index += 1) {
    const open = price;
    const phaseVolBoost =
      (index >= 14 && index <= 24) || (index >= 52 && index <= 64) ? 0.22 : 0;
    const volatility = 0.26 + phaseVolBoost;
    const drift = driftByIndex(index);
    const meanReversion = (meanPriceAnchor - open) * 0.035;
    const noise = (rng() - 0.5) * 2;
    let move = drift + meanReversion + noise * volatility;

    if (lastDirection !== 0 && Math.sign(move) === lastDirection && sameDirectionStreak >= 4) {
      // Force periodic pullbacks so skeleton does not trend one-way for too long.
      move = move * 0.2 - lastDirection * (0.06 + rng() * 0.1);
    }

    move = clamp(move, -0.62, 0.62);
    const close = open + move;
    const direction = close > open ? 1 : close < open ? -1 : 0;
    if (direction === 0) {
      sameDirectionStreak = Math.max(0, sameDirectionStreak - 1);
    } else if (direction === lastDirection) {
      sameDirectionStreak += 1;
    } else {
      sameDirectionStreak = 1;
      lastDirection = direction;
    }

    const wickNoiseUp = 0.04 + rng() * 0.14;
    const wickNoiseDown = 0.04 + rng() * 0.14;
    let high = Math.max(open, close) + wickNoiseUp;
    let low = Math.min(open, close) - wickNoiseDown;

    // Keep occasional wick extensions very small to reduce noise.
    if (index === 58) {
      const spikeScale = 0.1 + rng() * 0.1;
      if (rng() > 0.45) {
        low -= spikeScale;
      } else {
        high += spikeScale;
      }
    }

    candles.push({ open, high, low, close });
    price = close;
  }

  const minPrice = Math.min(...candles.map((item) => item.low));
  const maxPrice = Math.max(...candles.map((item) => item.high));
  const priceRange = Math.max(1e-6, maxPrice - minPrice);
  const topPad = 4;
  const bottomPad = 96;
  const usableHeight = bottomPad - topPad;
  const yFromPrice = (value: number): number =>
    topPad + ((maxPrice - value) / priceRange) * usableHeight;

  return candles.map((item) => {
    const wickTop = clamp(yFromPrice(item.high), 3, 95);
    const wickBottom = clamp(yFromPrice(item.low), wickTop + 1.8, 97);
    const openY = clamp(yFromPrice(item.open), wickTop + 0.8, wickBottom - 0.8);
    const closeY = clamp(yFromPrice(item.close), wickTop + 0.8, wickBottom - 0.8);
    const bodyTopRaw = Math.min(openY, closeY);
    const bodyBottomRaw = Math.max(openY, closeY);
    const minBody = 1.8;
    const bodyBottom =
      bodyBottomRaw - bodyTopRaw < minBody
        ? Math.min(wickBottom - 0.6, bodyTopRaw + minBody)
        : bodyBottomRaw;
    const bodyTop = clamp(bodyTopRaw, wickTop + 0.2, bodyBottom - 0.2);

    return {
      wickTop: Number(wickTop.toFixed(2)),
      wickHeight: Number((wickBottom - wickTop).toFixed(2)),
      bodyTop: Number(bodyTop.toFixed(2)),
      bodyHeight: Number((bodyBottom - bodyTop).toFixed(2)),
      isBull: item.close >= item.open,
    };
  });
})();
