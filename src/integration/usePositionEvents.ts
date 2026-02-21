import { useEffect, useRef } from 'react';
import type { Position } from './positionsApi';
import { backendWsUrl } from './positionsApi';

export interface PositionClosedEvent {
  type: 'position.closed';
  position: Position;
  source: 'engine' | 'api';
}

export interface PositionCreatedEvent {
  type: 'position.created';
  position: Position;
  source: 'engine' | 'api';
}

interface UsePositionEventsArgs {
  authToken: string | null;
  onClosed: (event: PositionClosedEvent) => void;
  onCreated?: (event: PositionCreatedEvent) => void;
}

export function usePositionEvents({ authToken, onClosed, onCreated }: UsePositionEventsArgs): void {
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
        wsUrl = backendWsUrl();
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
          const payload = JSON.parse(message.data as string) as { type?: string; position?: Position; source?: 'engine' | 'api' };

          if (!payload.position || !payload.source) {
            return;
          }

          if (payload.type === 'position.closed') {
            onClosed({
              type: 'position.closed',
              position: payload.position,
              source: payload.source,
            });
            return;
          }

          if (payload.type === 'position.created') {
            onCreated?.({
              type: 'position.created',
              position: payload.position,
              source: payload.source,
            });
          }
        } catch {
          // ignore malformed events
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
      // Page became visible — reconnect if hidden long enough for the connection to have gone zombie
      if (stopped || hiddenAt === null || Date.now() - hiddenAt < 30_000) {
        return;
      }
      hiddenAt = null;
      if (reconnectRef.current) {
        clearTimeout(reconnectRef.current);
        reconnectRef.current = null;
      }
      attemptsRef.current = 0;
      // Null ws before closing so the stale onclose identity check bails early
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
  }, [authToken, onClosed, onCreated]);
}
