import {
  COINBASE_BATCH_SIZE,
  COINBASE_MAX_REQUESTS,
  MIN_CANDLES_REQUIRED,
} from '../constants/trading';
import {
  getTimeframeById,
  aggregateCandlesByTimeframe,
} from '../components/CandleChart/utils/candles';
import type { Candle } from '../types/domain';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').trim();

export function buildApiUrl(path: string): string {
  if (API_BASE_URL.length > 0) {
    return `${API_BASE_URL}${path}`;
  }
  return path;
}

export async function fetchCoinbaseCandlesDirect(
  productId: string,
  timeframeId: string,
): Promise<Candle[]> {
  const timeframe = getTimeframeById(timeframeId);
  const requestGranularitySeconds = timeframe.restGranularitySeconds;
  const candles: Omit<Candle, 'index'>[] = [];
  let cursorEndMs = Date.now();

  for (let i = 0; i < COINBASE_MAX_REQUESTS; i += 1) {
    const cursorStartMs =
      cursorEndMs - COINBASE_BATCH_SIZE * requestGranularitySeconds * 1000;

    const params = new URLSearchParams({
      granularity: String(requestGranularitySeconds),
      start: new Date(cursorStartMs).toISOString(),
      end: new Date(cursorEndMs).toISOString(),
    });

    const response = await fetch(
      `https://api.exchange.coinbase.com/products/${productId}/candles?${params.toString()}`,
      { headers: { Accept: 'application/json' } },
    );

    if (!response.ok) {
      throw new Error(`Coinbase HTTP ${response.status}`);
    }

    const payload: unknown = await response.json();
    if (!Array.isArray(payload)) {
      throw new Error('Unexpected Coinbase candles response.');
    }

    const batch = (payload as unknown[])
      .filter((row): row is unknown[] => Array.isArray(row) && row.length >= 6)
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

  const deduped: typeof candles = [];
  for (const candle of candles) {
    const prev = deduped[deduped.length - 1];
    if (prev && prev.timestamp === candle.timestamp) {
      continue;
    }
    deduped.push(candle);
  }

  let normalized: Candle[] = deduped.map((item, index) => ({
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

export async function fetchCoinbaseCandles(
  productId: string,
  timeframeId: string,
): Promise<Candle[]> {
  try {
    const params = new URLSearchParams({ productId, timeframeId });

    const response = await fetch(
      buildApiUrl(`/api/candles?${params.toString()}`),
      { headers: { Accept: 'application/json' } },
    );

    if (!response.ok) {
      throw new Error(`Backend candles HTTP ${response.status}`);
    }

    const payload: unknown = await response.json();
    const data = Array.isArray((payload as Record<string, unknown>)?.data)
      ? (payload as { data: unknown[] }).data
      : null;
    if (!data) {
      throw new Error('Unexpected backend candles response.');
    }

    return data
      .map((item, index) => {
        const row = item as Record<string, unknown>;
        return {
          index: Number.isFinite(Number(row['index'])) ? Number(row['index']) : index,
          timestamp: Number(row['timestamp']),
          open: Number(row['open']),
          high: Number(row['high']),
          low: Number(row['low']),
          close: Number(row['close']),
          volume: Number(row['volume']),
        };
      })
      .filter(
        (item) =>
          Number.isFinite(item.timestamp) &&
          Number.isFinite(item.open) &&
          Number.isFinite(item.high) &&
          Number.isFinite(item.low) &&
          Number.isFinite(item.close) &&
          Number.isFinite(item.volume),
      )
      .map((item, index) => ({ ...item, index }));
  } catch (backendError) {
    console.warn(
      'Backend candle endpoint failed, falling back to direct Coinbase fetch.',
      backendError,
    );
    return fetchCoinbaseCandlesDirect(productId, timeframeId);
  }
}
