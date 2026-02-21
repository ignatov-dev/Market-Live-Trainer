import React from 'react';
import { motion } from 'framer-motion';
import styles from './NewsTicker.module.css';

interface Props {
  items: string[];
  style?: React.CSSProperties | Record<string, unknown>;
}

export default function NewsTicker({ items, style }: Props) {
  return (
    <motion.div className={styles.ticker} role="status" aria-live="polite" style={style as React.CSSProperties}>
      <div className={styles.track}>
        {items.map((title, index) => (
          <span key={`${title}-${index}`} className={styles.item}>
            {title}
          </span>
        ))}
      </div>
    </motion.div>
  );
}
