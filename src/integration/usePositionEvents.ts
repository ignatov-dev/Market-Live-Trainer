import { useEffect, useRef } from 'react';
import type { Position } from './positionsApi';
import { backendWsUrl } from './positionsApi';

export interface PositionClosedEvent {
  type: 'position.closed';
  position: Position;
  source: 'engine' | 'api';
}

interface UsePositionEventsArgs {
  userId: string;
  onClosed: (event: PositionClosedEvent) => void;
}

export function usePositionEvents({ userId, onClosed }: UsePositionEventsArgs): void {
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptsRef = useRef(0);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let stopped = false;

    const connect = () => {
      if (stopped) {
        return;
      }

      ws = new WebSocket(backendWsUrl(userId));

      ws.onopen = () => {
        attemptsRef.current = 0;
      };

      ws.onmessage = (message) => {
        try {
          const payload = JSON.parse(message.data as string) as { type?: string; position?: Position; source?: 'engine' | 'api' };

          if (payload.type !== 'position.closed' || !payload.position || !payload.source) {
            return;
          }

          onClosed({
            type: 'position.closed',
            position: payload.position,
            source: payload.source,
          });
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
  }, [onClosed, userId]);
}
