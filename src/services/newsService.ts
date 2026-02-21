import { MAX_NEWS_ITEMS } from '../constants/market';
import { buildApiUrl } from './candleService';
import type { NewsItem } from '../types/domain';

export async function fetchCoinPaprikaEvents(
  coinPaprikaId: string,
  signal?: AbortSignal,
): Promise<NewsItem[]> {
  const params = new URLSearchParams({
    coinId: coinPaprikaId,
    limit: '30',
  });

  const response = await fetch(buildApiUrl(`/api/news?${params.toString()}`), {
    headers: { Accept: 'application/json' },
    signal,
  });

  if (!response.ok) {
    throw new Error(`Backend news HTTP ${response.status}`);
  }

  const payload: unknown = await response.json();
  const data = Array.isArray((payload as Record<string, unknown>)?.data)
    ? (payload as { data: unknown[] }).data
    : null;
  if (!data) {
    throw new Error('Unexpected backend news response.');
  }

  return data
    .map((item, index) => {
      const row = item as Record<string, unknown>;
      return {
        id: String(row['id'] ?? `news-${index}`),
        title: typeof row['title'] === 'string' ? row['title'] : '',
        summary: typeof row['summary'] === 'string' ? row['summary'] : '',
        timestamp: String(Number(row['timestamp'])),
        link: typeof row['link'] === 'string' ? row['link'] : undefined,
      } satisfies NewsItem;
    })
    .filter((item) => item.title.length > 0)
    .slice(0, MAX_NEWS_ITEMS);
}
