import { useMemo } from 'react';
import styles from './SessionSummary.module.css';
import { fmtNumber, fmtPct, fmtSigned } from '../../../utils/formatters';
import { INITIAL_BALANCE } from '../../../constants/trading';
import { getUsedMargin } from '../../../utils/trading';
import { useSessionResetController } from '../../../hooks/useSessionResetController';
import { useAppSelector } from '../../../store/hooks';
import type { SessionMetrics, Session } from '../../../types/domain';

interface Props {
  metrics: SessionMetrics;
  session: Session;
  authSessionEmail?: string | null;
  onSignOut: () => void;
}

export default function SessionSummary({
  metrics,
  session,
  onSignOut,
}: Props) {
  const { resetSession } = useSessionResetController();
  const backendAccount = useAppSelector((s) => s.backend.backendAccount);
  const cashBalance = useMemo(
    () => {
      const backendCash = Number(backendAccount?.cashBalance);
      if (Number.isFinite(backendCash)) {
        return Math.max(backendCash, 0);
      }
      return Math.max(session.balance, 0);
    },
    [backendAccount?.cashBalance, session.balance],
  );
  const balanceValue = Number.isFinite(metrics.equity) ? metrics.equity : cashBalance;
  const availableMargin = useMemo(
    () => Math.max(balanceValue - getUsedMargin(session), 0),
    [balanceValue, session],
  );
  const initialBalance = useMemo(() => {
    const backendInitial = Number(backendAccount?.initialBalance);
    return Number.isFinite(backendInitial) && backendInitial > 0
      ? backendInitial
      : INITIAL_BALANCE;
  }, [backendAccount?.initialBalance]);
  const sessionReturn = useMemo(
    () => ((metrics.equity - initialBalance) / initialBalance) * 100,
    [initialBalance, metrics.equity],
  );
  const netPnl = Number.isFinite(metrics.netPnl) ? metrics.netPnl : 0;
  const canResetSession =
    (Number.isFinite(Number(backendAccount?.cashBalance))
      ? Number(backendAccount?.cashBalance) !== INITIAL_BALANCE
      : session.balance !== INITIAL_BALANCE) ||
    session.positions.length > 0 ||
    session.pendingOrders.length > 0 ||
    session.closedTrades.length > 0 ||
    session.sequence > 1;

  return (
    <>
      <div className={styles.header}>
        <p className={styles.title}>Session Snapshot</p>
        <div className={styles.headerActions}>
          {canResetSession ? (
            <button type="button" className={styles.resetBtn} onClick={resetSession}>
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
          <span>Balance</span>
          <strong className={styles.valueInline}>
            <span className={styles.valuePrimary}>${fmtNumber(balanceValue)}</span>
            <span
              className={`${styles.valueDelta} ${netPnl >= 0 ? styles.valuePos : styles.valueNeg}`}
            >
              {fmtSigned(netPnl)}
            </span>
          </strong>
        </p>
        <p>
          <span>Available Margin</span>
          <strong>${fmtNumber(availableMargin)}</strong>
        </p>
        <p>
          <span>Cash Balance</span>
          <strong>${fmtNumber(cashBalance)}</strong>
        </p>
        <p>
          <span>Session Return</span>
          <strong className={sessionReturn >= 0 ? styles.valuePos : styles.valueNeg}>{fmtPct(sessionReturn)}</strong>
        </p>
      </div>
    </>
  );
}
