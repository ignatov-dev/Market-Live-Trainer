import styles from './OpenPositionCard.module.css';
import { fmtPrice, fmtNumber, fmtSigned, getPairBaseSymbol } from '../../../../utils/formatters';
import { PAIRS } from '../../../../constants/market';
import type { LocalPosition } from '../../../../types/domain';

interface Props {
  position: LocalPosition;
  markPrice: number | null;
  totalNetEstimated: number;
  onClose: (id: number) => void;
  onOpenBracketEditor: () => void;
}

export default function OpenPositionCard({ position, markPrice: _markPrice, totalNetEstimated, onClose, onOpenBracketEditor }: Props) {
  const hasTakeProfit = position.takeProfit !== null;
  const hasStopLoss = position.stopLoss !== null;
  const takeProfitValue = position.takeProfit !== null ? fmtPrice(position.takeProfit) : '-';
  const stopLossValue = position.stopLoss !== null ? fmtPrice(position.stopLoss) : '-';
  const pairLabel = PAIRS.find((item) => item.id === position.pair)?.label ?? position.pair;

  return (
    <article className={`${styles.card} ${totalNetEstimated >= 0 ? styles.isPos : styles.isNeg}`}>
      <header className={styles.cardHead}>
        <span className={`${styles.badge} ${position.side === 'long' ? styles.long : styles.short}`}>
          {position.side.toUpperCase()}
        </span>
        <span className={styles.cardPair}>{pairLabel}</span>
      </header>

      <div className={styles.cardBody}>
        <p className={styles.cardRow}>
          <span>Qty</span>
          <span className={styles.cardValue}>{fmtNumber(position.qty, 3)} {getPairBaseSymbol(position.pair)}</span>
        </p>
        <p className={styles.cardRow}>
          <span>Entry</span>
          <span className={styles.cardValue}>${fmtPrice(position.entryPrice)}</span>
        </p>
        <p className={styles.cardRow}>
          <span>Take profit</span>
          <span className={`${styles.cardValue} ${styles.bracketsCell}`}>
            {hasTakeProfit ? (
              <button
                type="button"
                className={`${styles.closeBtn} ${styles.bracketTrigger}`}
                onClick={onOpenBracketEditor}
                aria-label={`Configure take-profit and stop-loss for position ${position.id}`}
              >
                {takeProfitValue}
              </button>
            ) : !hasStopLoss ? (
              <button
                type="button"
                className={styles.closeBtn}
                onClick={onOpenBracketEditor}
              >
                Configure
              </button>
            ) : (
              <span>-</span>
            )}
          </span>
        </p>
        <p className={styles.cardRow}>
          <span>Stop loss</span>
          <span className={`${styles.cardValue} ${styles.bracketsCell}`}>
            {hasStopLoss ? (
              <button
                type="button"
                className={`${styles.closeBtn} ${styles.bracketTrigger}`}
                onClick={onOpenBracketEditor}
                aria-label={`Configure take-profit and stop-loss for position ${position.id}`}
              >
                {stopLossValue}
              </button>
            ) : !hasTakeProfit ? (
              <button
                type="button"
                className={styles.closeBtn}
                onClick={onOpenBracketEditor}
              >
                Configure
              </button>
            ) : (
              <span>-</span>
            )}
          </span>
        </p>
        <p className={styles.cardRow}>
          <span>Profit/Loss (incl. fees)</span>
          <span className={`${styles.cardValue} ${totalNetEstimated >= 0 ? styles.metricPos : styles.metricNeg}`}>
            {fmtSigned(totalNetEstimated)}
          </span>
        </p>
      </div>

      <footer className={styles.cardFoot}>
        <button
          type="button"
          className={`${styles.closeBtn} ${styles.closeBtnFooter}`}
          onClick={() => onClose(position.id)}
        >
          Close position
        </button>
      </footer>
    </article>
  );
}
