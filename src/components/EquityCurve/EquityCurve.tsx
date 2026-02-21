import { useEffect, useRef } from 'react';
import styles from './EquityCurve.module.css';
import { drawEquityCurve } from './drawEquityCurve';
import { useAppSelector } from '../../store/hooks';
import type { EquityPoint } from '../../types/domain';

interface Props {
  equityHistory: EquityPoint[];
}

export default function EquityCurve({ equityHistory }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const resizeToken = useAppSelector((s) => s.chart.resizeToken);

  useEffect(() => {
    if (!canvasRef.current) {
      return;
    }
    drawEquityCurve(canvasRef.current, equityHistory);
  }, [equityHistory, resizeToken]);

  return (
    <div className={styles.wrap}>
      <h3>Equity Curve</h3>
      <canvas ref={canvasRef} aria-label="Equity curve" />
    </div>
  );
}
