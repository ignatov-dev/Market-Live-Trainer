import { TIMEFRAMES, PAIRS } from '../../../constants/market';
import { MIN_CHART_VIEW_SIZE, MAX_CHART_VIEW_SIZE } from '../chartConstants';
import { MAX_STORED_CANDLES, MAX_TIMELINE_ITEMS } from '../../../constants/trading';
import type { Candle, Timeframe, TimelineEvent } from '../../../types/domain';

export function getTimeframeById(timeframeId: string): Timeframe {
  return TIMEFRAMES.find((item) => item.id === timeframeId) ?? TIMEFRAMES[1]!;
}

export function clampChartViewSize(value: number): number {
  return Math.min(MAX_CHART_VIEW_SIZE, Math.max(MIN_CHART_VIEW_SIZE, value));
}

export function easeOutCubic(progress: number): number {
  return 1 - (1 - progress) ** 3;
}

export function getBucketStartTs(timestampMs: number, timeframeId: string): number | null {
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

export function reindexCandles(candles: Candle[]): Candle[] {
  return candles.map((item, index) => ({ ...item, index }));
}

export function aggregateCandlesByTimeframe(candles: Candle[], timeframeId: string): Candle[] {
  if (!Array.isArray(candles) || candles.length === 0) {
    return [];
  }

  const sorted = [...candles].sort((left, right) => left.timestamp - right.timestamp);
  const aggregated: Candle[] = [];

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

export interface LiveTick {
  price: number | string;
  size?: number | string;
  timestamp: number | string;
}

export function applyLiveTickToCandles(
  candles: Candle[],
  tick: LiveTick,
  timeframeId: string,
): Candle[] {
  const tradePrice = Number(tick.price);
  const tradeSize = Number(tick.size ?? 0);
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

  const last = candles[candles.length - 1]!;

  if (bucketStart < last.timestamp) {
    let targetIndex = -1;
    for (let i = candles.length - 1; i >= 0; i -= 1) {
      if (candles[i]!.timestamp === bucketStart) {
        targetIndex = i;
        break;
      }
      if (candles[i]!.timestamp < bucketStart) {
        break;
      }
    }

    if (targetIndex === -1) {
      return candles;
    }

    const target = candles[targetIndex]!;
    const updated: Candle = {
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
    const updatedLast: Candle = {
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

export function getLatestMarksByPair(datasets: Record<string, Candle[]>): Record<string, number> {
  const marks: Record<string, number> = {};
  for (const pairMeta of PAIRS) {
    const series = Array.isArray(datasets?.[pairMeta.id]) ? datasets[pairMeta.id]! : [];
    const lastCandle = series[series.length - 1];
    const mark = Number(lastCandle?.close);
    if (Number.isFinite(mark) && mark > 0) {
      marks[pairMeta.id] = mark;
    }
  }
  return marks;
}

export function buildTimelineEvent(index: number, timestamp: number, text: string): TimelineEvent {
  return {
    id: `${index}-${timestamp}-${Math.random().toString(36).slice(2, 8)}`,
    index,
    timestamp,
    text,
  };
}

export function trimTimeline(timeline: TimelineEvent[]): TimelineEvent[] {
  if (timeline.length <= MAX_TIMELINE_ITEMS) {
    return timeline;
  }
  return timeline.slice(timeline.length - MAX_TIMELINE_ITEMS);
}

export function appendTimeline<T extends { timeline: TimelineEvent[] }>(
  session: T,
  event: TimelineEvent,
): T {
  return {
    ...session,
    timeline: trimTimeline([...session.timeline, event]),
  };
}
