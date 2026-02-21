import React, { useCallback } from 'react';
import styles from './ChartPanel.module.css';
import CandleChart from '../CandleChart/CandleChart';
import MarketStrip from './MarketStrip/MarketStrip';
import OpenPositionsList from './OpenPositionsList/OpenPositionsList';
import { PAIRS, TIMEFRAMES } from '../../constants/market';
import { useChartCanvasController } from '../CandleChart/hooks/useChartCanvasController';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  setPair,
  setTimeframeId,
  setChartEndIndex,
  setChartMarkerTooltip,
  setChartViewSize,
  triggerResize,
} from '../../store/slices/chartSlice';
import type {
  Candle,
  ChartMarkerTooltip,
} from '../../types/domain';

interface Props {
  candles: Candle[];
  currentCandle: Candle;
}

export default function ChartPanel({
  candles,
  currentCandle,
}: Props) {
  const dispatch = useAppDispatch();
  const pair = useAppSelector((s) => s.chart.pair);
  const timeframeId = useAppSelector((s) => s.chart.timeframeId);
  const isLoadingData = useAppSelector((s) => s.chart.isLoadingData);
  const session = useAppSelector((s) => s.session.session);
  const chartViewSize = useAppSelector((s) => s.chart.chartViewSize);
  const chartEndIndex = useAppSelector((s) => s.chart.chartEndIndex);
  const chartMarkerTooltip = useAppSelector((s) => s.chart.chartMarkerTooltip);
  const resizeToken = useAppSelector((s) => s.chart.resizeToken);
  const currentPairPositions = session.positions.filter((item) => item.pair === pair);
  const currentPairClosedTrades = session.closedTrades.filter((item) => item.pair === pair);
  const handleChartViewSizeChange = useCallback(
    (next: number) => dispatch(setChartViewSize(next)),
    [dispatch],
  );
  const handleChartEndIndexChange = useCallback(
    (next: number | null) => dispatch(setChartEndIndex(next)),
    [dispatch],
  );
  const handleChartMarkerTooltipChange = useCallback(
    (next: ChartMarkerTooltip | null) => dispatch(setChartMarkerTooltip(next)),
    [dispatch],
  );
  const handleChartTriggerResize = useCallback(() => dispatch(triggerResize()), [dispatch]);

  const {
    chartWrapRef,
    chartRef,
    hasCustomChartScale,
    canPanChartRight,
    handleChartMouseMove,
    handleChartMouseLeave,
    panChartRight,
    resetChartScale,
  } = useChartCanvasController({
    candles,
    currentPairPositions,
    currentPairClosedTrades,
    timeframeId,
    pair,
    isLoadingData,
    chartViewSize,
    chartEndIndex,
    chartMarkerTooltip,
    resizeToken,
    onChartViewSizeChange: handleChartViewSizeChange,
    onChartEndIndexChange: handleChartEndIndexChange,
    onChartMarkerTooltipChange: handleChartMarkerTooltipChange,
    onTriggerResize: handleChartTriggerResize,
  });

  return (
    <section className="panel chart-panel">
      <div className={`panel-head ${styles.chartPanelHead}`}>
        <div className={styles.chartPairsNav} role="tablist" aria-label="Trading pairs">
          {PAIRS.map((item, index) => {
            const isActive = pair === item.id;
            return (
              <div key={item.id} className={styles.chartTabItem}>
                <button
                  type="button"
                  className={`${styles.chartPairTab}${isActive ? ` ${styles.isActive}` : ''}`}
                  onClick={() => dispatch(setPair(item.id))}
                  role="tab"
                  aria-selected={isActive}
                >
                  {item.label}
                </button>
                {index < PAIRS.length - 1 ? <span className={styles.chartTabDivider} aria-hidden="true" /> : null}
              </div>
            );
          })}
        </div>
        <div className={styles.inlineControls}>
          <div className={styles.chartTimeframesNav} role="tablist" aria-label="Chart timeframe">
            {TIMEFRAMES.map((item, index) => {
              const isActive = timeframeId === item.id;
              return (
                <div key={item.id} className={styles.chartTabItem}>
                  <button
                    type="button"
                    className={`${styles.chartTimeframeTab}${isActive ? ` ${styles.isActive}` : ''}`}
                    onClick={() => dispatch(setTimeframeId(item.id))}
                    role="tab"
                    aria-selected={isActive}
                  >
                    {item.label}
                  </button>
                  {index < TIMEFRAMES.length - 1 ? <span className={styles.chartTabDivider} aria-hidden="true" /> : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <MarketStrip candle={currentCandle} />

      <CandleChart
        isLoading={isLoadingData}
        chartWrapRef={chartWrapRef}
        chartRef={chartRef}
        onMouseMove={handleChartMouseMove}
        onMouseLeave={handleChartMouseLeave}
        hasCustomChartScale={hasCustomChartScale}
        canPanChartRight={canPanChartRight}
        onResetScale={resetChartScale}
        onPanRight={panChartRight}
        chartMarkerTooltip={chartMarkerTooltip}
      />

      <OpenPositionsList />
    </section>
  );
}
