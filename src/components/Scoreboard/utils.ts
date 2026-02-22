import type { ScoreboardEntry, RankedGroups } from './types';

export function groupUsersByRank(entries: ScoreboardEntry[]): RankedGroups {
  const sorted = [...entries].sort((a, b) => b.netPnl - a.netPnl);
  return {
    gold:   sorted.slice(0, 1),
    silver: sorted.slice(1, 2),
    bronze: sorted.slice(2, 3),
  };
}

export function formatNetPnl(value: number): string {
  const sign = value >= 0 ? '+' : '-';
  return `${sign}$${Math.abs(value).toFixed(2)}`;
}

const PHRASES = {
  1: [
    'You lead this ride. Keep going!',
    'Top of the board — defend your crown.',
    'You set the pace. Stay unstoppable.',
  ],
  2: [
    "Right on the leader's heels — push harder.",
    'So close to the top — seize the moment.',
    'One strong move can take the lead.',
  ],
  3: [
    'Strong position — the top is within reach.',
    'On the podium — now aim higher.',
    'Momentum is yours — climb further.',
  ],
  other: [
    'Every trade is a new chance to rise.',
    'Keep pushing — the leaderboard shifts fast.',
    'Your next move could change everything.',
    'Stay focused. Progress beats position.',
    'The comeback starts now.',
  ],
} as const;

export function getScoreboardPhrase(rank: number, userId: string): string {
  const seed = userId.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const group =
    rank === 1 ? PHRASES[1] :
    rank === 2 ? PHRASES[2] :
    rank === 3 ? PHRASES[3] :
    PHRASES.other;
  return group[seed % group.length]!;
}

export function decodeJwtUserId(token: string): string | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(json) as Record<string, unknown>;
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

export function ordinalRank(n: number): string {
  const s = n % 100;
  if (s >= 11 && s <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}
