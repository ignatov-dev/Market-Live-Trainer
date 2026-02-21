import React from 'react';
import styles from './AnalyticsPanel.module.css';
import MetricCard from './MetricCard/MetricCard';
import EquityCurve from '../EquityCurve/EquityCurve';
import { fmtSigned, fmtNumber } from '../../utils/formatters';
import type { SessionMetrics, Session } from '../../types/domain';

interface Props {
  metrics: SessionMetrics;
  session: Session;
  closedTradesCount: number;
}

export default function AnalyticsPanel({ metrics, session, closedTradesCount }: Props) {
  return (
    <section className="panel analytics-panel">
      <div className="panel-head">
        <h2>Session Analytics</h2>
      </div>
      <div className={styles.metricsGrid}>
        <MetricCard label="Net PnL" value={fmtSigned(metrics.netPnl)} isPositive={metrics.netPnl >= 0} />
        <MetricCard
          label="Open PnL (incl. fees)"
          value={fmtSigned(metrics.openPnlInclFees)}
          isPositive={metrics.openPnlInclFees >= 0}
        />
        <MetricCard
          label="Realized PnL"
          value={fmtSigned(metrics.realizedPnl)}
          isPositive={metrics.realizedPnl >= 0}
        />
        <MetricCard label="Equity" value={`$${fmtNumber(metrics.equity)}`} />
        <MetricCard label="Win Rate" value={`${fmtNumber(metrics.winRate, 1)}%`} isPositive={metrics.winRate >= 50} />
        <MetricCard
          label="Profit Factor"
          value={metrics.profitFactor === null ? '-' : fmtNumber(metrics.profitFactor, 2)}
          isPositive={metrics.profitFactor === null ? null : metrics.profitFactor >= 1.2}
        />
        <MetricCard label="Max Drawdown" value={`${fmtNumber(metrics.maxDrawdown, 2)}%`} isPositive={false} />
        <MetricCard label="Avg R" value={metrics.avgR === null ? '-' : `${fmtNumber(metrics.avgR, 2)}R`} />
        <MetricCard
          label="Avg Hold"
          value={metrics.avgHold === null ? '-' : `${fmtNumber(metrics.avgHold, 1)} candles`}
        />
        <MetricCard label="Closed Trades" value={`${closedTradesCount}`} />
      </div>
      <EquityCurve equityHistory={session.equityHistory} />
    </section>
  );
}
