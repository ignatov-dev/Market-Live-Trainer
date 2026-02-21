import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { PRODUCT_TO_PAIR } from '../constants/market';
import { backendMarketWsUrl } from '../integration/positionsApi';
import { usePositionEvents } from '../integration/usePositionEvents';
import { usePositionPnlEvents } from '../integration/usePositionPnlEvents';
import { useAccountEvents } from '../integration/useAccountEvents';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { mergePairCandles } from '../store/slices/chartSlice';
import type { Datasets } from '../types/domain';
import { applyLiveTickToCandles } from '../components/CandleChart/utils/candles';
import type { PositionClosedEvent, PositionCreatedEvent } from '../integration/usePositionEvents';
import type { PositionPnlEvent } from '../integration/usePositionPnlEvents';
import type { AccountBalanceEvent } from '../integration/useAccountEvents';

interface WebsocketContextValue {
  subscribeClosedEvents: (listener: (event: PositionClosedEvent) => void) => () => void;
  subscribeCreatedEvents: (listener: (event: PositionCreatedEvent) => void) => () => void;
  subscribePnlEvents: (listener: (event: PositionPnlEvent) => void) => () => void;
  subscribeAccountEvents: (listener: (event: AccountBalanceEvent) => void) => () => void;
}

const WebsocketContext = createContext<WebsocketContextValue | null>(null);

export function WebsocketProvider({ children }: { children: ReactNode }) {
  const dispatch = useAppDispatch();
  const backendAuthToken = useAppSelector((s) => s.auth.backendAuthToken);
  const datasets = useAppSelector((s) => s.chart.datasets);
  const timeframeId = useAppSelector((s) => s.chart.timeframeId);
  const isLoadingData = useAppSelector((s) => s.chart.isLoadingData);

  const datasetsRef = useRef<Datasets>(datasets);
  const closedListenersRef = useRef(new Set<(event: PositionClosedEvent) => void>());
  const createdListenersRef = useRef(new Set<(event: PositionCreatedEvent) => void>());
  const pnlListenersRef = useRef(new Set<(event: PositionPnlEvent) => void>());
  const accountListenersRef = useRef(new Set<(event: AccountBalanceEvent) => void>());
  datasetsRef.current = datasets;

  const subscribeClosedEvents = useCallback((listener: (event: PositionClosedEvent) => void) => {
    closedListenersRef.current.add(listener);
    return () => {
      closedListenersRef.current.delete(listener);
    };
  }, []);

  const subscribeCreatedEvents = useCallback((listener: (event: PositionCreatedEvent) => void) => {
    createdListenersRef.current.add(listener);
    return () => {
      createdListenersRef.current.delete(listener);
    };
  }, []);

  const subscribePnlEvents = useCallback((listener: (event: PositionPnlEvent) => void) => {
    pnlListenersRef.current.add(listener);
    return () => {
      pnlListenersRef.current.delete(listener);
    };
  }, []);

  const subscribeAccountEvents = useCallback((listener: (event: AccountBalanceEvent) => void) => {
    accountListenersRef.current.add(listener);
    return () => {
      accountListenersRef.current.delete(listener);
    };
  }, []);

  const handleClosed = useCallback((event: PositionClosedEvent) => {
    for (const listener of closedListenersRef.current) {
      listener(event);
    }
  }, []);

  const handleCreated = useCallback((event: PositionCreatedEvent) => {
    for (const listener of createdListenersRef.current) {
      listener(event);
    }
  }, []);

  const handlePnl = useCallback((event: PositionPnlEvent) => {
    for (const listener of pnlListenersRef.current) {
      listener(event);
    }
  }, []);

  const handleAccount = useCallback((event: AccountBalanceEvent) => {
    for (const listener of accountListenersRef.current) {
      listener(event);
    }
  }, []);

  usePositionEvents({
    authToken: backendAuthToken,
    onClosed: handleClosed,
    onCreated: handleCreated,
  });

  usePositionPnlEvents({
    authToken: backendAuthToken,
    onPnl: handlePnl,
  });

  useAccountEvents({
    authToken: backendAuthToken,
    onBalance: handleAccount,
  });

  useEffect(() => {
    if (isLoadingData) {
      return undefined;
    }

    let isCancelled = false;
    let ws: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let reconnectAttempt = 0;

    const connect = () => {
      if (isCancelled) {
        return;
      }

      let wsUrl: string;
      try {
        wsUrl = backendMarketWsUrl();
      } catch {
        return;
      }

      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        reconnectAttempt = 0;
      };

      ws.onmessage = (event: MessageEvent<string>) => {
        if (isCancelled) {
          return;
        }

        try {
          const payload = JSON.parse(event.data) as Record<string, unknown>;
          if (payload['type'] !== 'market.tick') {
            return;
          }

          const targetPair = PRODUCT_TO_PAIR[payload['symbol'] as string];
          if (!targetPair) {
            return;
          }

          const ts = payload['time']
            ? Date.parse(payload['time'] as string)
            : Date.now();
          if (!Number.isFinite(ts)) {
            return;
          }

          const currentSeries = datasetsRef.current[targetPair] ?? [];
          const updatedSeries = applyLiveTickToCandles(
            currentSeries,
            {
              price: Number(payload['price']),
              size: 0,
              timestamp: ts,
            },
            timeframeId,
          );

          if (updatedSeries !== currentSeries) {
            dispatch(mergePairCandles({ pairId: targetPair, candles: updatedSeries }));
          }
        } catch {
          // Ignore malformed socket messages.
        }
      };

      ws.onclose = () => {
        if (isCancelled) {
          return;
        }

        reconnectAttempt += 1;
        const delayMs = Math.min(10000, 1000 * reconnectAttempt);
        reconnectTimer = window.setTimeout(connect, delayMs);
      };

      ws.onerror = () => {
        if (ws && ws.readyState !== WebSocket.CLOSED) {
          ws.close();
        }
      };
    };

    connect();

    return () => {
      isCancelled = true;
      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer);
      }
      if (ws && ws.readyState !== WebSocket.CLOSED) {
        ws.close();
      }
    };
  }, [dispatch, isLoadingData, timeframeId]);

  const value = useMemo<WebsocketContextValue>(
    () => ({
      subscribeClosedEvents,
      subscribeCreatedEvents,
      subscribePnlEvents,
      subscribeAccountEvents,
    }),
    [subscribeAccountEvents, subscribeClosedEvents, subscribeCreatedEvents, subscribePnlEvents],
  );

  return <WebsocketContext.Provider value={value}>{children}</WebsocketContext.Provider>;
}

export function useWebsocket(): WebsocketContextValue {
  const context = useContext(WebsocketContext);
  if (!context) {
    throw new Error('useWebsocket must be used within a WebsocketProvider.');
  }
  return context;
}
