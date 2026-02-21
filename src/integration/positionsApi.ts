export type PositionSide = 'long' | 'short';
export type PositionStatus = 'open' | 'closed';

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
  closeReason: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
}

export interface TradingAccount {
  userId: string;
  initialBalance: number;
  cashBalance: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePositionPayload {
  symbol: string;
  side: PositionSide;
  quantity: number;
  entryPrice: number;
  takeProfit: number | null;
  stopLoss: number | null;
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').trim();
const INITIAL_API_AUTH_TOKEN = (import.meta.env.VITE_BACKEND_AUTH_TOKEN ?? '').trim();
let runtimeApiAuthToken = INITIAL_API_AUTH_TOKEN;

function resolveApiAuthToken(): string {
  return runtimeApiAuthToken.trim();
}

export function setBackendAuthToken(token: string | null | undefined): void {
  runtimeApiAuthToken = typeof token === 'string' ? token.trim() : '';
}

export function getBackendAuthToken(): string | null {
  const token = resolveApiAuthToken();
  return token.length > 0 ? token : null;
}

function buildApiUrl(path: string): string {
  if (API_BASE_URL.length > 0) {
    return `${API_BASE_URL}${path}`;
  }

  return path;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const authToken = resolveApiAuthToken();
  if (authToken.length === 0) {
    throw new Error('Backend auth token is missing. Sign in first.');
  }

  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${authToken}`);

  const hasBody = init?.body !== undefined && init?.body !== null;
  if (hasBody && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(buildApiUrl(path), {
    headers,
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

export async function listPositions(status?: PositionStatus): Promise<Position[]> {
  const params = new URLSearchParams();
  if (status) {
    params.set('status', status);
  }

  const queryString = params.toString();
  const data = await request<{ data: Position[] }>(queryString ? `/api/positions?${queryString}` : '/api/positions');
  return data.data;
}

export async function listClosedPositions(): Promise<Position[]> {
  const data = await request<{ data: Position[] }>('/api/positions/closed');
  return data.data;
}

export async function getTradingAccount(): Promise<TradingAccount> {
  const data = await request<{ data: TradingAccount }>('/api/account');
  return data.data;
}

export async function resetBackendSession(): Promise<TradingAccount> {
  const data = await request<{ data: TradingAccount }>('/api/session-reset', {
    method: 'POST',
  });
  return data.data;
}

export async function closePosition(
  positionId: string,
  closePrice: number,
): Promise<Position> {
  const data = await request<{ data: Position }>(`/api/positions/${positionId}/close`, {
    method: 'POST',
    body: JSON.stringify({
      closePrice,
      reason: 'manual',
    }),
  });

  return data.data;
}

export async function updatePositionBrackets(
  positionId: string,
  takeProfit: number | null,
  stopLoss: number | null,
): Promise<Position> {
  const data = await request<{ data: Position }>(`/api/positions/${positionId}/brackets`, {
    method: 'PATCH',
    body: JSON.stringify({
      takeProfit,
      stopLoss,
    }),
  });

  return data.data;
}

export function backendWsUrl(): string {
  const authToken = resolveApiAuthToken();
  if (authToken.length === 0) {
    throw new Error('Backend auth token is missing. Sign in first.');
  }

  const url = API_BASE_URL.length > 0
    ? new URL(API_BASE_URL)
    : new URL(
      `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`,
    );

  if (url.protocol === 'http:') {
    url.protocol = 'ws:';
  } else if (url.protocol === 'https:') {
    url.protocol = 'wss:';
  }

  url.pathname = '/ws';
  url.searchParams.set('token', authToken);
  return url.toString();
}

export function backendPositionsWsUrl(): string {
  const authToken = resolveApiAuthToken();
  if (authToken.length === 0) {
    throw new Error('Backend auth token is missing. Sign in first.');
  }

  const url = API_BASE_URL.length > 0
    ? new URL(API_BASE_URL)
    : new URL(
      `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`,
    );

  if (url.protocol === 'http:') {
    url.protocol = 'ws:';
  } else if (url.protocol === 'https:') {
    url.protocol = 'wss:';
  }

  url.pathname = '/ws/positions';
  url.searchParams.set('token', authToken);
  return url.toString();
}

export function backendMarketWsUrl(): string {
  const url = API_BASE_URL.length > 0
    ? new URL(API_BASE_URL)
    : new URL(
      `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`,
    );

  if (url.protocol === 'http:') {
    url.protocol = 'ws:';
  } else if (url.protocol === 'https:') {
    url.protocol = 'wss:';
  }

  url.pathname = '/ws/market';
  url.search = '';
  return url.toString();
}

export function backendAccountWsUrl(): string {
  const authToken = resolveApiAuthToken();
  if (authToken.length === 0) {
    throw new Error('Backend auth token is missing. Sign in first.');
  }

  const url = API_BASE_URL.length > 0
    ? new URL(API_BASE_URL)
    : new URL(
      `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`,
    );

  if (url.protocol === 'http:') {
    url.protocol = 'ws:';
  } else if (url.protocol === 'https:') {
    url.protocol = 'wss:';
  }

  url.pathname = '/ws/account';
  url.searchParams.set('token', authToken);
  return url.toString();
}
