import { useCallback, useEffect, useRef } from 'react';
import {
  ENABLE_PATTERN_NOTIFICATIONS,
  MAX_PATTERN_NOTIFICATIONS,
  PATTERN_NOTIFICATION_TTL_MS,
} from '../constants/trading';
import { detectSingleCandlePattern } from '../components/CandleChart/utils/patterns';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import {
  addPatternNotification,
  dismissPatternNotification as dismissNotificationAction,
} from '../store/slices/sessionSlice';
import type { Candle, PatternNotification } from '../types/domain';

interface Params {
  candles: Candle[];
  pair: string;
  timeframeId: string;
  symbol: string;
}

interface Result {
  patternNotifications: PatternNotification[];
  dismissPatternNotification: (notificationId: string) => void;
  clearPatternNotificationTimers: () => void;
}

export function usePatternNotifications({
  candles,
  pair,
  timeframeId,
  symbol,
}: Params): Result {
  const dispatch = useAppDispatch();
  const patternNotifications = useAppSelector((s) => s.session.patternNotifications);
  const patternNotificationTimersRef = useRef<Map<string, number>>(new Map());
  const processedPatternCandleTsRef = useRef<Record<string, number | null>>({});

  const clearPatternNotificationTimers = useCallback(() => {
    for (const timeoutId of patternNotificationTimersRef.current.values()) {
      window.clearTimeout(timeoutId);
    }
    patternNotificationTimersRef.current.clear();
  }, []);

  const dismissPatternNotification = useCallback(
    (notificationId: string) => {
      const timer = patternNotificationTimersRef.current.get(notificationId);
      if (timer !== undefined) {
        window.clearTimeout(timer);
        patternNotificationTimersRef.current.delete(notificationId);
      }
      dispatch(dismissNotificationAction(notificationId));
    },
    [dispatch],
  );

  const emitPatternNotification = useCallback(
    (payload: {
      patternName: string;
      timestamp: number;
      symbol: string;
      description: string;
    }) => {
      if (!ENABLE_PATTERN_NOTIFICATIONS) {
        return;
      }

      const id = `${payload.timestamp}-${payload.patternName}-${Math.random().toString(36).slice(2, 8)}`;
      const notification: PatternNotification = {
        id,
        pattern: payload.patternName,
        description: payload.description,
        ts: Date.now(),
        candleTs: payload.timestamp,
      };

      // Clear timers for notifications that will be dropped due to overflow.
      const willDrop = [notification, ...patternNotifications].slice(MAX_PATTERN_NOTIFICATIONS);
      for (const item of willDrop) {
        const timer = patternNotificationTimersRef.current.get(item.id);
        if (timer !== undefined) {
          window.clearTimeout(timer);
          patternNotificationTimersRef.current.delete(item.id);
        }
      }

      dispatch(addPatternNotification(notification));

      const timeoutId = window.setTimeout(() => {
        dismissPatternNotification(id);
      }, PATTERN_NOTIFICATION_TTL_MS);
      patternNotificationTimersRef.current.set(id, timeoutId);

      window.dispatchEvent(
        new CustomEvent('pattern-detected', {
          detail: {
            patternName: payload.patternName,
            timestamp: payload.timestamp,
            symbol: payload.symbol,
            description: payload.description,
          },
        }),
      );
    },
    [dismissPatternNotification, dispatch, patternNotifications],
  );

  useEffect(() => {
    if (patternNotifications.length !== 0) {
      return;
    }
    clearPatternNotificationTimers();
  }, [clearPatternNotificationTimers, patternNotifications.length]);

  useEffect(() => {
    const streamKey = `${pair}:${timeframeId}`;
    if (candles.length < 2) {
      processedPatternCandleTsRef.current[streamKey] = null;
      return;
    }

    const closedCandles = candles.slice(0, -1);
    const latestClosed = closedCandles[closedCandles.length - 1]!;
    const latestClosedTs = Number(latestClosed.timestamp);
    if (!Number.isFinite(latestClosedTs)) {
      return;
    }

    const previousProcessed = processedPatternCandleTsRef.current[streamKey];
    if (!Number.isFinite(previousProcessed) || (previousProcessed as number) > latestClosedTs) {
      processedPatternCandleTsRef.current[streamKey] = latestClosedTs;
      return;
    }

    const newlyClosed = closedCandles.filter(
      (candle) => candle.timestamp > (previousProcessed as number),
    );
    if (newlyClosed.length === 0) {
      return;
    }

    for (const closedCandle of newlyClosed) {
      const match = detectSingleCandlePattern(closedCandle);
      if (!match) {
        continue;
      }

      emitPatternNotification({
        patternName: match.patternName,
        timestamp: closedCandle.timestamp,
        symbol,
        description: match.description,
      });
    }

    processedPatternCandleTsRef.current[streamKey] =
      newlyClosed[newlyClosed.length - 1]!.timestamp;
  }, [candles, emitPatternNotification, pair, symbol, timeframeId]);

  useEffect(() => clearPatternNotificationTimers, [clearPatternNotificationTimers]);

  return {
    patternNotifications,
    dismissPatternNotification,
    clearPatternNotificationTimers,
  };
}
