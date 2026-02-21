import { FEE_RATE, LEVERAGE, INITIAL_BALANCE } from '../constants/trading';
import { PAIRS, PRODUCT_TO_PAIR } from '../constants/market';
import { buildTimelineEvent, appendTimeline } from '../components/CandleChart/utils/candles';
import { fmtNumber, fmtPrice, fmtSigned } from './formatters';
import type {
  Session,
  Candle,
  LocalPosition,
  ClosedTrade,
  PendingOrder,
  PositionSide,
  TicketSide,
  Ticket,
  MarksByPair,
  SessionMetrics,
} from '../types/domain';

export function getDirectionMultiplier(side: PositionSide): 1 | -1 {
  return side === 'long' ? 1 : -1;
}

export function getPositionMarkPrice(
  position: LocalPosition | null | undefined,
  marksByPair: MarksByPair = {},
  fallbackPrice: number | null = null,
): number | null {
  const byPair = position?.pair ? Number(marksByPair[position.pair]) : Number.NaN;
  if (Number.isFinite(byPair) && byPair > 0) {
    return byPair;
  }

  const safeFallback = Number(fallbackPrice);
  if (Number.isFinite(safeFallback) && safeFallback > 0) {
    return safeFallback;
  }

  const entryPrice = Number(position?.entryPrice);
  if (Number.isFinite(entryPrice) && entryPrice > 0) {
    return entryPrice;
  }

  return null;
}

export function getUnrealizedPnl(
  positions: LocalPosition[],
  marksByPair: MarksByPair = {},
): number {
  if (!Array.isArray(positions) || positions.length === 0) {
    return 0;
  }

  return positions.reduce((sum, position) => {
    const markPrice = getPositionMarkPrice(position, marksByPair);
    if (!Number.isFinite(markPrice) || (markPrice as number) <= 0) {
      return sum;
    }

    const direction = getDirectionMultiplier(position.side);
    const gross = ((markPrice as number) - position.entryPrice) * position.qty * direction;
    const estimatedCloseFee = (markPrice as number) * position.qty * FEE_RATE;
    return sum + gross - estimatedCloseFee;
  }, 0);
}

export function getUnrealizedTotalNetPnl(
  positions: LocalPosition[],
  marksByPair: MarksByPair = {},
): number {
  if (!Array.isArray(positions) || positions.length === 0) {
    return 0;
  }

  return positions.reduce((sum, position) => {
    const markPrice = getPositionMarkPrice(position, marksByPair);
    if (!Number.isFinite(markPrice) || (markPrice as number) <= 0) {
      return sum;
    }

    const direction = getDirectionMultiplier(position.side);
    const gross = ((markPrice as number) - position.entryPrice) * position.qty * direction;
    const paidOpenFee = position.entryPrice * position.qty * FEE_RATE;
    const estimatedCloseFee = (markPrice as number) * position.qty * FEE_RATE;
    return sum + gross - estimatedCloseFee - paidOpenFee;
  }, 0);
}

export interface EstimatedNetPnlInput {
  side: PositionSide;
  entryPrice: number | string;
  qty: number | string;
  exitPrice: number | string;
}

export function getEstimatedNetPnl({
  side,
  entryPrice,
  qty,
  exitPrice,
}: EstimatedNetPnlInput): number | null {
  const safeExitPrice = Number(exitPrice);
  const safeEntryPrice = Number(entryPrice);
  const safeQty = Number(qty);
  if (
    !Number.isFinite(safeExitPrice) ||
    safeExitPrice <= 0 ||
    !Number.isFinite(safeEntryPrice) ||
    safeEntryPrice <= 0 ||
    !Number.isFinite(safeQty) ||
    safeQty <= 0
  ) {
    return null;
  }

  const direction = getDirectionMultiplier(side);
  const gross = (safeExitPrice - safeEntryPrice) * safeQty * direction;
  const estimatedCloseFee = safeExitPrice * safeQty * FEE_RATE;
  return gross - estimatedCloseFee;
}

export function getOrderNotional(price: number | string, qty: number | string): number {
  const safePrice = Number(price);
  const safeQty = Number(qty);
  if (
    !Number.isFinite(safePrice) ||
    safePrice <= 0 ||
    !Number.isFinite(safeQty) ||
    safeQty <= 0
  ) {
    return 0;
  }
  return safePrice * safeQty;
}

export function getMarginRequirement(notional: number): number {
  const safeNotional = Number(notional);
  if (!Number.isFinite(safeNotional) || safeNotional <= 0) {
    return 0;
  }
  return safeNotional / LEVERAGE;
}

export function getUsedMargin(
  session: Session,
  options: { excludePendingOrderId?: number | null } = {},
): number {
  const { excludePendingOrderId = null } = options;

  const positionsMargin = session.positions.reduce(
    (sum, position) =>
      sum + getMarginRequirement(getOrderNotional(position.entryPrice, position.qty)),
    0,
  );

  const pendingMargin = session.pendingOrders.reduce((sum, order) => {
    if (excludePendingOrderId !== null && order.id === excludePendingOrderId) {
      return sum;
    }
    return sum + getMarginRequirement(getOrderNotional(order.limitPrice, order.qty));
  }, 0);

  return positionsMargin + pendingMargin;
}

export function sanitizePriceInput(value: string | number | null | undefined): number | null {
  if (value === '' || value === null || value === undefined) {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

export function parseOptionalPriceInput(
  rawValue: string | number | null | undefined,
  label: string,
): { value: number | null; error: string | null } {
  const normalized = String(rawValue ?? '').trim();
  if (normalized.length === 0) {
    return { value: null, error: null };
  }
  const value = sanitizePriceInput(normalized);
  if (value === null) {
    return { value: null, error: `${label} must be a valid positive number.` };
  }
  return { value, error: null };
}

export interface TicketValidation {
  marketDataError: string | null;
  qtyError: string | null;
  limitPriceError: string | null;
  marginError: string | null;
  qty: number | null;
  limitPrice: number | null;
  canSubmit: boolean;
}

export function validateTicketOrder({
  ticket,
  session,
  hasCandles,
  currentPrice,
  isLoadingData,
}: {
  ticket: Ticket;
  session: Session;
  hasCandles: boolean;
  currentPrice: number | null | undefined;
  isLoadingData: boolean;
}): TicketValidation {
  const result: TicketValidation = {
    marketDataError: null,
    qtyError: null,
    limitPriceError: null,
    marginError: null,
    qty: null,
    limitPrice: null,
    canSubmit: false,
  };

  if (isLoadingData) {
    return result;
  }

  if (!hasCandles || !Number.isFinite(currentPrice) || (currentPrice as number) <= 0) {
    result.marketDataError = 'No valid live candle available yet.';
    return result;
  }

  const qty = Number(ticket.qty);
  if (!Number.isFinite(qty) || qty <= 0) {
    return result;
  }
  result.qty = qty;

  let entryPrice = currentPrice as number;
  if (ticket.type === 'limit') {
    const limitPrice = sanitizePriceInput(ticket.limitPrice);
    if (limitPrice === null) {
      result.limitPriceError = 'Limit price must be a valid positive number.';
      return result;
    }
    result.limitPrice = limitPrice;
    entryPrice = limitPrice;
  }

  const notional = getOrderNotional(entryPrice, qty);
  const requiredMargin = getMarginRequirement(notional);
  const estimatedOpenFee = notional * FEE_RATE;
  const usedMargin = getUsedMargin(session);
  const availableMargin = session.balance - usedMargin;

  if (requiredMargin + estimatedOpenFee > availableMargin + 1e-9) {
    result.marginError = 'Insufficient balance.';
    return result;
  }

  result.canSubmit = true;
  return result;
}

export function defaultTicket(price?: number | null): Ticket {
  const safePrice =
    Number.isFinite(Number(price)) && Number(price) > 0 ? Number(price) : 1;
  return {
    type: 'market',
    qty: '',
    limitPrice: safePrice.toFixed(2),
    stopLoss: '',
    takeProfit: '',
  };
}

export function createSession(candles: Candle[] = []): Session {
  const hasCandles = Array.isArray(candles) && candles.length > 0;
  const index = hasCandles ? candles.length - 1 : 0;
  const lastCandle = candles[index];
  const startTs = hasCandles && lastCandle ? lastCandle.timestamp : Date.now();
  return {
    replayIndex: index,
    sequence: 1,
    balance: INITIAL_BALANCE,
    positions: [],
    pendingOrders: [],
    closedTrades: [],
    timeline: [buildTimelineEvent(index, startTs, 'Session started with $10,000 virtual balance.')],
    equityHistory: [{ index, equity: INITIAL_BALANCE }],
  };
}

export function validateBracketPrices(
  side: PositionSide,
  entryPrice: number,
  stopLoss: number | null,
  takeProfit: number | null,
): string | null {
  if (stopLoss !== null) {
    if (side === 'long' && stopLoss > entryPrice) {
      return 'For long positions, stop-loss cannot be above entry price.';
    }
    if (side === 'short' && stopLoss < entryPrice) {
      return 'For short positions, stop-loss cannot be below entry price.';
    }
  }

  if (takeProfit !== null) {
    if (side === 'long' && takeProfit < entryPrice) {
      return 'For long positions, take-profit cannot be below entry price.';
    }
    if (side === 'short' && takeProfit > entryPrice) {
      return 'For short positions, take-profit cannot be above entry price.';
    }
  }

  return null;
}

export function getPlannedRMultiple(
  side: PositionSide,
  entryPrice: number,
  stopLoss: number | null,
  takeProfit: number | null,
): number | null {
  if (stopLoss === null || takeProfit === null) {
    return null;
  }

  const riskDistance =
    side === 'long' ? entryPrice - stopLoss : stopLoss - entryPrice;
  const rewardDistance =
    side === 'long' ? takeProfit - entryPrice : entryPrice - takeProfit;

  if (riskDistance <= 0 || rewardDistance <= 0) {
    return null;
  }

  return rewardDistance / riskDistance;
}

export interface OpenOrderInput {
  pair: string;
  side: TicketSide;
  qty: number | string;
  entryPrice: number;
  stopLoss: number | null;
  takeProfit: number | null;
  entryType: 'market' | 'limit';
  pendingOrderId?: number | null;
}

export function openPosition(
  session: Session,
  candle: Candle,
  order: OpenOrderInput,
  marksByPair: MarksByPair = {},
): { session: Session; error: string | null } {
  const side: PositionSide = order.side === 'buy' ? 'long' : 'short';
  const entryPrice = order.entryPrice;
  const qty = Number(order.qty);
  const stopLoss = order.stopLoss;
  const takeProfit = order.takeProfit;
  const pair = typeof order.pair === 'string' && order.pair ? order.pair : null;

  if (!Number.isFinite(qty) || qty <= 0 || !pair) {
    return { session, error: 'Invalid order.' };
  }

  const validationError = validateBracketPrices(side, entryPrice, stopLoss, takeProfit);
  if (validationError) {
    return { session, error: validationError };
  }

  const notional = getOrderNotional(entryPrice, qty);
  const requiredMargin = getMarginRequirement(notional);
  const openFee = notional * FEE_RATE;
  const usedMargin = getUsedMargin(session, {
    excludePendingOrderId:
      Number.isFinite(Number(order.pendingOrderId)) ? Number(order.pendingOrderId) : null,
  });
  const availableMargin = session.balance - usedMargin;

  if (requiredMargin + openFee > availableMargin + 1e-9) {
    return { session, error: 'Insufficient balance.' };
  }

  const equityBefore = session.balance + getUnrealizedPnl(session.positions, marksByPair);
  const riskAmount = stopLoss === null ? null : Math.abs(entryPrice - stopLoss) * qty;
  const riskPct =
    riskAmount === null || equityBefore <= 0
      ? null
      : (riskAmount / equityBefore) * 100;
  const plannedR = getPlannedRMultiple(side, entryPrice, stopLoss, takeProfit);

  const position: LocalPosition = {
    id: session.sequence,
    backendPositionId: null,
    pair,
    side,
    qty,
    entryPrice,
    stopLoss,
    takeProfit,
    openedAtIndex: candle.index,
    openedAtTs: candle.timestamp,
    entryType: order.entryType,
    riskAmount,
    riskPct,
    plannedR,
  };

  let next: Session = {
    ...session,
    sequence: session.sequence + 1,
    balance: session.balance - openFee,
    positions: [...session.positions, position],
  };

  const text = `${pair} ${side === 'long' ? 'Long' : 'Short'} opened (${fmtNumber(qty, 3)} @ $${fmtPrice(entryPrice)}) via ${order.entryType}.`;
  next = appendTimeline(next, buildTimelineEvent(candle.index, candle.timestamp, text));

  return { session: next, error: null };
}

export function closePosition(
  session: Session,
  candle: Candle,
  positionId: number,
  reason: string,
  forcedPrice: number | null = null,
): Session {
  const position = session.positions.find((item) => item.id === positionId);
  if (!position) {
    return session;
  }

  const exitPrice = forcedPrice ?? candle.close;
  const direction = getDirectionMultiplier(position.side);
  const pnl = (exitPrice - position.entryPrice) * position.qty * direction;
  const closeFee = exitPrice * position.qty * FEE_RATE;
  const netPnl = pnl - closeFee;

  const updatedPositions = session.positions.filter((item) => item.id !== positionId);
  const risk = position.riskAmount;
  const rMultiple = risk && risk > 0 ? pnl / risk : null;

  const closedTrade: ClosedTrade = {
    id: session.sequence,
    positionId: position.id,
    backendPositionId: position.backendPositionId ?? null,
    pair: position.pair,
    side: position.side,
    qty: position.qty,
    entryPrice: position.entryPrice,
    exitPrice,
    openedAtIndex: position.openedAtIndex,
    closedAtIndex: candle.index,
    openedAtTs: position.openedAtTs,
    closedAtTs: candle.timestamp,
    durationCandles: candle.index - position.openedAtIndex,
    reason,
    pnl: netPnl,
    rawPnl: pnl,
    fee: closeFee,
    stopLoss: position.stopLoss,
    takeProfit: position.takeProfit,
    plannedR: position.plannedR,
    rMultiple,
    riskPct: position.riskPct,
  };

  let next: Session = {
    ...session,
    sequence: session.sequence + 1,
    balance: session.balance + netPnl,
    positions: updatedPositions,
    closedTrades: [closedTrade, ...session.closedTrades],
  };

  const text = `${position.pair ?? 'Unknown'} ${position.side === 'long' ? 'Long' : 'Short'} closed @ $${fmtPrice(exitPrice)} (${fmtSigned(netPnl)}), ${reason}.`;
  next = appendTimeline(next, buildTimelineEvent(candle.index, candle.timestamp, text));

  return next;
}

export function evaluatePendingOrders(
  session: Session,
  candle: Candle,
  pairId: string,
  marksByPair: MarksByPair = {},
): Session {
  let nextSession = session;
  const remainingOrders: PendingOrder[] = [];
  let hasChanges = false;

  for (const order of session.pendingOrders) {
    if (order.pair !== pairId) {
      remainingOrders.push(order);
      continue;
    }

    const isBuyFill = order.side === 'buy' && candle.low <= order.limitPrice;
    const isSellFill = order.side === 'sell' && candle.high >= order.limitPrice;

    if (isBuyFill || isSellFill) {
      const fill = openPosition(
        nextSession,
        candle,
        {
          pair: order.pair,
          side: order.side,
          qty: order.qty,
          stopLoss: order.stopLoss,
          takeProfit: order.takeProfit,
          entryPrice: order.limitPrice,
          entryType: 'limit',
          pendingOrderId: order.id,
        },
        marksByPair,
      );

      if (fill.error) {
        hasChanges = true;
        nextSession = appendTimeline(
          nextSession,
          buildTimelineEvent(
            candle.index,
            candle.timestamp,
            `${order.pair} order #${order.id} rejected on fill: ${fill.error}`,
          ),
        );
        continue;
      }

      hasChanges = true;
      nextSession = fill.session;
    } else {
      remainingOrders.push(order);
    }
  }

  if (!hasChanges && remainingOrders.length === session.pendingOrders.length) {
    return session;
  }

  return { ...nextSession, pendingOrders: remainingOrders };
}

export function getMetrics(session: Session, marksByPair: MarksByPair = {}): SessionMetrics {
  const unrealized = getUnrealizedPnl(session.positions, marksByPair);
  const openPnlInclFees = getUnrealizedTotalNetPnl(session.positions, marksByPair);
  const equity = session.balance + unrealized;
  const netPnl = equity - INITIAL_BALANCE;
  const realizedPnl = netPnl - openPnlInclFees;

  const wins = session.closedTrades.filter((trade) => trade.pnl > 0);
  const losses = session.closedTrades.filter((trade) => trade.pnl < 0);
  const grossProfit = wins.reduce((sum, trade) => sum + trade.pnl, 0);
  const grossLossAbs = Math.abs(losses.reduce((sum, trade) => sum + trade.pnl, 0));
  const profitFactor = grossLossAbs === 0 ? null : grossProfit / grossLossAbs;
  const winRate =
    session.closedTrades.length === 0
      ? 0
      : (wins.length / session.closedTrades.length) * 100;

  const rValues = session.closedTrades
    .map((trade) => trade.rMultiple)
    .filter((r): r is number => Number.isFinite(r));
  const avgR =
    rValues.length === 0
      ? null
      : rValues.reduce((sum, value) => sum + value, 0) / rValues.length;

  const avgHold =
    session.closedTrades.length === 0
      ? null
      : session.closedTrades.reduce((sum, trade) => sum + trade.durationCandles, 0) /
        session.closedTrades.length;

  let peak = session.equityHistory[0]?.equity ?? INITIAL_BALANCE;
  let maxDrawdown = 0;

  for (const point of session.equityHistory) {
    if (point.equity > peak) {
      peak = point.equity;
    }
    const drawdown = peak === 0 ? 0 : ((peak - point.equity) / peak) * 100;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }

  return {
    unrealized,
    openPnlInclFees,
    realizedPnl,
    equity,
    netPnl,
    grossProfit,
    grossLossAbs,
    profitFactor,
    winRate,
    avgR,
    avgHold,
    maxDrawdown,
  };
}

export function buildBackendPositionKey(
  symbol: string,
  side: PositionSide,
  quantity: number,
  entryPrice: number,
  takeProfit: number | null,
  stopLoss: number | null,
): string {
  const size = Number(quantity).toFixed(8);
  const entry = Number(entryPrice).toFixed(8);
  const tp = takeProfit === null ? 'null' : Number(takeProfit).toFixed(8);
  const sl = stopLoss === null ? 'null' : Number(stopLoss).toFixed(8);
  return `${symbol}|${side}|${size}|${entry}|${tp}|${sl}`;
}

export function resolvePairFromBackendSymbol(symbol: string): string | null {
  if (typeof symbol !== 'string' || symbol.trim().length === 0) {
    return null;
  }

  const normalizedSymbol = symbol.trim().toUpperCase();
  if (PRODUCT_TO_PAIR[normalizedSymbol]) {
    return PRODUCT_TO_PAIR[normalizedSymbol]!;
  }

  const compact = normalizedSymbol.replace(/[^A-Z0-9]/g, '');
  const fromKnownPairs = PAIRS.find(
    (item) =>
      item.id.toUpperCase() === compact ||
      item.coinbaseProduct.replace('-', '').toUpperCase() === compact,
  );

  if (fromKnownPairs) {
    return fromKnownPairs.id;
  }

  return compact;
}
