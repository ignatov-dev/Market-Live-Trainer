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

    let isCancelled = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let reconnectAttempt = 0;

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

      socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        reconnectAttempt = 0;
        logAccountWs('connected');
      };

      socket.onmessage = (event: MessageEvent<string>) => {
        if (isCancelled) {
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

      socket.onclose = () => {
        if (isCancelled) {
          return;
        }

        reconnectAttempt += 1;
        const delayMs = Math.min(15000, 1000 * reconnectAttempt);
        logAccountWs('closed, reconnecting in ms', delayMs);
        reconnectTimer = window.setTimeout(connect, delayMs);
      };

      socket.onerror = () => {
        if (socket && socket.readyState !== WebSocket.CLOSED) {
          socket.close();
        }
      };
    };

    connect();

    return () => {
      isCancelled = true;
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
      }
      if (socket && socket.readyState !== WebSocket.CLOSED) {
        socket.close();
      }
    };
  }, [authToken]);
}
