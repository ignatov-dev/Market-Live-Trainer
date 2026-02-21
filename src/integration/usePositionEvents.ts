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

      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        attemptsRef.current = 0;
      };

      ws.onmessage = (message) => {
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

      ws.onclose = () => {
        if (stopped) {
          return;
        }

        const delay = Math.min(1000 * 2 ** attemptsRef.current, 30000);
        attemptsRef.current += 1;

        reconnectRef.current = setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      stopped = true;
      ws?.close();
      if (reconnectRef.current) {
        clearTimeout(reconnectRef.current);
      }
    };
  }, [authToken, onClosed, onCreated]);
}
