import { useEffect, useRef } from 'react';
import type { Session } from '../types/domain';

const APP_BRIDGE_TYPE = 'MARKET_LIVE_SESSION_SYNC';

export function useExtensionSync(
  session: Session,
  initialBalance: number,
  feeRate: number,
) {
  const lastSentHash = useRef<string>('');

  useEffect(() => {
    // Only sync if there's an actual change to core data
    const payload = {
      balance: session.balance,
      positions: session.positions,
      pendingOrders: session.pendingOrders,
      initialBalance,
      feeRate,
    };
    
    const hash = JSON.stringify(payload);
    if (hash === lastSentHash.current) {
      return;
    }
    
    lastSentHash.current = hash;
    window.postMessage({ type: APP_BRIDGE_TYPE, payload }, '*');
  }, [session, initialBalance, feeRate]);
}
