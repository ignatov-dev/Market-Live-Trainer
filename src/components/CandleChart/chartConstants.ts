export const DEFAULT_CHART_VIEW_SIZE = 92;
export const MIN_CHART_VIEW_SIZE = 24;
export const MAX_CHART_VIEW_SIZE = 1400;
export const CHART_ZOOM_SENSITIVITY = 0.0014;
export const CHART_PAN_SENSITIVITY = 0.08;
export const CHART_RIGHT_GAP_SLOTS = 6;
export const CHART_PRICE_SCALE_TEXT_RIGHT_INSET = 4;
export const CHART_SCALE_TAG_HEIGHT = 16;
export const CHART_SCALE_TAG_GAP = 3;
export const CHART_MARKER_DOT_RADIUS = 4;
export const CHART_MARKER_STACK_OFFSET = 9;
export const CHART_MARKER_POSITIVE_COLOR = '#12b981';
export const CHART_MARKER_NEGATIVE_COLOR = '#ef4444';
export const CHART_MARKER_OPEN_FILL = 'rgba(223, 235, 255, 0.98)';
export const CHART_MARKER_OPEN_STROKE = '#1e3a8a';
export const CHART_PAN_TO_LIVE_MIN_MS = 220;
export const CHART_PAN_TO_LIVE_MAX_MS = 620;
export const SKELETON_CANDLE_COUNT = 72;
export const SKELETON_PRICE_LABEL_WIDTHS: readonly number[] = [34, 30, 36, 31, 35];
export const SKELETON_TIME_LABEL_WIDTHS: readonly number[] = [64, 76, 72, 68, 74];

export const SKELETON_RIGHT_GAP_RATIO =
  CHART_RIGHT_GAP_SLOTS / (SKELETON_CANDLE_COUNT + CHART_RIGHT_GAP_SLOTS);

export interface SkeletonCandle {
  wickTop: number;
  wickHeight: number;
  bodyTop: number;
  bodyHeight: number;
  isBull: boolean;
}

export const SKELETON_CANDLE_MODEL: readonly SkeletonCandle[] = Array.from(
  { length: SKELETON_CANDLE_COUNT },
  (_, index) => {
    const clamp = (value: number, min: number, max: number) =>
      Math.min(max, Math.max(min, value));
    const trendWave =
      Math.sin(index * 0.2) * 18 + Math.sin(index * 0.07 + 0.8) * 9;
    const center = clamp(50 + trendWave, 15, 85);
    const wickSpan = 3 + (Math.sin(index * 0.43 + 1.15) + 1) * 2.4;
    const wickTop = clamp(center - wickSpan, 3, 90);
    const wickBottom = clamp(center + wickSpan, wickTop + 8, 97);

    const bodySpan = 2.8 + (Math.cos(index * 0.37 + 0.2) + 1) * 2.3;
    const bodyCenter = clamp(
      center + Math.sin(index * 0.58 + 0.4) * 1.6,
      wickTop + bodySpan / 2 + 1,
      wickBottom - bodySpan / 2 - 1,
    );
    const bodyTop = clamp(bodyCenter - bodySpan / 2, wickTop + 1, wickBottom - 2.5);
    const bodyBottom = clamp(bodyTop + bodySpan, bodyTop + 1.6, wickBottom - 1);

    return {
      wickTop: Number(wickTop.toFixed(2)),
      wickHeight: Number((wickBottom - wickTop).toFixed(2)),
      bodyTop: Number(bodyTop.toFixed(2)),
      bodyHeight: Number((bodyBottom - bodyTop).toFixed(2)),
      isBull: Math.sin(index * 0.47 + 0.3) >= 0,
    };
  },
);
