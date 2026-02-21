import { useCallback, useMemo } from 'react';
import { resetBackendSession } from '../integration/positionsApi';
import { defaultTicket } from '../utils/trading';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { resetSession as resetSessionAction, setTicket } from '../store/slices/sessionSlice';
import { setChartEndIndex, setChartMarkerTooltip } from '../store/slices/chartSlice';
import {
  incrementSyncRevision,
  setBackendAccount,
  setBackendAccountError,
  setBackendClosedPositions,
  setBackendError,
  setBackendPnlByPositionId,
} from '../store/slices/backendSlice';
import { INITIAL_BALANCE } from '../constants/trading';

export function useSessionResetController(): { resetSession: () => Promise<void> } {
  const dispatch = useAppDispatch();
  const session = useAppSelector((s) => s.session.session);
  const ticketType = useAppSelector((s) => s.session.ticket.type);
  const datasets = useAppSelector((s) => s.chart.datasets);
  const pair = useAppSelector((s) => s.chart.pair);
  const backendAuthToken = useAppSelector((s) => s.auth.backendAuthToken);
  const hasBackendAuth =
    typeof backendAuthToken === 'string' && backendAuthToken.trim().length > 0;

  const currentCandle = useMemo(() => {
    const pairSeries = datasets[pair] ?? [];
    const latest = Array.isArray(pairSeries) && pairSeries.length > 0
      ? pairSeries[pairSeries.length - 1]!
      : null;
    const fallbackPrice = Number(latest?.close);
    const safePrice = Number.isFinite(fallbackPrice) && fallbackPrice > 0 ? fallbackPrice : 1;
    return latest ?? {
      index: session.replayIndex,
      timestamp: Date.now(),
      open: safePrice,
      high: safePrice,
      low: safePrice,
      close: safePrice,
      volume: 0,
    };
  }, [datasets, pair, session.replayIndex]);

  const currentPrice = currentCandle.close;

  const resetSession = useCallback(async () => {
    const isPristineLocalSession =
      session.balance === INITIAL_BALANCE &&
      session.positions.length === 0 &&
      session.pendingOrders.length === 0 &&
      session.closedTrades.length === 0 &&
      session.sequence <= 1;

    if (!hasBackendAuth && isPristineLocalSession) {
      return;
    }

    if (hasBackendAuth) {
      try {
        const resetAccount = await resetBackendSession();
        dispatch(setBackendAccount(resetAccount));
        dispatch(setBackendClosedPositions([]));
        dispatch(setBackendPnlByPositionId({}));
        dispatch(setBackendError(''));
        dispatch(setBackendAccountError(''));
        dispatch(incrementSyncRevision());
      } catch (error) {
        console.error('Failed to reset backend session', error);
        return;
      }
    }

    dispatch(setChartEndIndex(null));
    dispatch(setChartMarkerTooltip(null));

    dispatch(resetSessionAction({ initialCandle: currentCandle }));
    dispatch(setTicket({ ...defaultTicket(currentPrice), type: ticketType }));
  }, [
    currentCandle,
    currentPrice,
    dispatch,
    hasBackendAuth,
    session,
    ticketType,
  ]);

  return { resetSession };
}
