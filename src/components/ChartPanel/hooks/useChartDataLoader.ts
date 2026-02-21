import { useEffect, useRef } from 'react';
import { NEWS_REFRESH_INTERVAL_MS } from '../../../constants/market';
import { fetchCoinbaseCandles } from '../../../services/candleService';
import { fetchCoinPaprikaEvents } from '../../../services/newsService';
import { useAppDispatch } from '../../../store/hooks';
import {
  mergePairCandles,
  mergePairNews,
  setLoadingData,
  setLoadingNews,
  setNewsStatus,
} from '../../../store/slices/chartSlice';
import type { Candle } from '../../../types/domain';

interface Params {
  pair: string;
  timeframeId: string;
  coinbaseProduct: string;
  coinPaprikaId: string;
  pairLabel: string;
}

export function useChartDataLoader({
  pair,
  timeframeId,
  coinbaseProduct,
  coinPaprikaId,
  pairLabel,
}: Params): void {
  const dispatch = useAppDispatch();
  const coinbaseCacheRef = useRef<Record<string, Candle[]>>({});
  const newsCacheRef = useRef<Record<string, { title: string; timestamp: string; id: string }[]>>(
    {},
  );

  useEffect(() => {
    let isCancelled = false;

    async function loadCandles() {
      const cacheKey = `coinbase:${pair}:${timeframeId}`;
      const cached = coinbaseCacheRef.current[cacheKey];
      if (cached) {
        dispatch(mergePairCandles({ pairId: pair, candles: cached }));
        return;
      }

      dispatch(setLoadingData(true));

      try {
        const loaded = await fetchCoinbaseCandles(coinbaseProduct, timeframeId);
        if (isCancelled) {
          return;
        }

        coinbaseCacheRef.current[cacheKey] = loaded;
        dispatch(mergePairCandles({ pairId: pair, candles: loaded }));
      } catch (error) {
        if (isCancelled) {
          return;
        }
        console.error('Failed to load chart candles', error);
      } finally {
        if (!isCancelled) {
          dispatch(setLoadingData(false));
        }
      }
    }

    void loadCandles();

    return () => {
      isCancelled = true;
    };
  }, [coinbaseProduct, dispatch, pair, timeframeId]);

  useEffect(() => {
    let isCancelled = false;
    let refreshTimer: number | null = null;
    let isFetching = false;
    let controller: AbortController | null = null;

    const cacheKey = `coinpaprika:${coinPaprikaId}`;
    const cached = newsCacheRef.current[cacheKey];

    if (cached) {
      dispatch(mergePairNews({ pairId: pair, items: cached }));
      dispatch(setNewsStatus(`Pair events from backend (${cached.length} items).`));
      dispatch(setLoadingNews(false));
    }

    async function loadEvents(silent = false) {
      if (isCancelled || isFetching) {
        return;
      }

      isFetching = true;
      if (!silent && !cached) {
        dispatch(setLoadingNews(true));
        dispatch(setNewsStatus(`Loading ${pairLabel} events from backend...`));
      }

      if (controller) {
        controller.abort();
      }
      controller = new AbortController();

      try {
        const events = await fetchCoinPaprikaEvents(coinPaprikaId, controller.signal);
        if (isCancelled) {
          return;
        }

        newsCacheRef.current[cacheKey] = events;
        dispatch(mergePairNews({ pairId: pair, items: events }));

        if (events.length === 0) {
          dispatch(setNewsStatus(`No recent ${pairLabel} events.`));
        } else {
          dispatch(setNewsStatus(`Pair events from backend (${events.length} items).`));
        }
      } catch (error) {
        if (isCancelled || (error instanceof Error && error.name === 'AbortError')) {
          return;
        }

        const reason = error instanceof Error ? error.message : String(error);
        dispatch(setNewsStatus(`Pair events failed (${reason}).`));
      } finally {
        if (!isCancelled) {
          dispatch(setLoadingNews(false));
        }
        isFetching = false;
      }
    }

    void loadEvents();
    refreshTimer = window.setInterval(() => {
      void loadEvents(true);
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
  }, [coinPaprikaId, dispatch, pair, pairLabel]);
}
