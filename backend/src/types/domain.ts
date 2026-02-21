export type PositionSide = 'long' | 'short';
export type PositionStatus = 'open' | 'closed';
export type PositionCloseReason = 'take_profit' | 'stop_loss' | 'manual' | 'system';

export interface Position {
  id: string;
  userId: string;
  symbol: string;
  side: PositionSide;
  quantity: number;
  entryPrice: number;
  takeProfit: number | null;
  stopLoss: number | null;
  status: PositionStatus;
  closePrice: number | null;
  closePnl: number | null;
  closeReason: PositionCloseReason | null;
  createdAt: Date;
  updatedAt: Date;
  closedAt: Date | null;
}

export interface CreatePositionInput {
  userId: string;
  symbol: string;
  side: PositionSide;
  quantity: number;
  entryPrice: number;
  takeProfit: number | null;
  stopLoss: number | null;
}

export interface ClosePositionInput {
  closePrice: number;
  closeReason: PositionCloseReason;
  closedAt: Date;
  userId?: string;
}

export interface PriceTick {
  symbol: string;
  price: number;
  time: Date;
}

export interface PositionEvent {
  type: 'position.closed' | 'position.created';
  position: Position;
  source: 'engine' | 'api';
}

export interface PositionPnlUpdate {
  positionId: string;
  symbol: string;
  side: PositionSide;
  quantity: number;
  entryPrice: number;
  markPrice: number;
  unrealizedPnl: number;
  paidOpenFee: number;
  estimatedCloseFee: number;
  unrealizedNetPnl: number;
  unrealizedTotalNetPnl: number;
}

export interface TradingAccount {
  userId: string;
  initialBalance: number;
  cashBalance: number;
  createdAt: Date;
  updatedAt: Date;
}
