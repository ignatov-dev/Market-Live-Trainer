import {
  PATTERN_SMALL_BODY_RATIO,
  PATTERN_DOJI_BODY_RATIO,
  PATTERN_LONG_SHADOW_RATIO,
  PATTERN_SHORT_SHADOW_RATIO,
  PATTERN_BODY_TOP_MIN_RATIO,
  PATTERN_BODY_BOTTOM_MAX_RATIO,
  PATTERN_DOJI_MIN_SHADOW_RATIO,
} from '../../../constants/trading';
import { fmtNumber } from '../../../utils/formatters';
import type { Candle } from '../../../types/domain';

export interface PatternResult {
  patternName: string;
  description: string;
}

interface PatternRatios {
  bodyRatio: number;
  upperRatio: number;
  lowerRatio: number;
  locationRatio: number;
}

export function describePatternFromRatios(
  { bodyRatio, upperRatio, lowerRatio, locationRatio }: PatternRatios,
  patternName: string,
): string {
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

export function detectSingleCandlePattern(candle: Candle): PatternResult | null {
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
      description: describePatternFromRatios(
        { bodyRatio, upperRatio, lowerRatio, locationRatio: 0 },
        'Doji',
      ),
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

export function getAverageRange(candles: Candle[], index: number, window = 14): number {
  const start = Math.max(0, index - window);
  const subset = candles.slice(start, index + 1);
  if (subset.length === 0) {
    return 0;
  }
  return subset.reduce((sum, candle) => sum + (candle.high - candle.low), 0) / subset.length;
}
