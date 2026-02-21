import { PAIRS } from '../constants/market';

export function fmtPrice(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '-';
  }
  if (value >= 1000) {
    return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  if (value >= 1) {
    return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
  }
  return value.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

export function fmtPriceScale(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '-';
  }
  if (value >= 1000) {
    return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (value >= 1) {
    return value.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  }
  return value.toLocaleString(undefined, { minimumFractionDigits: 6, maximumFractionDigits: 6 });
}

export function fmtSigned(value: number | null | undefined, digits = 2): string {
  const safe = Number(value ?? 0);
  const abs = Math.abs(safe).toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
  return safe >= 0 ? `+$${abs}` : `-$${abs}`;
}

export function fmtNumber(value: number | null | undefined, digits = 2): string {
  return Number(value ?? 0).toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

export function fmtPct(value: number | null | undefined, digits = 2): string {
  if (!Number.isFinite(value)) {
    return '-';
  }
  return `${(value as number) >= 0 ? '+' : ''}${fmtNumber(value, digits)}%`;
}

export function candleLabel(ts: number): string {
  return new Date(ts).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function candleAxisLabel(ts: number): string {
  const date = new Date(ts);
  if (!Number.isFinite(date.getTime())) {
    return '-';
  }
  const day = date.getDate();
  const month = date.toLocaleString([], { month: 'short' });
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${day} ${month} ${time}`;
}

export function candleTooltipLabel(ts: number): string {
  return new Date(ts).toLocaleString([], {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function newsTimestampLabel(ts: number | string): string {
  const ms = typeof ts === 'string' ? new Date(ts).getTime() : ts;
  if (!Number.isFinite(ms) || ms <= 0) {
    return 'Date unavailable';
  }
  return new Date(ms).toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function getPairBaseSymbol(pairId: string): string {
  if (typeof pairId !== 'string' || pairId.length === 0) {
    return '';
  }
  const knownSuffixes = ['USDT', 'USDC', 'BUSD', 'USD', 'EUR', 'BTC', 'ETH'] as const;
  for (const suffix of knownSuffixes) {
    if (pairId.endsWith(suffix) && pairId.length > suffix.length) {
      return pairId.slice(0, -suffix.length);
    }
  }
  return pairId;
}

export function getPairCompactLabel(pairId: string): string {
  const label = PAIRS.find((item) => item.id === pairId)?.label ?? pairId;
  return String(label).replace(/\s+/g, '');
}
