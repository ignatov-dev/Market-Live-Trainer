import React from 'react';
import styles from './ChartSkeleton.module.css';
import {
  SKELETON_PRICE_LABEL_WIDTHS,
  SKELETON_TIME_LABEL_WIDTHS,
  SKELETON_CANDLE_MODEL,
  SKELETON_RIGHT_GAP_RATIO,
} from '../chartConstants';

export default function ChartSkeleton() {
  return (
    <div className={styles.chartSkeleton} aria-hidden="true">
      <div className={styles.chartSkeletonGrid} />
      <div className={styles.chartSkeletonPriceAxis} />
      <div className={styles.chartSkeletonPriceLabels}>
        {SKELETON_PRICE_LABEL_WIDTHS.map((width, index) => (
          <span key={`skeleton-price-${width}-${index}`} style={{ width }} />
        ))}
      </div>
      <div
        className={styles.chartSkeletonCandles}
        style={
          {
            '--skeleton-gap-right': `${SKELETON_RIGHT_GAP_RATIO * 100}%`,
          } as React.CSSProperties
        }
      >
        {SKELETON_CANDLE_MODEL.map((item, index) => (
          <span
            key={`skeleton-candle-${index}`}
            className={`${styles.chartSkeletonCandle}${item.isBull ? ` ${styles.isBull}` : ` ${styles.isBear}`}`}
            style={
              {
                '--wick-top': `${item.wickTop}%`,
                '--wick-height': `${item.wickHeight}%`,
                '--body-top': `${item.bodyTop}%`,
                '--body-height': `${item.bodyHeight}%`,
                animationDelay: `${index * 22}ms`,
              } as React.CSSProperties
            }
          >
            <span className={styles.chartSkeletonWick} />
            <span className={styles.chartSkeletonBody} />
          </span>
        ))}
      </div>
      <div className={styles.chartSkeletonTimeAxis}>
        {SKELETON_TIME_LABEL_WIDTHS.map((width, index) => (
          <span key={`skeleton-time-${width}-${index}`} style={{ width }} />
        ))}
      </div>
    </div>
  );
}
