import styles from './MarketStrip.module.css';
import { fmtPrice, fmtNumber } from '../../../utils/formatters';
import type { Candle } from '../../../types/domain';

interface Props {
  candle: Candle;
}

export default function MarketStrip({ candle }: Props) {
  return (
    <div className={styles.strip}>
      <div className={styles.pill}>
        <p className={styles.label}>Open</p>
        <p className={styles.value}>${fmtPrice(candle.open)}</p>
      </div>
      <div className={styles.pill}>
        <p className={styles.label}>High</p>
        <p className={styles.value}>${fmtPrice(candle.high)}</p>
      </div>
      <div className={styles.pill}>
        <p className={styles.label}>Low</p>
        <p className={styles.value}>${fmtPrice(candle.low)}</p>
      </div>
      <div className={styles.pill}>
        <p className={styles.label}>Close</p>
        <p className={styles.value}>${fmtPrice(candle.close)}</p>
      </div>
      <div className={styles.pill}>
        <p className={styles.label}>Volume</p>
        <p className={styles.value}>{fmtNumber(candle.volume, 0)}</p>
      </div>
    </div>
  );
}
