import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import styles from './Tabs.module.css';

interface TabItem {
  value: string;
  label: string;
  disabled?: boolean;
}

interface IndicatorRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface Props {
  items: TabItem[];
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
}

export default function Tabs({
  items,
  value,
  onChange,
  ariaLabel = 'Tabs',
  className = '',
  disabled = false,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [indicatorRect, setIndicatorRect] = useState<IndicatorRect | null>(null);

  const setTabRef = useCallback((tabValue: string, node: HTMLButtonElement | null) => {
    if (node) {
      tabRefs.current.set(tabValue, node);
      return;
    }
    tabRefs.current.delete(tabValue);
  }, []);

  const updateIndicator = useCallback(() => {
    const container = containerRef.current;
    const activeTab = tabRefs.current.get(value);

    if (!container || !activeTab) {
      setIndicatorRect(null);
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const activeRect = activeTab.getBoundingClientRect();
    const nextRect: IndicatorRect = {
      left: activeRect.left - containerRect.left,
      top: activeRect.top - containerRect.top,
      width: activeRect.width,
      height: activeRect.height,
    };

    setIndicatorRect((previous) => {
      if (
        previous &&
        previous.left === nextRect.left &&
        previous.top === nextRect.top &&
        previous.width === nextRect.width &&
        previous.height === nextRect.height
      ) {
        return previous;
      }
      return nextRect;
    });
  }, [value]);

  useLayoutEffect(() => {
    const rafId = window.requestAnimationFrame(updateIndicator);
    return () => window.cancelAnimationFrame(rafId);
  }, [updateIndicator, items]);

  useEffect(() => {
    window.addEventListener('resize', updateIndicator);
    return () => window.removeEventListener('resize', updateIndicator);
  }, [updateIndicator]);

  return (
    <div
      ref={containerRef}
      className={`${styles.root} ${className}`.trim()}
      role="tablist"
      aria-label={ariaLabel}
    >
      {indicatorRect ? (
        <motion.span
          className={styles.activeIndicator}
          animate={{
            x: indicatorRect.left,
            y: indicatorRect.top,
            width: indicatorRect.width,
            height: indicatorRect.height,
          }}
          initial={false}
          transition={{ type: 'spring', stiffness: 360, damping: 34, mass: 0.4 }}
        />
      ) : null}
      {items.map((item) => {
        const isActive = item.value === value;
        const isItemDisabled = disabled || item.disabled;

        return (
          <button
            key={item.value}
            ref={(node) => setTabRef(item.value, node)}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`${styles.tab} ${isActive ? styles.active : ''}`.trim()}
            onClick={() => onChange(item.value)}
            disabled={isItemDisabled}
          >
            <span className={styles.label}>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
