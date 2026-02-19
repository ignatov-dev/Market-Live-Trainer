export type PositionSide = 'long' | 'short';
export type PositionStatus = 'open' | 'closed';
export type PositionCloseReason = 'take_profit' | 'stop_loss' | 'manual' | 'system';

export interface Position {
  id: string;
  userId: string;
  symbol: string;
  side: PositionSide;
  entryPrice: number;
  takeProfit: number | null;
  stopLoss: number | null;
  status: PositionStatus;
  closePrice: number | null;
  closeReason: PositionCloseReason | null;
  createdAt: Date;
  updatedAt: Date;
  closedAt: Date | null;
}

export interface CreatePositionInput {
  userId: string;
  symbol: string;
  side: PositionSide;
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
