import { useCallback, useRef } from 'react';
import { closePosition as closePositionLocal } from '../../../utils/trading';
import { useAppDispatch, useAppSelector } from '../../../store/hooks';
import { setSession } from '../../../store/slices/sessionSlice';
import type { Candle } from '../../../types/domain';

interface OpenPositionsController {
  closePositionNow: (positionId: number) => void;
}

export function useOpenPositionsController(): OpenPositionsController {
  const dispatch = useAppDispatch();
  const session = useAppSelector((s) => s.session.session);
  const datasets = useAppSelector((s) => s.chart.datasets);
  const sessionRef = useRef(session);
  const datasetsRef = useRef(datasets);
  sessionRef.current = session;
  datasetsRef.current = datasets;

  const closePositionNow = useCallback(
    (positionId: number) => {
      const currentSession = sessionRef.current;
      const position = currentSession.positions.find((item) => item.id === positionId);
      if (!position) {
        return;
      }

      const series = datasetsRef.current[position.pair] ?? [];
      const closeCandle: Candle =
        Array.isArray(series) && series.length > 0
          ? series[series.length - 1]!
          : {
              index: currentSession.replayIndex,
              timestamp: Date.now(),
              open: position.entryPrice,
              high: position.entryPrice,
              low: position.entryPrice,
              close: position.entryPrice,
              volume: 0,
            };

      const nextSession = closePositionLocal(
        currentSession,
        closeCandle,
        positionId,
        'manual close',
      );
      dispatch(setSession(nextSession));
    },
    [dispatch],
  );

  return {
    closePositionNow,
  };
}
