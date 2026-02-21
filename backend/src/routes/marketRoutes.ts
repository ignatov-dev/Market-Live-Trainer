import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

interface Candle {
  index: number;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface NewsItem {
  id: string;
  title: string;
  summary: string;
  timestamp: number;
  link: string | null;
  proofImageLink: string | null;
}

const COINBASE_BATCH_SIZE = 300;
const COINBASE_MAX_REQUESTS = 20;
const MIN_CANDLES_REQUIRED = 80;
const MAX_NEWS_ITEMS = 10;

const timeframeConfig: Record<string, { bucketMs: number; restGranularitySeconds: number }> = {
  '1m': { bucketMs: 60 * 1000, restGranularitySeconds: 60 },
  '15m': { bucketMs: 15 * 60 * 1000, restGranularitySeconds: 900 },
  '1h': { bucketMs: 60 * 60 * 1000, restGranularitySeconds: 3600 },
  '1d': { bucketMs: 24 * 60 * 60 * 1000, restGranularitySeconds: 86400 },
  '1w': { bucketMs: 7 * 24 * 60 * 60 * 1000, restGranularitySeconds: 86400 },
};

const candlesQuerySchema = z.object({
  productId: z.string().regex(/^[A-Z0-9]+-[A-Z0-9]+$/),
  timeframeId: z.enum(['1m', '15m', '1h', '1d', '1w']),
});

const newsQuerySchema = z
  .object({
    coinId: z.string().optional(),
    coinPaprikaId: z.string().optional(),
    limit: z.coerce.number().int().positive().max(100).optional().default(30),
  })
  .refine((value) => {
    const coinId = (value.coinId ?? value.coinPaprikaId ?? '').trim();
    return coinId.length > 0;
  }, {
    message: 'coinId (or coinPaprikaId) is required',
    path: ['coinId'],
  });

function getBucketStartTs(timestampMs: number, timeframeId: string): number | null {
  if (!Number.isFinite(timestampMs)) {
    return null;
  }

  if (timeframeId === '1w') {
    const date = new Date(timestampMs);
    const dayFromMonday = (date.getUTCDay() + 6) % 7;
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() - dayFromMonday);
    return date.getTime();
  }

  const timeframe = timeframeConfig[timeframeId];
  if (!timeframe) {
    return null;
  }

  return Math.floor(timestampMs / timeframe.bucketMs) * timeframe.bucketMs;
}

function aggregateCandlesByTimeframe(candles: Candle[], timeframeId: string): Candle[] {
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

    const previous = aggregated[aggregated.length - 1];
    if (!previous || previous.timestamp !== bucketStart) {
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

    previous.high = Math.max(previous.high, candle.high);
    previous.low = Math.min(previous.low, candle.low);
    previous.close = candle.close;
    previous.volume += candle.volume;
  }

  return aggregated.map((item, index) => ({ ...item, index }));
}

async function fetchCoinbaseCandles(productId: string, timeframeId: string): Promise<Candle[]> {
  const timeframe = timeframeConfig[timeframeId];
  const requestGranularitySeconds = timeframe.restGranularitySeconds;
  const candles: Candle[] = [];
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

    const payload = (await response.json()) as unknown;
    if (!Array.isArray(payload)) {
      throw new Error('Unexpected Coinbase candles response.');
    }

    const batch = payload
      .filter((row): row is unknown[] => Array.isArray(row) && row.length >= 6)
      .map((row) => ({
        index: 0,
        timestamp: Number(row[0]) * 1000,
        low: Number(row[1]),
        high: Number(row[2]),
        open: Number(row[3]),
        close: Number(row[4]),
        volume: Number(row[5]),
      }))
      .filter(
        (item) =>
          Number.isFinite(item.timestamp)
          && Number.isFinite(item.low)
          && Number.isFinite(item.high)
          && Number.isFinite(item.open)
          && Number.isFinite(item.close)
          && Number.isFinite(item.volume),
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

  const deduped: Candle[] = [];
  for (const candle of candles) {
    const previous = deduped[deduped.length - 1];
    if (previous && previous.timestamp === candle.timestamp) {
      continue;
    }
    deduped.push(candle);
  }

  let normalized = deduped.map((item, index) => ({
    ...item,
    index,
  }));

  if (timeframeId === '1w') {
    normalized = aggregateCandlesByTimeframe(normalized, '1w');
  }

  if (normalized.length < MIN_CANDLES_REQUIRED) {
    throw new Error(`Not enough candles returned (${normalized.length}).`);
  }

  return normalized;
}

function sanitizeNewsText(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }

  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function clampNewsText(value: string, maxLength = 240): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1).trimEnd()}...`;
}

function normalizeCoinPaprikaEvents(payload: unknown): NewsItem[] {
  if (!Array.isArray(payload)) {
    return [];
  }

  const normalized = payload
    .map((item, index) => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const raw = item as Record<string, unknown>;
      const title = sanitizeNewsText(raw.name ?? raw.title ?? raw.type ?? '');
      if (!title) {
        return null;
      }

      const summaryRaw = sanitizeNewsText(raw.description ?? raw.proof ?? '');
      const dateString = raw.date ?? raw.created_at ?? raw.start_date ?? '';
      const parsedTs = Date.parse(String(dateString));
      const link = typeof raw.link === 'string' && raw.link.startsWith('http') ? raw.link : null;
      const proofImageLink =
        typeof raw.proof_image_link === 'string' && raw.proof_image_link.startsWith('http')
          ? raw.proof_image_link
          : null;

      return {
        id: String(raw.id ?? `${title}-${index}`),
        title,
        summary: summaryRaw ? clampNewsText(summaryRaw, 220) : 'No extra details provided.',
        timestamp: Number.isFinite(parsedTs) ? parsedTs : 0,
        link,
        proofImageLink,
      } satisfies NewsItem;
    })
    .filter((item): item is NewsItem => item !== null);

  normalized.sort((left, right) => right.timestamp - left.timestamp);
  return normalized.slice(0, MAX_NEWS_ITEMS);
}

async function fetchCoinPaprikaEvents(coinPaprikaId: string, limit: number): Promise<NewsItem[]> {
  const params = new URLSearchParams({
    limit: String(limit),
  });

  const response = await fetch(`https://api.coinpaprika.com/v1/coins/${coinPaprikaId}/events?${params.toString()}`, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`CoinPaprika HTTP ${response.status}`);
  }

  const payload = (await response.json()) as unknown;
  return normalizeCoinPaprikaEvents(payload);
}

export function registerMarketRoutes(app: FastifyInstance): void {
  const handleCandlesRequest = async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = candlesQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    try {
      const candles = await fetchCoinbaseCandles(parsed.data.productId, parsed.data.timeframeId);
      return reply.send({ data: candles });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch candles.';
      return reply.code(502).send({ error: message });
    }
  };

  const handleNewsRequest = async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = newsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const coinId = (parsed.data.coinId ?? parsed.data.coinPaprikaId ?? '').trim();

    try {
      const news = await fetchCoinPaprikaEvents(coinId, parsed.data.limit);
      return reply.send({ data: news });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch news.';
      return reply.code(502).send({ error: message });
    }
  };

  app.get('/api/candles', handleCandlesRequest);
  app.get('/candles', handleCandlesRequest);
  app.get('/api/market/candles', handleCandlesRequest);
  app.get('/api/news', handleNewsRequest);
  app.get('/news', handleNewsRequest);
  app.get('/api/market/news', handleNewsRequest);
}
