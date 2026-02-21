import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  CHART_PAN_SENSITIVITY,
  CHART_PAN_TO_LIVE_MAX_MS,
  CHART_PAN_TO_LIVE_MIN_MS,
  CHART_ZOOM_SENSITIVITY,
  DEFAULT_CHART_VIEW_SIZE,
} from '../chartConstants';
import { clampChartViewSize, easeOutCubic } from '../utils/candles';
import { drawCandles } from '../drawCandles';
import type { Candle, ChartMarkerTooltip, ClosedTrade, LocalPosition } from '../../../types/domain';
import type { ChartCrosshair, MarkerHotspot } from '../drawCandles';

interface Params {
  candles: Candle[];
  currentPairPositions: LocalPosition[];
  currentPairClosedTrades: ClosedTrade[];
  timeframeId: string;
  pair: string;
  isLoadingData: boolean;
  chartViewSize: number;
  chartEndIndex: number | null;
  chartMarkerTooltip: ChartMarkerTooltip | null;
  resizeToken: number;
  onChartViewSizeChange: (next: number) => void;
  onChartEndIndexChange: (next: number | null) => void;
  onChartMarkerTooltipChange: (next: ChartMarkerTooltip | null) => void;
  onTriggerResize: () => void;
}

interface Result {
  chartWrapRef: React.RefObject<HTMLDivElement | null>;
  chartRef: React.RefObject<HTMLCanvasElement | null>;
  chartViewSize: number;
  chartMarkerTooltip: ChartMarkerTooltip | null;
  hasCustomChartScale: boolean;
  canPanChartRight: boolean;
  handleChartMouseMove: (event: React.MouseEvent<HTMLDivElement>) => void;
  handleChartMouseLeave: () => void;
  panChartRight: () => void;
  resetChartScale: () => void;
  resetChartViewport: () => void;
}

export function useChartCanvasController({
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
  onChartViewSizeChange,
  onChartEndIndexChange,
  onChartMarkerTooltipChange,
  onTriggerResize,
}: Params): Result {
  const chartWrapRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartPanAnimationRef = useRef<number | null>(null);
  const chartCrosshairRef = useRef<ChartCrosshair | null>(null);
  const chartMarkerHotspotsRef = useRef<MarkerHotspot[]>([]);
  const chartHoveredMarkerIdRef = useRef<string | null>(null);
  const chartHoverRedrawRafRef = useRef<number | null>(null);
  const chartEndIndexRef = useRef<number | null>(chartEndIndex);
  const chartViewSizeRef = useRef(chartViewSize);
  const chartDrawStateRef = useRef({
    candles: [] as Candle[],
    replayIndex: 0,
    positions: [] as LocalPosition[],
    closedTrades: [] as ClosedTrade[],
    viewSize: DEFAULT_CHART_VIEW_SIZE,
    timeframeId,
  });

  chartEndIndexRef.current = chartEndIndex;
  chartViewSizeRef.current = chartViewSize;

  const hasCandles = candles.length > 0;
  const liveReplayIndex = hasCandles ? candles.length - 1 : 0;
  const chartReplayIndex = hasCandles
    ? chartEndIndex === null
      ? liveReplayIndex
      : Math.max(0, Math.min(chartEndIndex, liveReplayIndex))
    : 0;

  chartDrawStateRef.current = {
    candles,
    replayIndex: chartReplayIndex,
    positions: currentPairPositions,
    closedTrades: currentPairClosedTrades,
    viewSize: chartViewSize,
    timeframeId,
  };

  const hasCustomChartScale = useMemo(
    () => Math.abs(chartViewSize - DEFAULT_CHART_VIEW_SIZE) > 0.01,
    [chartViewSize],
  );
  const canPanChartRight = hasCandles && chartEndIndex !== null && chartReplayIndex < liveReplayIndex;

  const stopPanAnimation = useCallback(() => {
    if (chartPanAnimationRef.current !== null) {
      window.cancelAnimationFrame(chartPanAnimationRef.current);
      chartPanAnimationRef.current = null;
    }
  }, []);

  const redrawChartWithCurrentState = useCallback(() => {
    const canvas = chartRef.current;
    if (!canvas) {
      return;
    }

    const state = chartDrawStateRef.current;
    drawCandles(
      canvas,
      state.candles,
      state.replayIndex,
      state.positions,
      state.closedTrades,
      state.viewSize,
      state.timeframeId,
      chartCrosshairRef.current,
      chartMarkerHotspotsRef,
    );
  }, []);

  const requestChartHoverRedraw = useCallback(() => {
    if (chartHoverRedrawRafRef.current !== null) {
      return;
    }

    chartHoverRedrawRafRef.current = window.requestAnimationFrame(() => {
      chartHoverRedrawRafRef.current = null;
      redrawChartWithCurrentState();
    });
  }, [redrawChartWithCurrentState]);

  const resetChartViewport = useCallback(() => {
    stopPanAnimation();
    chartHoveredMarkerIdRef.current = null;
    chartCrosshairRef.current = null;
    onChartEndIndexChange(null);
    onChartMarkerTooltipChange(null);
  }, [onChartEndIndexChange, onChartMarkerTooltipChange, stopPanAnimation]);

  const handleChartMouseMove = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (isLoadingData || !chartRef.current) {
        return;
      }

      const rect = chartRef.current.getBoundingClientRect();
      chartCrosshairRef.current = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };

      const pointerX = chartCrosshairRef.current.x;
      const pointerY = chartCrosshairRef.current.y;
      let hoveredMarker: MarkerHotspot | null = null;
      let minDistanceSq = Number.POSITIVE_INFINITY;
      for (const item of chartMarkerHotspotsRef.current) {
        const dx = pointerX - item.x;
        const dy = pointerY - item.y;
        const distanceSq = dx * dx + dy * dy;
        if (distanceSq <= item.radius * item.radius && distanceSq < minDistanceSq) {
          hoveredMarker = item;
          minDistanceSq = distanceSq;
        }
      }

      if (hoveredMarker) {
        if (chartHoveredMarkerIdRef.current !== hoveredMarker.id) {
          chartHoveredMarkerIdRef.current = hoveredMarker.id;
          const tooltip: ChartMarkerTooltip = {
            id: hoveredMarker.id,
            x: hoveredMarker.x,
            y: hoveredMarker.y,
            title: hoveredMarker.title,
            entries: hoveredMarker.entries,
          };
          onChartMarkerTooltipChange(tooltip);
        }
      } else if (chartHoveredMarkerIdRef.current !== null) {
        chartHoveredMarkerIdRef.current = null;
        onChartMarkerTooltipChange(null);
      }

      requestChartHoverRedraw();
    },
    [isLoadingData, onChartMarkerTooltipChange, requestChartHoverRedraw],
  );

  const handleChartMouseLeave = useCallback(() => {
    const hadCrosshair = Boolean(chartCrosshairRef.current);
    chartCrosshairRef.current = null;
    if (chartHoveredMarkerIdRef.current !== null || chartMarkerTooltip !== null) {
      chartHoveredMarkerIdRef.current = null;
      onChartMarkerTooltipChange(null);
    }
    if (hadCrosshair) {
      requestChartHoverRedraw();
    }
  }, [chartMarkerTooltip, onChartMarkerTooltipChange, requestChartHoverRedraw]);

  const resetChartScale = useCallback(() => {
    onChartViewSizeChange(DEFAULT_CHART_VIEW_SIZE);
  }, [onChartViewSizeChange]);

  const panChartRight = useCallback(() => {
    if (!hasCandles) {
      return;
    }

    stopPanAnimation();

    const maxIndex = candles.length - 1;
    const startIndex = Math.max(0, Math.min(chartReplayIndex, maxIndex));
    if (startIndex >= maxIndex) {
      onChartEndIndexChange(null);
      return;
    }

    const distance = maxIndex - startIndex;
    const durationMs = Math.min(
      CHART_PAN_TO_LIVE_MAX_MS,
      Math.max(CHART_PAN_TO_LIVE_MIN_MS, Math.round(distance * 1.4)),
    );
    const startedAt = performance.now();

    const animate = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / durationMs);
      const eased = easeOutCubic(progress);
      const nextIndex = Math.round(startIndex + distance * eased);

      if (nextIndex >= maxIndex || progress >= 1) {
        onChartEndIndexChange(null);
        chartPanAnimationRef.current = null;
        return;
      }

      onChartEndIndexChange(nextIndex);
      chartPanAnimationRef.current = window.requestAnimationFrame(animate);
    };

    chartPanAnimationRef.current = window.requestAnimationFrame(animate);
  }, [candles.length, chartReplayIndex, hasCandles, onChartEndIndexChange, stopPanAnimation]);

  useEffect(() => {
    if (!hasCandles) {
      return;
    }

    const maxIndex = candles.length - 1;
    const current = chartEndIndexRef.current;
    if (current !== null) {
      const clamped = Math.max(0, Math.min(current, maxIndex));
      onChartEndIndexChange(clamped === maxIndex ? null : clamped);
    }
  }, [candles.length, hasCandles, onChartEndIndexChange]);

  useEffect(() => {
    if (chartEndIndex === null) {
      stopPanAnimation();
    }
  }, [chartEndIndex, stopPanAnimation]);

  useEffect(() => {
    redrawChartWithCurrentState();
  }, [
    candles,
    chartReplayIndex,
    currentPairPositions,
    currentPairClosedTrades,
    chartViewSize,
    timeframeId,
    resizeToken,
    redrawChartWithCurrentState,
  ]);

  useEffect(() => {
    const handleResize = () => onTriggerResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [onTriggerResize]);

  useEffect(() => {
    const container = chartWrapRef.current;
    if (!container) {
      return undefined;
    }

    const handleChartWheel = (event: WheelEvent) => {
      if (event.cancelable) {
        event.preventDefault();
      }
      event.stopPropagation();

      const hasHorizontalIntent =
        Number.isFinite(event.deltaX) &&
        Math.abs(event.deltaX) > 0 &&
        Math.abs(event.deltaX) >= Math.abs(event.deltaY);

      if (hasHorizontalIntent) {
        stopPanAnimation();
        const panStepRaw = Math.round(event.deltaX * CHART_PAN_SENSITIVITY);
        const panStep = panStepRaw === 0 ? (event.deltaX > 0 ? 1 : -1) : panStepRaw;
        const maxIndex = Math.max(0, candles.length - 1);
        const baseIndex = chartEndIndexRef.current === null ? maxIndex : chartEndIndexRef.current;
        const nextIndex = Math.max(0, Math.min(baseIndex + panStep, maxIndex));
        onChartEndIndexChange(nextIndex === maxIndex ? null : nextIndex);
        return;
      }

      if (!Number.isFinite(event.deltaY) || event.deltaY === 0) {
        return;
      }

      const scaleFactor = Math.exp(event.deltaY * CHART_ZOOM_SENSITIVITY);
      stopPanAnimation();
      onChartViewSizeChange(clampChartViewSize(chartViewSizeRef.current * scaleFactor));
    };

    container.addEventListener('wheel', handleChartWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleChartWheel);
    };
  }, [candles.length, onChartEndIndexChange, onChartViewSizeChange, stopPanAnimation]);

  useEffect(() => {
    chartHoveredMarkerIdRef.current = null;
    onChartMarkerTooltipChange(null);
  }, [isLoadingData, onChartMarkerTooltipChange, pair, timeframeId]);

  useEffect(
    () => () => {
      stopPanAnimation();
      if (chartHoverRedrawRafRef.current !== null) {
        window.cancelAnimationFrame(chartHoverRedrawRafRef.current);
        chartHoverRedrawRafRef.current = null;
      }
    },
    [stopPanAnimation],
  );

  return {
    chartWrapRef,
    chartRef,
    chartViewSize,
    chartMarkerTooltip,
    hasCustomChartScale,
    canPanChartRight,
    handleChartMouseMove,
    handleChartMouseLeave,
    panChartRight,
    resetChartScale,
    resetChartViewport,
  };
}
