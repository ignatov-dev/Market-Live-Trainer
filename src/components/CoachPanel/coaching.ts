import { getAverageRange } from '../CandleChart/utils/patterns';
import { fmtNumber, fmtSigned } from '../../utils/formatters';
import type { Session, Candle, SessionMetrics, CoachReport } from '../../types/domain';

export function generateCoachReport(
  session: Session,
  candles: Candle[],
  metrics: SessionMetrics,
): CoachReport {
  const trades = session.closedTrades;
  if (trades.length < 3) {
    return {
      headline: 'Need More Trades For Reliable Coaching',
      summary:
        'At least 3 closed trades are needed for meaningful behavior analysis. Continue the replay and generate again.',
      mistakes: ['Not enough closed trades to establish repeatable patterns yet.'],
      improvements: [
        'Run another 30-50 candles and close more positions before reviewing.',
      ],
      score: 50,
    };
  }

  const issues: string[] = [];
  const improvements: string[] = [];

  const noStopCount = trades.filter((trade) => trade.stopLoss === null).length;
  const noStopRate = noStopCount / trades.length;

  if (noStopRate > 0.35) {
    issues.push(`Stops missing on ${Math.round(noStopRate * 100)}% of trades.`);
    improvements.push('Add a stop-loss to every trade and cap risk at 1-2% of equity.');
  }

  const highRiskCount = trades.filter(
    (trade) => trade.riskPct !== null && trade.riskPct > 2.5,
  ).length;
  if (highRiskCount / trades.length > 0.3) {
    issues.push('Position sizing was too aggressive relative to account size.');
    improvements.push(
      'Reduce size when stop distance is wide so per-trade risk stays controlled.',
    );
  }

  const plannedR = trades
    .map((trade) => trade.plannedR)
    .filter((value): value is number => Number.isFinite(value));
  const avgPlannedR =
    plannedR.length === 0
      ? null
      : plannedR.reduce((sum, value) => sum + value, 0) / plannedR.length;

  if (avgPlannedR !== null && avgPlannedR < 1.25) {
    issues.push(
      `Average planned reward-to-risk was ${fmtNumber(avgPlannedR, 2)}R, which is too low.`,
    );
    improvements.push(
      'Target setups with minimum 1.5R potential unless conviction is exceptionally high.',
    );
  }

  const chasingCount = trades.reduce((count, trade) => {
    const candle = candles[trade.openedAtIndex];
    if (!candle) {
      return count;
    }

    const range = candle.high - candle.low;
    if (range <= 0) {
      return count;
    }

    const body = Math.abs(candle.close - candle.open);
    const bodyRatio = body / range;
    const avgRange = getAverageRange(candles, trade.openedAtIndex, 14);
    const expansion = avgRange === 0 ? 0 : range / avgRange;

    const buyingBullBreak = trade.side === 'long' && candle.close > candle.open;
    const sellingBearBreak = trade.side === 'short' && candle.close < candle.open;

    if (bodyRatio > 0.62 && expansion > 1.3 && (buyingBullBreak || sellingBearBreak)) {
      return count + 1;
    }

    return count;
  }, 0);

  if (chasingCount / trades.length > 0.35) {
    issues.push('Entries often chased expanded momentum candles.');
    improvements.push(
      'Wait for pullbacks or structure retests before entering after large impulse candles.',
    );
  }

  if (trades.length > Math.max(10, session.replayIndex / 6)) {
    issues.push(
      'Trade frequency was high for the observed market window (overtrading risk).',
    );
    improvements.push(
      'Filter setups more aggressively and avoid back-to-back impulse entries.',
    );
  }

  if (metrics.winRate < 35 && metrics.netPnl < 0) {
    issues.push(
      `Win rate (${fmtNumber(metrics.winRate, 1)}%) and net PnL are both weak.`,
    );
    improvements.push(
      'Tighten entry criteria and prioritize trades aligned with prevailing trend context.',
    );
  }

  if (issues.length === 0) {
    issues.push('No major behavioral errors detected in this sample.');
    improvements.push(
      'Keep execution consistent and increase sample size before scaling risk.',
    );
  }

  const scorePenalty =
    issues.length * 8 +
    Math.max(0, 45 - metrics.winRate) * 0.25 +
    metrics.maxDrawdown * 0.4;
  const score = Math.max(15, Math.min(95, Math.round(85 - scorePenalty)));

  let headline = 'Balanced Session';
  if (score < 45) {
    headline = 'Risky Session Pattern';
  } else if (score < 65) {
    headline = 'Needs More Discipline';
  } else if (score > 80) {
    headline = 'Strong Session Execution';
  }

  const summary =
    metrics.netPnl >= 0
      ? `Session finished positive with ${fmtSigned(metrics.netPnl)} and max drawdown ${fmtNumber(metrics.maxDrawdown, 2)}%.`
      : `Session finished negative with ${fmtSigned(metrics.netPnl)} and max drawdown ${fmtNumber(metrics.maxDrawdown, 2)}%.`;

  return {
    headline,
    summary,
    mistakes: issues.slice(0, 3),
    improvements: improvements.slice(0, 3),
    score,
  };
}
