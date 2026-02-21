import { useEffect, useRef } from 'react';
import { backendPositionsWsUrl } from './positionsApi';

export interface PositionPnlUpdate {
  positionId: string;
  symbol: string;
  side: 'long' | 'short';
  quantity: number;
  entryPrice: number;
  markPrice: number;
  unrealizedPnl: number;
  paidOpenFee: number;
  estimatedCloseFee: number;
  unrealizedNetPnl: number;
  unrealizedTotalNetPnl: number;
}

export interface PositionPnlEvent {
  type: 'position.pnl';
  time: string;
  position: PositionPnlUpdate;
}

interface UsePositionPnlEventsArgs {
  authToken: string | null;
  onPnl: (event: PositionPnlEvent) => void;
}

export function usePositionPnlEvents({ authToken, onPnl }: UsePositionPnlEventsArgs): void {
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptsRef = useRef(0);

  useEffect(() => {
    if (typeof authToken !== 'string' || authToken.length === 0) {
      return undefined;
    }

    let ws: WebSocket | null = null;
    let stopped = false;
    let hiddenAt: number | null = null;

    const connect = () => {
      if (stopped) {
        return;
      }

      let wsUrl: string;
      try {
        wsUrl = backendPositionsWsUrl();
      } catch {
        return;
      }

      const socket = new WebSocket(wsUrl);
      ws = socket;

      socket.onopen = () => {
        if (ws !== socket) return;
        attemptsRef.current = 0;
      };

      socket.onmessage = (message) => {
        if (ws !== socket) return;
        try {
          const payload = JSON.parse(message.data as string) as {
            type?: string;
            time?: string;
            position?: PositionPnlUpdate;
          };

          if (payload.type !== 'position.pnl' || !payload.position) {
            return;
          }

          onPnl({
            type: 'position.pnl',
            time: typeof payload.time === 'string' ? payload.time : '',
            position: payload.position,
          });
        } catch {
          // Ignore malformed events.
        }
      };

      socket.onclose = () => {
        if (ws !== socket) {
          return; // stale socket — visibility handler already reconnected
        }
        if (stopped) {
          return;
        }

        const delay = Math.min(1000 * 2 ** attemptsRef.current, 30000);
        attemptsRef.current += 1;
        reconnectRef.current = setTimeout(connect, delay);
      };
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
        return;
      }
      if (stopped || hiddenAt === null || Date.now() - hiddenAt < 30_000) {
        return;
      }
      hiddenAt = null;
      if (reconnectRef.current) {
        clearTimeout(reconnectRef.current);
        reconnectRef.current = null;
      }
      attemptsRef.current = 0;
      const stale = ws;
      ws = null;
      stale?.close();
      connect();
    };

    connect();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      ws?.close();
      if (reconnectRef.current) {
        clearTimeout(reconnectRef.current);
      }
    };
  }, [authToken, onPnl]);
}
