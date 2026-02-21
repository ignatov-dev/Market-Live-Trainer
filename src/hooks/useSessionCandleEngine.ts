import { useEffect, useRef } from 'react';
import { PAIRS } from '../constants/market';
import { getLatestMarksByPair } from '../components/CandleChart/utils/candles';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { setSession } from '../store/slices/sessionSlice';
import type { Candle, Datasets } from '../types/domain';
import { evaluatePendingOrders, getUnrealizedPnl } from '../utils/trading';

interface Params {
  datasets: Datasets;
  timeframeId: string;
  pair: string;
}

export function useSessionCandleEngine({ datasets, timeframeId, pair }: Params): void {
  const dispatch = useAppDispatch();
  const session = useAppSelector((s) => s.session.session);
  const sessionRef = useRef(session);
  const processedSessionCandleTsRef = useRef<Record<string, number>>({});
  sessionRef.current = session;

  useEffect(() => {
    const changedPairs: Array<{
      pairId: string;
      liveCandle: Candle;
      key: string;
      ts: number;
    }> = [];

    for (const pairMetaItem of PAIRS) {
      const series = datasets[pairMetaItem.id] ?? [];
      if (!Array.isArray(series) || series.length === 0) {
        continue;
      }

      const liveCandle = series[series.length - 1]!;
      const key = `${pairMetaItem.id}:${timeframeId}`;
      const previousTs = processedSessionCandleTsRef.current[key];
      const currentTs = Number(liveCandle.timestamp);

      if (!Number.isFinite(currentTs)) {
        continue;
      }

      if (previousTs !== currentTs) {
        changedPairs.push({ pairId: pairMetaItem.id, liveCandle, key, ts: currentTs });
      }
    }

    if (changedPairs.length === 0) {
      return;
    }

    const marks = getLatestMarksByPair(datasets);
    let next = sessionRef.current;
    let changed = false;

    for (const item of changedPairs) {
      const afterPending = evaluatePendingOrders(next, item.liveCandle, item.pairId, marks);
      if (afterPending !== next) {
        next = afterPending;
        changed = true;
      }

      if (item.pairId === pair && next.replayIndex !== item.liveCandle.index) {
        next = { ...next, replayIndex: item.liveCandle.index };
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
      next = { ...next, equityHistory: nextHistory };
      changed = true;
    }

    if (changed) {
      dispatch(setSession(next));
    }

    for (const item of changedPairs) {
      processedSessionCandleTsRef.current[item.key] = item.ts;
    }
  }, [datasets, dispatch, pair, timeframeId]);
}
