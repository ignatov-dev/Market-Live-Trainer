import { useEffect, useRef } from 'react';
import type { TradingAccount } from './positionsApi';
import { backendAccountWsUrl } from './positionsApi';

export interface AccountBalanceEvent {
  type: 'account.balance';
  account: TradingAccount;
  source: 'engine' | 'api' | 'system';
}

interface Params {
  authToken: string | null;
  onBalance: (event: AccountBalanceEvent) => void;
}

const DEBUG_ACCOUNT_WS = ((import.meta.env.VITE_DEBUG_ACCOUNT_WS ?? '').trim() === 'true');

function logAccountWs(...args: unknown[]): void {
  if (!DEBUG_ACCOUNT_WS) {
    return;
  }
  console.info('[ws/account]', ...args);
}

export function useAccountEvents({ authToken, onBalance }: Params): void {
  const onBalanceRef = useRef(onBalance);
  onBalanceRef.current = onBalance;

  useEffect(() => {
    if (!authToken) {
      return undefined;
    }

    let socket: WebSocket | null = null;
    let isCancelled = false;
    let reconnectTimer: number | null = null;
    let reconnectAttempt = 0;
    let hiddenAt: number | null = null;

    const connect = () => {
      if (isCancelled) {
        return;
      }

      let wsUrl: string;
      try {
        wsUrl = backendAccountWsUrl();
      } catch {
        return;
      }

      const sock = new WebSocket(wsUrl);
      socket = sock;

      sock.onopen = () => {
        if (socket !== sock) return;
        reconnectAttempt = 0;
        logAccountWs('connected');
      };

      sock.onmessage = (event: MessageEvent<string>) => {
        if (socket !== sock || isCancelled) {
          return;
        }

        try {
          const payload = JSON.parse(event.data) as AccountBalanceEvent;
          if (payload.type !== 'account.balance' || !payload.account) {
            return;
          }

          logAccountWs('balance', payload);
          onBalanceRef.current(payload);
        } catch {
          logAccountWs('ignored malformed message');
        }
      };

      sock.onclose = () => {
        if (socket !== sock) {
          return; // stale socket — visibility handler already reconnected
        }
        if (isCancelled) {
          return;
        }

        reconnectAttempt += 1;
        const delayMs = Math.min(15000, 1000 * reconnectAttempt);
        logAccountWs('closed, reconnecting in ms', delayMs);
        reconnectTimer = window.setTimeout(connect, delayMs);
      };

      sock.onerror = () => {
        if (sock.readyState !== WebSocket.CLOSED) {
          sock.close();
        }
      };
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
        return;
      }
      if (isCancelled || hiddenAt === null || Date.now() - hiddenAt < 30_000) {
        return;
      }
      hiddenAt = null;
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      reconnectAttempt = 0;
      const stale = socket;
      socket = null;
      stale?.close();
      connect();
    };

    connect();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isCancelled = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
      }
      if (socket && socket.readyState !== WebSocket.CLOSED) {
        socket.close();
      }
    };
  }, [authToken]);
}
