import { useCallback, useMemo } from 'react';
import { appendTimeline, buildTimelineEvent, getLatestMarksByPair } from '../../CandleChart/utils/candles';
import { useAppDispatch, useAppSelector } from '../../../store/hooks';
import { setSession, setTicket, setTicketPreviewSide } from '../../../store/slices/sessionSlice';
import { fmtPrice } from '../../../utils/formatters';
import {
  defaultTicket,
  getEstimatedNetPnl,
  openPosition,
  sanitizePriceInput,
  validateBracketPrices,
  validateTicketOrder,
  type TicketValidation,
} from '../../../utils/trading';
import type { Candle, PendingOrder, Session, Ticket, TicketSide } from '../../../types/domain';

interface BracketPnlPreview {
  takeProfit: number | null;
  stopLoss: number | null;
}

interface TicketOrderController {
  ticket: Ticket;
  sessionPendingOrders: PendingOrder[];
  ticketValidation: TicketValidation;
  ticketBracketPnlPreview: BracketPnlPreview;
  isBuyActionDisabled: boolean;
  isSellActionDisabled: boolean;
  isLoadingData: boolean;
  onTicketChange: (partial: Partial<Ticket>) => void;
  onTicketPreviewSide: (side: TicketSide) => void;
  onSubmitOrder: (side: TicketSide) => void;
  onCancelOrder: (orderId: number) => void;
}

const FALLBACK_SESSION: Session = {
  replayIndex: 0,
  sequence: 1,
  balance: 10000,
  positions: [],
  pendingOrders: [],
  closedTrades: [],
  timeline: [],
  equityHistory: [{ index: 0, equity: 10000 }],
};

const FALLBACK_TICKET: Ticket = {
  type: 'market',
  qty: '',
  limitPrice: '',
  stopLoss: '',
  takeProfit: '',
};

export function useTicketOrderController(): TicketOrderController {
  const dispatch = useAppDispatch();
  const pair = useAppSelector((state) => state.chart?.pair ?? 'BTCUSDT');
  const datasets = useAppSelector((state) => state.chart?.datasets ?? {});
  const isLoadingData = useAppSelector((state) => state.chart?.isLoadingData ?? false);
  const session = useAppSelector((state) => state.session?.session ?? FALLBACK_SESSION);
  const backendAuthToken = useAppSelector((state) => state.auth?.backendAuthToken ?? null);
  const backendAccount = useAppSelector((state) => state.backend?.backendAccount ?? null);
  const ticket = useAppSelector((state) => state.session?.ticket ?? FALLBACK_TICKET);
  const ticketPreviewSide = useAppSelector((state) => state.session?.ticketPreviewSide ?? 'buy');
  const hasBackendAuth =
    typeof backendAuthToken === 'string' && backendAuthToken.trim().length > 0;

  const candles = datasets[pair] ?? [];
  const hasCandles = candles.length > 0;
  const fallbackCandle = useMemo<Candle>(
    () => ({ index: 0, timestamp: Date.now(), open: 0, high: 0, low: 0, close: 0, volume: 0 }),
    [],
  );
  const safeReplayIndex = hasCandles
    ? Math.max(0, Math.min(session.replayIndex, candles.length - 1))
    : 0;
  
  // ALways use the live market edge if the user is authenticated (live mode),
  // otherwise respect the trainer's replay timeline index.
  const activeIndex = hasBackendAuth && hasCandles ? candles.length - 1 : safeReplayIndex;
  const currentCandle = hasCandles ? (candles[activeIndex] ?? fallbackCandle) : fallbackCandle;
  
  const marksByPair = useMemo(() => getLatestMarksByPair(datasets), [datasets]);
  const currentPrice = hasBackendAuth ? (marksByPair[pair] ?? currentCandle.close) : currentCandle.close;
  const sessionForTrading = useMemo(() => {
    if (!hasBackendAuth) {
      return session;
    }

    const backendCashBalance = Number(backendAccount?.cashBalance);
    if (!Number.isFinite(backendCashBalance)) {
      return session;
    }

    if (Math.abs(session.balance - backendCashBalance) < 1e-9) {
      return session;
    }

    return { ...session, balance: backendCashBalance };
  }, [backendAccount?.cashBalance, hasBackendAuth, session]);

  const ticketValidation = useMemo(
    () =>
      validateTicketOrder({
        ticket,
        session: sessionForTrading,
        hasCandles,
        currentPrice,
        isLoadingData,
      }),
    [ticket, sessionForTrading, hasCandles, currentPrice, isLoadingData],
  );

  const ticketSideBracketValidation = useMemo(() => {
    const stopLoss = sanitizePriceInput(ticket.stopLoss);
    const takeProfit = sanitizePriceInput(ticket.takeProfit);
    const entryPrice = ticket.type === 'limit' ? ticketValidation.limitPrice : currentPrice;

    if (!Number.isFinite(entryPrice) || (entryPrice as number) <= 0) {
      return { buyError: null, sellError: null };
    }

    return {
      buyError: validateBracketPrices(
        'long',
        entryPrice as number,
        stopLoss,
        takeProfit,
      ),
      sellError: validateBracketPrices(
        'short',
        entryPrice as number,
        stopLoss,
        takeProfit,
      ),
    };
  }, [
    ticket.stopLoss,
    ticket.takeProfit,
    ticket.type,
    ticketValidation.limitPrice,
    currentPrice,
  ]);

  const isOrderActionDisabled = !ticketValidation.canSubmit;
  const isBuyActionDisabled =
    isOrderActionDisabled || ticketSideBracketValidation.buyError !== null;
  const isSellActionDisabled =
    isOrderActionDisabled || ticketSideBracketValidation.sellError !== null;

  const ticketBracketPnlPreview = useMemo<BracketPnlPreview>(() => {
    const qty = Number(ticket.qty);
    const entryPrice =
      ticket.type === 'limit'
        ? sanitizePriceInput(ticket.limitPrice)
        : Number.isFinite(currentPrice) && currentPrice > 0
          ? currentPrice
          : null;
    const side: 'long' | 'short' = ticketPreviewSide === 'sell' ? 'short' : 'long';
    const takeProfit = sanitizePriceInput(ticket.takeProfit);
    const stopLoss = sanitizePriceInput(ticket.stopLoss);

    if (!Number.isFinite(qty) || qty <= 0 || entryPrice === null) {
      return { takeProfit: null, stopLoss: null };
    }

    return {
      takeProfit:
        takeProfit === null
          ? null
          : getEstimatedNetPnl({ side, entryPrice, qty, exitPrice: takeProfit }),
      stopLoss:
        stopLoss === null
          ? null
          : getEstimatedNetPnl({ side, entryPrice, qty, exitPrice: stopLoss }),
    };
  }, [
    ticket.qty,
    ticket.type,
    ticket.limitPrice,
    ticket.takeProfit,
    ticket.stopLoss,
    currentPrice,
    ticketPreviewSide,
  ]);

  const onTicketChange = useCallback(
    (partial: Partial<Ticket>) => {
      dispatch(setTicket(partial));
    },
    [dispatch],
  );

  const onTicketPreviewSide = useCallback(
    (side: TicketSide) => {
      dispatch(setTicketPreviewSide(side));
    },
    [dispatch],
  );

  const onSubmitOrder = useCallback(
    (side: TicketSide) => {
      if (side !== 'buy' && side !== 'sell') {
        return;
      }

      if (!ticketValidation.canSubmit) {
        return;
      }

      const qty = ticketValidation.qty;
      if (qty === null) return;
      const stopLoss = sanitizePriceInput(ticket.stopLoss);
      const takeProfit = sanitizePriceInput(ticket.takeProfit);
      const bracketEntryPrice =
        ticket.type === 'limit' ? ticketValidation.limitPrice : currentPrice;
      const bracketSide: 'long' | 'short' = side === 'buy' ? 'long' : 'short';

      if (Number.isFinite(bracketEntryPrice) && (bracketEntryPrice as number) > 0) {
        const bracketValidationError = validateBracketPrices(
          bracketSide,
          bracketEntryPrice as number,
          stopLoss,
          takeProfit,
        );
        if (bracketValidationError) {
          return;
        }
      }

      if (ticket.type === 'market') {
        const result = openPosition(
          sessionForTrading,
          currentCandle,
          {
            pair,
            side,
            qty,
            stopLoss,
            takeProfit,
            entryPrice: currentPrice,
            entryType: 'market',
          },
          { ...marksByPair, [pair]: currentPrice },
        );

        if (result.error) {
          return;
        }

        dispatch(setSession(result.session));
        dispatch(setTicket({ ...defaultTicket(currentPrice), type: ticket.type }));
        return;
      }

      const limitPrice = ticketValidation.limitPrice;
      if (limitPrice === null) {
        return;
      }

      const pending = {
        id: sessionForTrading.sequence,
        pair,
        side,
        qty,
        limitPrice,
        stopLoss,
        takeProfit,
        createdAtIndex: currentCandle.index,
        createdAtTs: currentCandle.timestamp,
      };

      let next = {
        ...sessionForTrading,
        sequence: sessionForTrading.sequence + 1,
        pendingOrders: [...sessionForTrading.pendingOrders, pending],
      };

      next = appendTimeline(
        next,
        buildTimelineEvent(
          currentCandle.index,
          currentCandle.timestamp,
          `${pending.pair} limit ${pending.side === 'buy' ? 'buy' : 'sell'} order queued at $${fmtPrice(limitPrice)}.`,
        ),
      );

      dispatch(setSession(next));
      dispatch(setTicket({ ...defaultTicket(currentPrice), type: ticket.type }));
    },
    [
      dispatch,
      pair,
      sessionForTrading,
      ticketValidation,
      ticket.stopLoss,
      ticket.takeProfit,
      ticket.type,
      currentPrice,
      currentCandle,
      marksByPair,
    ],
  );

  const onCancelOrder = useCallback(
    (orderId: number) => {
      const order = session.pendingOrders.find((item) => item.id === orderId);
      if (!order) {
        return;
      }

      const orderPairSeries = datasets[order.pair] ?? [];
      const orderCandle =
        Array.isArray(orderPairSeries) && orderPairSeries.length > 0
          ? orderPairSeries[orderPairSeries.length - 1]!
          : currentCandle;

      let next = {
        ...session,
        pendingOrders: session.pendingOrders.filter((item) => item.id !== orderId),
      };

      next = appendTimeline(
        next,
        buildTimelineEvent(
          orderCandle.index,
          orderCandle.timestamp,
          `${order.pair} limit order #${orderId} canceled.`,
        ),
      );

      dispatch(setSession(next));
    },
    [dispatch, session, datasets, currentCandle],
  );

  return {
    ticket,
    sessionPendingOrders: session.pendingOrders,
    ticketValidation,
    ticketBracketPnlPreview,
    isBuyActionDisabled,
    isSellActionDisabled,
    isLoadingData,
    onTicketChange,
    onTicketPreviewSide,
    onSubmitOrder,
    onCancelOrder,
  };
}
