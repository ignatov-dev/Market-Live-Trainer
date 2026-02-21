// ---------------------------------------------------------------------------
// Candle
// ---------------------------------------------------------------------------

export interface Candle {
  index: number;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// ---------------------------------------------------------------------------
// Pair / Timeframe
// ---------------------------------------------------------------------------

export interface Pair {
  id: string;
  label: string;
  coinbaseProduct: string;
  coinPaprikaId: string;
}

export interface Timeframe {
  id: string;
  label: string;
  bucketMs: number;
  restGranularitySeconds: number;
}

// ---------------------------------------------------------------------------
// Order ticket (form state)
// ---------------------------------------------------------------------------

export type OrderType = 'market' | 'limit';
export type TicketSide = 'buy' | 'sell';

export interface Ticket {
  type: OrderType;
  qty: string;
  limitPrice: string;
  stopLoss: string;
  takeProfit: string;
}

// ---------------------------------------------------------------------------
// Local session types
// ---------------------------------------------------------------------------

export type PositionSide = 'long' | 'short';

export interface LocalPosition {
  id: number;
  backendPositionId: string | null;
  pair: string;
  side: PositionSide;
  qty: number;
  entryPrice: number;
  stopLoss: number | null;
  takeProfit: number | null;
  openedAtIndex: number;
  openedAtTs: number;
  entryType: 'market' | 'limit';
  riskAmount: number | null;
  riskPct: number | null;
  plannedR: number | null;
}

export interface ClosedTrade {
  id: number;
  positionId: number;
  backendPositionId: string | null;
  pair: string;
  side: PositionSide;
  qty: number;
  entryPrice: number;
  exitPrice: number;
  openedAtIndex: number;
  closedAtIndex: number;
  openedAtTs: number;
  closedAtTs: number;
  durationCandles: number;
  reason: string;
  pnl: number;
  rawPnl: number;
  fee: number;
  stopLoss: number | null;
  takeProfit: number | null;
  plannedR: number | null;
  rMultiple: number | null;
  riskPct: number | null;
}

export interface PendingOrder {
  id: number;
  pair: string;
  side: TicketSide;
  qty: number;
  limitPrice: number;
  stopLoss: number | null;
  takeProfit: number | null;
}

export interface TimelineEvent {
  id: string;
  index: number;
  timestamp: number;
  text: string;
}

export interface EquityPoint {
  index: number;
  equity: number;
}

export interface Session {
  replayIndex: number;
  sequence: number;
  balance: number;
  positions: LocalPosition[];
  pendingOrders: PendingOrder[];
  closedTrades: ClosedTrade[];
  timeline: TimelineEvent[];
  equityHistory: EquityPoint[];
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

export interface SessionMetrics {
  unrealized: number;
  openPnlInclFees: number;
  realizedPnl: number;
  equity: number;
  netPnl: number;
  grossProfit: number;
  grossLossAbs: number;
  profitFactor: number | null;
  winRate: number;
  avgR: number | null;
  avgHold: number | null;
  maxDrawdown: number;
}

// ---------------------------------------------------------------------------
// Chart / UI
// ---------------------------------------------------------------------------

export interface ChartMarkerTooltipLine {
  label?: string;
  value?: string;
}

export interface ChartMarkerTooltipEntry {
  id: string;
  title: string;
  lines: Array<ChartMarkerTooltipLine | string | null>;
}

export interface ChartMarkerTooltip {
  id: string;
  x: number;
  y: number;
  title: string;
  entries: ChartMarkerTooltipEntry[];
}

export interface PositionBracketEditor {
  isOpen: boolean;
  positionId: number | null;
  stopLoss: string;
  takeProfit: string;
  error: string;
}

// ---------------------------------------------------------------------------
// Pattern notifications
// ---------------------------------------------------------------------------

export interface PatternNotification {
  id: string;
  pattern: string;
  description: string;
  ts: number;
  candleTs: number;
}

// ---------------------------------------------------------------------------
// News
// ---------------------------------------------------------------------------

export interface NewsItem {
  id: string;
  title: string;
  summary?: string;
  timestamp: string;
  link?: string;
}

// ---------------------------------------------------------------------------
// Datasets
// ---------------------------------------------------------------------------

export type Datasets = Record<string, Candle[]>;
export type NewsByPair = Record<string, NewsItem[]>;

// ---------------------------------------------------------------------------
// Backend PnL updates
// ---------------------------------------------------------------------------

export interface BackendPnlEntry {
  markPrice: number;
  unrealizedNetPnl: number;
  unrealizedTotalNetPnl: number;
}

export type BackendPnlByPositionId = Record<string, BackendPnlEntry>;

// ---------------------------------------------------------------------------
// Backend closed position (from positionsApi)
// ---------------------------------------------------------------------------

export interface BackendPosition {
  id: string;
  userId: string;
  symbol: string;
  side: PositionSide;
  quantity: number;
  entryPrice: number;
  takeProfit: number | null;
  stopLoss: number | null;
  status: 'open' | 'closed';
  closePrice: number | null;
  closePnl: number | null;
  closeReason: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
}

export interface BackendTradingAccount {
  userId: string;
  initialBalance: number;
  cashBalance: number;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Coach report
// ---------------------------------------------------------------------------

export interface CoachReport {
  headline: string;
  summary: string;
  mistakes: string[];
  improvements: string[];
  score: number;
}

// ---------------------------------------------------------------------------
// Marks by pair (latest price per pair)
// ---------------------------------------------------------------------------

export type MarksByPair = Record<string, number>;
