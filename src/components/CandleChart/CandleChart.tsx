import React from 'react';
import { FiArrowRight } from 'react-icons/fi';
import { LuRotateCcw } from 'react-icons/lu';
import styles from './CandleChart.module.css';
import ChartSkeleton from './ChartSkeleton/ChartSkeleton';
import ChartMarkerTooltip from './ChartMarkerTooltip/ChartMarkerTooltip';

interface TooltipLine {
  label?: string;
  value?: string;
}

interface TooltipEntry {
  id: string;
  title: string;
  lines: Array<TooltipLine | string | null>;
}

interface TooltipData {
  id: string;
  x: number;
  y: number;
  title: string;
  entries: TooltipEntry[];
}

interface Props {
  isLoading: boolean;
  chartWrapRef: React.RefObject<HTMLDivElement | null>;
  chartRef: React.RefObject<HTMLCanvasElement | null>;
  onMouseMove: (e: React.MouseEvent<HTMLDivElement>) => void;
  onMouseLeave: () => void;
  hasCustomChartScale: boolean;
  canPanChartRight: boolean;
  onResetScale: () => void;
  onPanRight: () => void;
  chartMarkerTooltip?: TooltipData | null;
  chartViewSize?: number | null;
}

export default function CandleChart({
  isLoading,
  chartWrapRef,
  chartRef,
  onMouseMove,
  onMouseLeave,
  hasCustomChartScale,
  canPanChartRight,
  onResetScale,
  onPanRight,
  chartMarkerTooltip,
}: Props) {
  return (
    <div className={styles.chartStage}>
      <div
        className={styles.chartWrap}
        ref={chartWrapRef}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
      >
        {isLoading ? <ChartSkeleton /> : <canvas ref={chartRef} aria-label="Live candlestick chart" />}
      </div>
      {hasCustomChartScale || canPanChartRight ? (
        <div className={styles.chartOverlayControls}>
          {hasCustomChartScale ? (
            <button
              type="button"
              className={styles.chartResetScaleBtn}
              onClick={onResetScale}
              aria-label="Reset chart scale"
              title="Reset scale"
            >
              <LuRotateCcw aria-hidden="true" />
            </button>
          ) : null}
          {canPanChartRight ? (
            <button
              type="button"
              className={styles.chartPanRightBtn}
              onClick={onPanRight}
              aria-label="Pan chart right"
              title="Pan right"
            >
              <FiArrowRight aria-hidden="true" />
            </button>
          ) : null}
        </div>
      ) : null}
      <ChartMarkerTooltip tooltip={chartMarkerTooltip} />
    </div>
  );
}
