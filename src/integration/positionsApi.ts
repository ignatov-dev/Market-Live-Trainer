export type PositionSide = 'long' | 'short';
export type PositionStatus = 'open' | 'closed';

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
  closeReason: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
}

export interface CreatePositionPayload {
  userId: string;
  symbol: string;
  side: PositionSide;
  entryPrice: number;
  takeProfit: number | null;
  stopLoss: number | null;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  const payload = (await response.json()) as T | { error: string };

  if (!response.ok) {
    throw new Error((payload as { error?: string }).error ?? `HTTP ${response.status}`);
  }

  return payload as T;
}

export async function createPosition(body: CreatePositionPayload): Promise<Position> {
  const data = await request<{ data: Position }>('/api/positions', {
    method: 'POST',
    body: JSON.stringify(body),
  });

  return data.data;
}

export async function listPositions(userId: string, status?: PositionStatus): Promise<Position[]> {
  const params = new URLSearchParams({ userId });
  if (status) {
    params.set('status', status);
  }

  const data = await request<{ data: Position[] }>(`/api/positions?${params.toString()}`);
  return data.data;
}

export async function closePosition(
  userId: string,
  positionId: string,
  closePrice: number,
): Promise<Position> {
  const data = await request<{ data: Position }>(`/api/positions/${positionId}/close`, {
    method: 'POST',
    body: JSON.stringify({
      userId,
      closePrice,
      reason: 'manual',
    }),
  });

  return data.data;
}

export function backendWsUrl(userId: string): string {
  const url = new URL(API_BASE_URL.replace('http', 'ws'));
  url.pathname = '/ws';
  url.searchParams.set('userId', userId);
  return url.toString();
}
