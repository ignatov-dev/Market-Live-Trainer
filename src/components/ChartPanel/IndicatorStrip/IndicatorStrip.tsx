import { useMemo } from 'react';
import styles from './IndicatorStrip.module.css';
import { fmtFixedPrice } from '../../../utils/formatters';
import {
  SMA_COLORS,
  SMA_PERIODS,
} from '../../../constants/indicators';
import type { Candle } from '../../../types/domain';
import type { SmaConfig, SmaPeriod } from '../../../constants/indicators';

interface Props {
  candles: Candle[];
  pricePrecision: number;
  smaConfig: SmaConfig;
  isLoading: boolean;
  onToggleSma: (period: SmaPeriod) => void;
}

const computeLastSma = (candles: Candle[], period: number) => {
  if (candles.length < period) {
    return null;
  }
  let sum = 0;
  for (let i = candles.length - period; i < candles.length; i += 1) {
    sum += Number(candles[i]?.close ?? 0);
  }
  return sum / period;
};

export default function IndicatorStrip({
  candles,
  pricePrecision,
  smaConfig,
  isLoading,
  onToggleSma,
}: Props) {
  if (isLoading) {
    return null;
  }
  const latestSma = useMemo(() => {
    return SMA_PERIODS.reduce((acc, period) => {
      acc[period] = computeLastSma(candles, period);
      return acc;
    }, {} as Record<SmaPeriod, number | null>);
  }, [candles]);

  return (
    <div className={styles.strip} aria-label="Chart indicators">
      {SMA_PERIODS.map((period) => {
        const isActive = smaConfig[period];
        const value = latestSma[period];
        const displayValue = isActive
          ? value === null
            ? '-'
            : `$${fmtFixedPrice(value, pricePrecision)}`
          : 'Off';
        const displayText = `SMA ${period}: ${displayValue}`;
        return (
          <button
            key={period}
            type="button"
            className={`${styles.pill}${isActive ? ` ${styles.isActive}` : ''}`}
            onClick={() => onToggleSma(period)}
            aria-pressed={isActive}
          >
            <span className={styles.label} aria-hidden="true">
              <span
                className={styles.dot}
                style={{ background: SMA_COLORS[period] }}
                aria-hidden="true"
              />
            </span>
            <span
              className={`${styles.singleLine}${isActive ? '' : ` ${styles.isMuted}`}`}
            >
              {displayText}
            </span>
          </button>
        );
      })}
    </div>
  );
}
