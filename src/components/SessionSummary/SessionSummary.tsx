import styles from './SessionSummary.module.css';
import { fmtNumber, fmtPct } from '../../utils/formatters';
import type { SessionMetrics, Session } from '../../types/domain';

interface Props {
  metrics: SessionMetrics;
  session: Session;
  availableBalance: number;
  sessionReturn: number;
  canResetSession: boolean;
  authSessionEmail?: string | null;
  onReset: () => void;
  onSignOut: () => void;
}

export default function SessionSummary({
  metrics,
  session,
  availableBalance,
  sessionReturn,
  canResetSession,
  onReset,
  onSignOut,
}: Props) {
  return (
    <>
      <div className={styles.header}>
        <p className={styles.title}>Session Snapshot</p>
        <div className={styles.headerActions}>
          {canResetSession ? (
            <button type="button" className={styles.resetBtn} onClick={onReset}>
              Reset session
            </button>
          ) : null}
          <button type="button" className={styles.resetBtn} onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </div>
      <div className={styles.grid}>
        <p>
          <span>Source</span>
          <strong>Coinbase</strong>
        </p>
        <p>
          <span>Mode</span>
          <strong>Live</strong>
        </p>
        <p>
          <span>Available Balance</span>
          <strong>${fmtNumber(availableBalance)}</strong>
        </p>
        <p>
          <span>Equity</span>
          <strong>${fmtNumber(metrics.equity)}</strong>
        </p>
        <p>
          <span>Session Return</span>
          <strong className={sessionReturn >= 0 ? styles.valuePos : styles.valueNeg}>{fmtPct(sessionReturn)}</strong>
        </p>
        <p>
          <span>Positions</span>
          <strong>
            {session.positions.length} open / {session.pendingOrders.length} pending
          </strong>
        </p>
      </div>
    </>
  );
}
