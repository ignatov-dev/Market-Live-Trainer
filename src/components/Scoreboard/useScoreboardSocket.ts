import { useEffect, useRef, useState } from 'react';
import { backendScoreboardWsUrl } from '../../integration/positionsApi';
import type { ScoreboardEntry, ConnectionStatus, ScoreboardUpdateMessage } from './types';

interface UseScoreboardSocketResult {
  entries: ScoreboardEntry[];
  status: ConnectionStatus;
}

export function useScoreboardSocket(authToken: string | null): UseScoreboardSocketResult {
  const [entries, setEntries] = useState<ScoreboardEntry[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');

  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptsRef = useRef(0);

  useEffect(() => {
    if (typeof authToken !== 'string' || authToken.length === 0) {
      setStatus('disconnected');
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
        wsUrl = backendScoreboardWsUrl();
      } catch {
        setStatus('disconnected');
        return;
      }

      setStatus('connecting');
      const socket = new WebSocket(wsUrl);
      ws = socket;

      socket.onopen = () => {
        if (ws !== socket) return;
        attemptsRef.current = 0;
        setStatus('connected');
      };

      socket.onmessage = (message) => {
        if (ws !== socket) return;
        try {
          const payload = JSON.parse(message.data as string) as ScoreboardUpdateMessage;
          if (payload.type === 'scoreboard_update' && Array.isArray(payload.payload)) {
            setEntries(payload.payload);
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
        setStatus('disconnected');
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
  }, [authToken]);

  return { entries, status };
}
