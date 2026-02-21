import type { Pair, Timeframe } from '../types/domain';

export const PAIRS: readonly Pair[] = [
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

export const TIMEFRAMES: readonly Timeframe[] = [
  { id: '1m', label: '1M', bucketMs: 60 * 1000, restGranularitySeconds: 60 },
  { id: '15m', label: '15M', bucketMs: 15 * 60 * 1000, restGranularitySeconds: 900 },
  { id: '1h', label: '1H', bucketMs: 60 * 60 * 1000, restGranularitySeconds: 3600 },
  { id: '1d', label: '1D', bucketMs: 24 * 60 * 60 * 1000, restGranularitySeconds: 86400 },
  { id: '1w', label: '1W', bucketMs: 7 * 24 * 60 * 60 * 1000, restGranularitySeconds: 86400 },
];

export const ORDER_TYPE_TABS: readonly { value: string; label: string }[] = [
  { value: 'market', label: 'Market' },
  { value: 'limit', label: 'Limit' },
];

export const PRODUCT_TO_PAIR: Record<string, string> = Object.fromEntries(
  PAIRS.map((item) => [item.coinbaseProduct, item.id]),
);

export const PAIR_TO_PRODUCT: Record<string, string> = Object.fromEntries(
  PAIRS.map((item) => [item.id, item.coinbaseProduct]),
);

export const NEWS_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
export const MAX_NEWS_ITEMS = 10;
