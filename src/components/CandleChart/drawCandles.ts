import {
  CHART_RIGHT_GAP_SLOTS,
  CHART_PRICE_SCALE_TEXT_RIGHT_INSET,
  CHART_SCALE_TAG_HEIGHT,
  CHART_SCALE_TAG_GAP,
  CHART_MARKER_DOT_RADIUS,
  CHART_MARKER_STACK_OFFSET,
  CHART_MARKER_POSITIVE_COLOR,
  CHART_MARKER_NEGATIVE_COLOR,
  CHART_MARKER_OPEN_FILL,
  CHART_MARKER_OPEN_STROKE,
} from './chartConstants';
import { SMA_COLORS, SMA_PERIODS } from '../../constants/indicators';
import {
  fmtPriceScale,
  candleAxisLabel,
  candleTooltipLabel,
  fmtNumber,
  fmtFixedPrice,
  fmtPrice,
  fmtSigned,
} from '../../utils/formatters';
import { getBucketStartTs } from './utils/candles';
import type { Candle, LocalPosition, ClosedTrade } from '../../types/domain';
import type { SmaConfig, SmaPeriod } from '../../constants/indicators';

export interface MarkerHotspotEntry {
  id: string;
  title: string;
  lines: { label: string; value: string }[];
}

export interface MarkerHotspot {
  id: string;
  x: number;
  y: number;
  radius: number;
  title: string;
  entries: MarkerHotspotEntry[];
}

export interface ChartCrosshair {
  x: number;
  y: number;
}

export interface MarkerHotspotsRef {
  current: MarkerHotspot[];
}

export function drawCandles(
  canvas: HTMLCanvasElement,
  candles: Candle[],
  replayIndex: number,
  positions: LocalPosition[],
  closedTrades: ClosedTrade[],
  viewSize: number,
  timeframeId: string,
  pricePrecision = 2,
  smaConfig: SmaConfig,
  crosshair: ChartCrosshair | null = null,
  markerHotspotsRef: MarkerHotspotsRef | null = null,
): void {
  if (markerHotspotsRef) {
    markerHotspotsRef.current = [];
  }

  if (!canvas || replayIndex < 1) {
    return;
  }

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(300, Math.floor(rect.width));
  const height = Math.max(220, Math.floor(rect.height));

  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);

  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  // Keep all price labels consistent with the live price label.
  const PRICE_FONT = '10px "JetBrains Mono", monospace';
  const isLightTheme = document.body?.dataset.theme === 'light';
  const theme = isLightTheme
    ? {
        bgTop: 'rgba(250, 252, 255, 0.98)',
        bgBottom: 'rgba(238, 245, 255, 0.98)',
        grid: 'rgba(158, 185, 225, 0.32)',
        axis: 'rgba(139, 169, 214, 0.48)',
        labelBg: 'rgba(255, 255, 255, 0.94)',
        labelText: 'rgba(72, 96, 137, 0.9)',
        axisLabel: 'rgba(82, 107, 148, 0.9)',
        areaStart: 'rgba(37, 99, 235, 0.24)',
        areaMid: 'rgba(37, 99, 235, 0.1)',
        areaEnd: 'rgba(37, 99, 235, 0)',
        lineStart: 'rgba(18, 163, 109, 0.9)',
        lineEnd: 'rgba(37, 99, 235, 0.88)',
        bull: '#12a36d',
        bear: '#bb3b51',
      }
    : {
        bgTop: 'rgba(20, 30, 49, 0.94)',
        bgBottom: 'rgba(9, 13, 23, 0.96)',
        grid: 'rgba(126, 162, 225, 0.2)',
        axis: 'rgba(143, 178, 239, 0.3)',
        labelBg: 'rgba(14, 22, 38, 0.92)',
        labelText: 'rgba(185, 209, 247, 0.88)',
        axisLabel: 'rgba(185, 209, 247, 0.84)',
        areaStart: 'rgba(0, 102, 255, 0.34)',
        areaMid: 'rgba(0, 102, 255, 0.14)',
        areaEnd: 'rgba(0, 102, 255, 0)',
        lineStart: 'rgba(0, 193, 122, 0.95)',
        lineEnd: 'rgba(0, 102, 255, 0.94)',
        bull: '#00c17a',
        bear: '#bb3b51',
      };

  const bgGradient = ctx.createLinearGradient(0, 0, 0, height);
  bgGradient.addColorStop(0, theme.bgTop);
  bgGradient.addColorStop(1, theme.bgBottom);
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, width, height);

  let padding = { top: 20, right: 58, bottom: 52, left: 16 };
  const safeViewSize = Math.max(2, Math.floor(viewSize));
  const start = Math.max(0, replayIndex - safeViewSize + 1);
  const visible = candles.slice(start, replayIndex + 1);

  if (visible.length === 0) {
    return;
  }

  const min = Math.min(...visible.map((item) => item.low));
  const max = Math.max(...visible.map((item) => item.high));
  const range = Math.max(max - min, max * 0.003);
  const yMin = min - range * 0.08;
  const yMax = max + range * 0.08;

  // Ensure the right price scale has enough room for the widest label.
  // Otherwise the text can be cut off on the canvas edge for larger prices.
  const yTickCount = 5;
  const lastCandle = candles[candles.length - 1];
  const lastPrice = Number(lastCandle?.close);
  const scaleLabels: string[] = [];
  for (let i = 0; i < yTickCount; i += 1) {
    const ratio = i / (yTickCount - 1);
    const price = yMax - ratio * (yMax - yMin);
    scaleLabels.push(`$${fmtPriceScale(price)}`);
  }
  if (Number.isFinite(lastPrice) && lastPrice > 0) {
    scaleLabels.push(`$${fmtPriceScale(lastPrice)}`);
  }
  ctx.font = PRICE_FONT;
  const maxScaleLabelWidth = scaleLabels.reduce((maxWidth, label) => {
    const width = ctx.measureText(label).width;
    return width > maxWidth ? width : maxWidth;
  }, 0);
  const requiredRightPadding = Math.ceil(
    CHART_PRICE_SCALE_TEXT_RIGHT_INSET + maxScaleLabelWidth + 12,
  );
  padding = {
    ...padding,
    right: Math.max(padding.right, requiredRightPadding),
  };

  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const yFromPrice = (price: number) => {
    const ratio = (price - yMin) / (yMax - yMin);
    return padding.top + chartHeight - ratio * chartHeight;
  };

  const isLiveView = replayIndex >= candles.length - 1;
  const rightGapSlots = isLiveView ? CHART_RIGHT_GAP_SLOTS : 0;
  const xStep = chartWidth / (visible.length + rightGapSlots);
  const bodyWidth = Math.max(2, xStep * 0.62);

  ctx.strokeStyle = theme.grid;
  ctx.lineWidth = 1;

  for (let i = 0; i < yTickCount; i += 1) {
    const y = padding.top + (i / (yTickCount - 1)) * chartHeight;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();
  }

  const priceScaleX = width - padding.right;
  const priceScaleTextX = priceScaleX + CHART_PRICE_SCALE_TEXT_RIGHT_INSET;
  ctx.strokeStyle = theme.axis;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(priceScaleX, padding.top);
  ctx.lineTo(priceScaleX, padding.top + chartHeight);
  ctx.stroke();

  ctx.font = PRICE_FONT;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < yTickCount; i += 1) {
    const ratio = i / (yTickCount - 1);
    const price = yMax - ratio * (yMax - yMin);
    const y = padding.top + ratio * chartHeight;
    const label = `$${fmtPriceScale(price)}`;
    const labelWidth = ctx.measureText(label).width;

    ctx.fillStyle = theme.labelBg;
    ctx.fillRect(priceScaleTextX - 3, y - 7, labelWidth + 6, 14);

    ctx.fillStyle = theme.labelText;
    ctx.fillText(label, priceScaleTextX, y);
  }
  ctx.textBaseline = 'alphabetic';

  const tickCount = Math.max(2, Math.min(6, Math.floor(chartWidth / 130)));
  const axisTop = padding.top;
  const axisBottom = padding.top + chartHeight;

  for (let i = 0; i < tickCount; i += 1) {
    const index = Math.round((i * (visible.length - 1)) / Math.max(1, tickCount - 1));
    const candle = visible[index];
    if (!candle) continue;
    const x = padding.left + index * xStep + xStep / 2;

    ctx.strokeStyle = theme.grid;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(x, axisTop);
    ctx.lineTo(x, axisBottom);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = theme.axis;
    ctx.beginPath();
    ctx.moveTo(x, axisBottom);
    ctx.lineTo(x, axisBottom + 5);
    ctx.stroke();

    ctx.fillStyle = theme.axisLabel;
    ctx.font = PRICE_FONT;
    if (i === 0) {
      ctx.textAlign = 'left';
    } else if (i === tickCount - 1) {
      ctx.textAlign = 'right';
    } else {
      ctx.textAlign = 'center';
    }
    ctx.fillText(candleAxisLabel(candle.timestamp), x, axisBottom + 24);
  }

  const closePoints = visible.map((candle, idx) => ({
    x: padding.left + idx * xStep + xStep / 2,
    y: yFromPrice(candle.close),
  }));

  if (closePoints.length >= 2) {
    const areaGradient = ctx.createLinearGradient(0, padding.top, 0, axisBottom);
    areaGradient.addColorStop(0, theme.areaStart);
    areaGradient.addColorStop(0.62, theme.areaMid);
    areaGradient.addColorStop(1, theme.areaEnd);
    ctx.beginPath();
    closePoints.forEach((point, index) => {
      if (index === 0) {
        ctx.moveTo(point.x, point.y);
      } else {
        ctx.lineTo(point.x, point.y);
      }
    });
    ctx.lineTo(closePoints[closePoints.length - 1]!.x, axisBottom);
    ctx.lineTo(closePoints[0]!.x, axisBottom);
    ctx.closePath();
    ctx.fillStyle = areaGradient;
    ctx.fill();

  }

  visible.forEach((candle, idx) => {
    const x = padding.left + idx * xStep + xStep / 2;
    const openY = yFromPrice(candle.open);
    const closeY = yFromPrice(candle.close);
    const highY = yFromPrice(candle.high);
    const lowY = yFromPrice(candle.low);

    const rising = candle.close >= candle.open;
    ctx.strokeStyle = rising ? theme.bull : theme.bear;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, highY);
    ctx.lineTo(x, lowY);
    ctx.stroke();

    const bodyTop = Math.min(openY, closeY);
    const bodyHeight = Math.max(1.2, Math.abs(closeY - openY));
    ctx.fillStyle = rising ? theme.bull : theme.bear;
    ctx.fillRect(x - bodyWidth / 2, bodyTop, bodyWidth, bodyHeight);
  });

  const drawSmaLine = (period: SmaPeriod) => {
    if (!smaConfig[period]) {
      return;
    }
    let sum = 0;
    const points: Array<{ x: number; y: number }> = [];
    for (let i = 0; i <= replayIndex; i += 1) {
      const close = Number(candles[i]?.close ?? 0);
      sum += close;
      if (i >= period) {
        sum -= Number(candles[i - period]?.close ?? 0);
      }
      if (i >= period - 1 && i >= start) {
        const value = sum / period;
        const x = padding.left + (i - start) * xStep + xStep / 2;
        const y = yFromPrice(value);
        points.push({ x, y });
      }
    }
    if (points.length < 2) {
      return;
    }
    ctx.save();
    ctx.strokeStyle = SMA_COLORS[period];
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    points.forEach((point, index) => {
      if (index === 0) {
        ctx.moveTo(point.x, point.y);
      } else {
        ctx.lineTo(point.x, point.y);
      }
    });
    ctx.stroke();
    ctx.restore();
  };

  SMA_PERIODS.forEach((period) => drawSmaLine(period));

  const lastActiveCandle = candles[candles.length - 1];
  const lastActivePrice = Number(lastActiveCandle?.close);
  const lastActiveYRaw = yFromPrice(lastActivePrice);
  const plotTop = padding.top;
  const plotBottom = padding.top + chartHeight;
  const lastActiveY = Math.max(plotTop, Math.min(plotBottom, lastActiveYRaw));
  const lastActiveIsVisible =
    Number.isFinite(lastActiveCandle?.index) &&
    (lastActiveCandle?.index ?? -1) >= start &&
    (lastActiveCandle?.index ?? -1) <= replayIndex;
  const lastActiveX = lastActiveIsVisible
    ? padding.left + ((lastActiveCandle?.index ?? 0) - start) * xStep + xStep / 2
    : padding.left;
  const activePriceScaleAnchorX = priceScaleX;

  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = isLightTheme ? 'rgba(37, 99, 235, 0.78)' : 'rgba(0, 102, 255, 0.88)';
  ctx.beginPath();
  ctx.moveTo(activePriceScaleAnchorX, lastActiveY);
  ctx.lineTo(lastActiveX, lastActiveY);
  ctx.stroke();
  ctx.setLineDash([]);

  const latestLabel = `$${fmtPriceScale(lastActivePrice)}`;
  const latestLabelY = Math.max(
    padding.top + 8,
    Math.min(padding.top + chartHeight - 8, lastActiveY),
  );
  const latestLabelWidth = ctx.measureText(latestLabel).width;

  const resolveMarkerIndex = (
    fallbackIndex: number | null | undefined,
    markerTimestamp: number | null | undefined,
  ): number | null => {
    const ts = Number(markerTimestamp);
    if (Number.isFinite(ts) && candles.length > 0) {
      const bucketTs = getBucketStartTs(ts, timeframeId);
      const targetTs = Number.isFinite(bucketTs) ? (bucketTs as number) : ts;
      let left = 0;
      let right = candles.length - 1;
      let match = -1;

      while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        if (candles[mid]!.timestamp <= targetTs) {
          match = mid;
          left = mid + 1;
        } else {
          right = mid - 1;
        }
      }

      if (match >= 0) {
        return match;
      }

      return null;
    }

    if (Number.isFinite(fallbackIndex)) {
      return Math.max(0, Math.min(Number(fallbackIndex), candles.length - 1));
    }

    return null;
  };

  interface ScaleEntry {
    positionId: number;
    side: 'long' | 'short';
    price: number;
    openedAtIndex: number | null;
    targetY: number;
    y: number;
  }

  const openScaleEntries: ScaleEntry[] = positions
    .map((position) => ({
      positionId: position.id,
      side: position.side,
      price: Number(position.entryPrice),
      openedAtIndex: resolveMarkerIndex(position.openedAtIndex, position.openedAtTs),
    }))
    .filter(
      (item) =>
        (item.side === 'long' || item.side === 'short') &&
        Number.isFinite(item.price) &&
        item.price > 0,
    )
    .map((item) => ({
      ...item,
      targetY: Math.max(plotTop, Math.min(plotBottom, yFromPrice(item.price))),
      y: 0,
    }))
    .sort((left, right) => left.targetY - right.targetY);

  const labelHalfHeight = CHART_SCALE_TAG_HEIGHT / 2;
  const minTagCenterY = plotTop + labelHalfHeight;
  const maxTagCenterY = plotBottom - labelHalfHeight;
  for (let i = 0; i < openScaleEntries.length; i += 1) {
    const previous = openScaleEntries[i - 1];
    let y = Math.max(
      minTagCenterY,
      Math.min(maxTagCenterY, openScaleEntries[i]!.targetY),
    );
    if (previous) {
      y = Math.max(y, previous.y + CHART_SCALE_TAG_HEIGHT + CHART_SCALE_TAG_GAP);
    }
    openScaleEntries[i]!.y = y;
  }

  if (openScaleEntries.length > 0) {
    const overflow = openScaleEntries[openScaleEntries.length - 1]!.y - maxTagCenterY;
    if (overflow > 0) {
      for (const item of openScaleEntries) {
        item.y -= overflow;
      }
    }
  }

  ctx.font = PRICE_FONT;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  for (const item of openScaleEntries) {
    const markerIndex = item.openedAtIndex;
    if (
      Number.isFinite(markerIndex) &&
      (markerIndex as number) >= start &&
      (markerIndex as number) <= replayIndex
    ) {
      const entryY = Math.max(plotTop, Math.min(plotBottom, yFromPrice(item.price)));
      const markerX = padding.left + ((markerIndex as number) - start) * xStep + xStep / 2;
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = item.side === 'long' ? theme.bull : theme.bear;
      ctx.beginPath();
      ctx.moveTo(priceScaleX, entryY);
      ctx.lineTo(markerX, entryY);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    const label = `$${fmtPriceScale(item.price)}`;
    const labelWidth = ctx.measureText(label).width;
    const chipX = priceScaleTextX - 4;
    const chipY = item.y - labelHalfHeight;
    const chipW = labelWidth + 8;

    // Solid (no opacity) side-tinted chip background.
    ctx.fillStyle = item.side === 'long' ? (isLightTheme ? 'rgba(18, 163, 109, 0.16)' : 'rgba(0, 193, 122, 0.2)') : (isLightTheme ? 'rgba(46, 102, 255, 0.16)' : 'rgba(0, 102, 255, 0.2)');
    ctx.fillRect(chipX, chipY, chipW, CHART_SCALE_TAG_HEIGHT);
    ctx.fillStyle = item.side === 'long' ? (isLightTheme ? '#0f7f55' : '#00d18a') : (isLightTheme ? '#2454d8' : '#6da8ff');
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillText(label, chipX + chipW / 2, item.y);
    ctx.restore();
  }
  ctx.textBaseline = 'alphabetic';

  interface RawMarker {
    id: string;
    index: number;
    groupType: 'open' | 'closed';
    sideGroup?: 'long' | 'short';
    color: string;
    title: string;
    lines: { label: string; value: string }[];
  }

  const markers: RawMarker[] = [];
  for (const position of positions) {
    const markerIndex = resolveMarkerIndex(position.openedAtIndex, position.openedAtTs);
    if (!Number.isFinite(markerIndex)) {
      continue;
    }

    markers.push({
      id: `open-${position.id}`,
      index: markerIndex as number,
      groupType: 'open',
      color: CHART_MARKER_OPEN_FILL,
      title: `Open ${position.side === 'long' ? 'Long' : 'Short'}`,
      lines: [
        { label: 'Opened', value: candleTooltipLabel(position.openedAtTs) },
        { label: 'Qty', value: fmtNumber(position.qty, 3) },
        { label: 'Entry', value: `$${fmtPrice(position.entryPrice)}` },
      ],
    });
  }

  for (const trade of closedTrades.slice(0, 30)) {
    const markerIndex = resolveMarkerIndex(trade.closedAtIndex, trade.closedAtTs);
    if (!Number.isFinite(markerIndex)) {
      continue;
    }

    const closedLines: { label: string; value: string }[] = [
      { label: 'Opened', value: candleTooltipLabel(trade.openedAtTs) },
      { label: 'Closed', value: candleTooltipLabel(trade.closedAtTs) },
      { label: 'Exit', value: `$${fmtPrice(trade.exitPrice)}` },
      { label: 'PnL', value: fmtSigned(trade.pnl) },
    ];
    const safeReason = typeof trade.reason === 'string' ? trade.reason.trim() : '';
    if (safeReason && safeReason.toLowerCase() !== 'manual close') {
      closedLines.push({ label: 'Reason', value: safeReason });
    }

    markers.push({
      id: `closed-${trade.id}`,
      index: markerIndex as number,
      groupType: 'closed',
      sideGroup: trade.side,
      color:
        trade.side === 'long'
          ? CHART_MARKER_POSITIVE_COLOR
          : CHART_MARKER_NEGATIVE_COLOR,
      title: `Closed ${trade.side === 'long' ? 'Long' : 'Short'}`,
      lines: closedLines,
    });
  }

  interface GroupedMarker {
    id: string;
    relative: number;
    kind: 'open' | 'long' | 'short';
    color: string;
    sortOrder: number;
    items: MarkerHotspotEntry[];
  }

  const groupedMarkersByKey = new Map<string, GroupedMarker>();
  for (const marker of markers) {
    const relative = marker.index - start;
    if (relative < 0 || relative >= visible.length) {
      continue;
    }

    const isOpenGroup = marker.groupType === 'open';
    const sideGroup = marker.sideGroup === 'long' ? 'long' : 'short';
    const groupKind: 'open' | 'long' | 'short' = isOpenGroup ? 'open' : sideGroup;
    const groupKey = `${relative}:${groupKind}`;
    const existing = groupedMarkersByKey.get(groupKey);
    if (existing) {
      existing.items.push({ id: marker.id, title: marker.title, lines: marker.lines });
      continue;
    }

    groupedMarkersByKey.set(groupKey, {
      id: groupKey,
      relative,
      kind: groupKind,
      color: marker.color,
      sortOrder: isOpenGroup ? 0 : sideGroup === 'long' ? 1 : 2,
      items: [{ id: marker.id, title: marker.title, lines: marker.lines }],
    });
  }

  const groupedMarkers = [...groupedMarkersByKey.values()].sort((left, right) => {
    if (left.relative !== right.relative) {
      return left.relative - right.relative;
    }
    return left.sortOrder - right.sortOrder;
  });

  const markerHotspots: MarkerHotspot[] = [];
  const markerStacks = new Map<number, number>();
  const markerBaseY = axisBottom - 7;
  for (const group of groupedMarkers) {
    const stackIndex = markerStacks.get(group.relative) ?? 0;
    markerStacks.set(group.relative, stackIndex + 1);

    const x = padding.left + group.relative * xStep + xStep / 2;
    const y = Math.max(axisTop + 8, markerBaseY - stackIndex * CHART_MARKER_STACK_OFFSET);
    ctx.fillStyle = group.color;
    ctx.beginPath();
    ctx.arc(x, y, CHART_MARKER_DOT_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    if (group.kind === 'open') {
      ctx.strokeStyle = CHART_MARKER_OPEN_STROKE;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    markerHotspots.push({
      id: group.id,
      x,
      y,
      radius: CHART_MARKER_DOT_RADIUS + 4,
      title:
        group.kind === 'open'
          ? `${group.items.length} Open position${group.items.length > 1 ? 's' : ''}`
          : `${group.items.length} ${group.kind === 'long' ? 'Long' : 'Short'} trade${group.items.length > 1 ? 's' : ''}`,
      entries: group.items,
    });
  }

  if (markerHotspotsRef) {
    markerHotspotsRef.current = markerHotspots;
  }

  if (crosshair && Number.isFinite(crosshair.x) && Number.isFinite(crosshair.y)) {
    const crosshairXRaw = Math.max(
      padding.left,
      Math.min(crosshair.x, width - padding.right),
    );
    const crosshairY = Math.max(plotTop, Math.min(crosshair.y, plotBottom));
    const crosshairRelativeIndex = Math.round(
      (crosshairXRaw - padding.left - xStep / 2) / xStep,
    );
    const safeCrosshairIndex = Math.max(
      0,
      Math.min(visible.length - 1, crosshairRelativeIndex),
    );
    const nearestCandleX = padding.left + safeCrosshairIndex * xStep + xStep / 2;
    const snapThreshold = Math.min(8, xStep * 0.49);
    const shouldSnap = Math.abs(crosshairXRaw - nearestCandleX) <= snapThreshold;
    const crosshairCandle = shouldSnap ? visible[safeCrosshairIndex] : null;
    const crosshairX = shouldSnap ? nearestCandleX : crosshairXRaw;
    const crosshairPrice = yMax - ((crosshairY - plotTop) / chartHeight) * (yMax - yMin);

    ctx.save();
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = isLightTheme ? 'rgba(116, 145, 194, 0.76)' : 'rgba(129, 163, 219, 0.72)';
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.moveTo(padding.left, crosshairY);
    ctx.lineTo(width - padding.right, crosshairY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(crosshairX, plotTop);
    ctx.lineTo(crosshairX, plotBottom);
    ctx.stroke();
    ctx.restore();

    const crosshairLabel = `$${fmtPriceScale(crosshairPrice)}`;
    ctx.font = PRICE_FONT;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const crosshairLabelWidth = ctx.measureText(crosshairLabel).width;
    const crosshairLabelX = priceScaleTextX - 3;
    const crosshairLabelY = Math.max(plotTop + 8, Math.min(plotBottom - 8, crosshairY));
    ctx.fillStyle = isLightTheme ? 'rgba(255, 255, 255, 0.98)' : 'rgba(12, 18, 31, 0.98)';
    ctx.fillRect(crosshairLabelX, crosshairLabelY - 8, crosshairLabelWidth + 6, 16);
    ctx.strokeStyle = isLightTheme ? 'rgba(142, 170, 214, 0.5)' : 'rgba(125, 157, 212, 0.42)';
    ctx.lineWidth = 1;
    ctx.strokeRect(crosshairLabelX, crosshairLabelY - 8, crosshairLabelWidth + 6, 16);
    ctx.fillStyle = isLightTheme ? 'rgba(43, 69, 108, 0.94)' : 'rgba(221, 234, 255, 0.92)';
    ctx.fillText(crosshairLabel, priceScaleTextX, crosshairLabelY);

    if (crosshairCandle) {
      ctx.font = '11px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const openValue = Number(crosshairCandle.open);
      const closeValue = Number(crosshairCandle.close);
      const moveRaw =
        Number.isFinite(openValue) && Number.isFinite(closeValue)
          ? closeValue - openValue
          : null;
      const moveValue =
        moveRaw === null || !Number.isFinite(moveRaw)
          ? '-'
          : `${moveRaw >= 0 ? '+' : '-'}${fmtFixedPrice(Math.abs(moveRaw), pricePrecision)}`;
      const pctChangeRaw =
        moveRaw !== null && Number.isFinite(moveRaw) && Number.isFinite(openValue) && openValue !== 0
          ? (moveRaw / openValue) * 100
          : null;
      const pctDigits = 2;
      const pctValue =
        pctChangeRaw === null || !Number.isFinite(pctChangeRaw)
          ? '-'
          : `${pctChangeRaw >= 0 ? '+' : '-'}${Math.abs(pctChangeRaw).toLocaleString(
              undefined,
              {
                minimumFractionDigits: pctDigits,
                maximumFractionDigits: pctDigits,
              },
            )}%`;
      const moveColor =
        moveRaw === null || !Number.isFinite(moveRaw)
          ? (isLightTheme ? 'rgba(72, 96, 137, 0.9)' : '#2a3446')
          : moveRaw > 0
            ? theme.bull
            : moveRaw < 0
              ? theme.bear
              : isLightTheme
                ? 'rgba(72, 96, 137, 0.9)'
                : 'rgba(169, 192, 230, 0.92)';
      const ohlcEntries = [
        { label: 'O', value: fmtFixedPrice(crosshairCandle.open, pricePrecision) },
        { label: 'H', value: fmtFixedPrice(crosshairCandle.high, pricePrecision) },
        { label: 'L', value: fmtFixedPrice(crosshairCandle.low, pricePrecision) },
        { label: 'C', value: fmtFixedPrice(crosshairCandle.close, pricePrecision) },
        {
          label: 'M',
          value: `${moveValue} (${pctValue === '-' ? '-' : pctValue})`,
          color: moveColor,
        },
      ];
      const ohlcX = padding.left + 6;
      const ohlcY = padding.top + 4;
      const chipPaddingX = 8;
      const chipHeight = 18;
      const chipGap = 6;
      const dividerWidth = 1;
      const minChipWidth = 70;
      const chipWidths = ohlcEntries.map((entry) => {
        const label = `${entry.label}: ${entry.value}`;
        const labelWidth = ctx.measureText(label).width;
        return Math.max(minChipWidth, Math.ceil(labelWidth + chipPaddingX * 2));
      });
      const totalWidth =
        chipWidths.reduce((sum, width) => sum + width, 0) +
        dividerWidth * (chipWidths.length - 1);
      const chipY = ohlcY - 2;
      const chipCenterY = chipY + chipHeight / 2;

      const drawRoundedRect = (
        x: number,
        y: number,
        w: number,
        h: number,
        r: number,
      ) => {
        const radius = Math.max(0, Math.min(r, Math.min(w, h) / 2));
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.arcTo(x + w, y, x + w, y + h, radius);
        ctx.arcTo(x + w, y + h, x, y + h, radius);
        ctx.arcTo(x, y + h, x, y, radius);
        ctx.arcTo(x, y, x + w, y, radius);
        ctx.closePath();
      };

      ctx.fillStyle = isLightTheme ? 'rgba(255, 255, 255, 0.94)' : 'rgba(12, 18, 31, 0.92)';
      drawRoundedRect(ohlcX, chipY, totalWidth, chipHeight, 4);
      ctx.fill();
      ctx.strokeStyle = isLightTheme ? 'rgba(142, 170, 214, 0.32)' : 'rgba(125, 157, 212, 0.26)';
      ctx.lineWidth = 1;
      ctx.stroke();

      let chipX = ohlcX;

      for (let i = 0; i < ohlcEntries.length; i += 1) {
        const entry = ohlcEntries[i]!;
        const label = `${entry.label}: ${entry.value}`;
        const chipWidth = chipWidths[i] ?? minChipWidth;
        ctx.fillStyle = entry.color ?? (isLightTheme ? 'rgba(43, 69, 108, 0.94)' : 'rgba(221, 234, 255, 0.92)');
        ctx.fillText(label, chipX + chipPaddingX, chipCenterY);
        chipX += chipWidth;
        if (i < ohlcEntries.length - 1) {
          ctx.strokeStyle = isLightTheme ? 'rgba(142, 170, 214, 0.32)' : 'rgba(125, 157, 212, 0.26)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(chipX + dividerWidth / 2, chipY + 3);
          ctx.lineTo(chipX + dividerWidth / 2, chipY + chipHeight - 3);
          ctx.stroke();
          chipX += dividerWidth;
        }
      }

      const crosshairTimeLabel = candleAxisLabel(crosshairCandle.timestamp);
      ctx.font = PRICE_FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const timeLabelWidth = ctx.measureText(crosshairTimeLabel).width;
      const timeChipWidth = timeLabelWidth + 10;
      const timeChipHalfWidth = timeChipWidth / 2;
      const timeChipCenterX = Math.max(
        padding.left + timeChipHalfWidth,
        Math.min(width - padding.right - timeChipHalfWidth, crosshairX),
      );
      const timeChipY = axisBottom + 24;

      ctx.fillStyle = isLightTheme ? 'rgba(255, 255, 255, 0.98)' : 'rgba(12, 18, 31, 0.98)';
      ctx.fillRect(
        timeChipCenterX - timeChipHalfWidth,
        timeChipY - 8,
        timeChipWidth,
        16,
      );
      ctx.strokeStyle = isLightTheme ? 'rgba(142, 170, 214, 0.5)' : 'rgba(125, 157, 212, 0.42)';
      ctx.lineWidth = 1;
      ctx.strokeRect(
        timeChipCenterX - timeChipHalfWidth,
        timeChipY - 8,
        timeChipWidth,
        16,
      );
      ctx.fillStyle = isLightTheme ? 'rgba(43, 69, 108, 0.94)' : 'rgba(221, 234, 255, 0.92)';
      ctx.fillText(crosshairTimeLabel, timeChipCenterX, timeChipY);
    }
    ctx.textBaseline = 'alphabetic';
  }

  ctx.font = PRICE_FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = isLightTheme ? 'rgba(37, 99, 235, 0.14)' : 'rgba(0, 102, 255, 0.2)';
  const latestChipX = priceScaleTextX - 4;
  const latestChipW = latestLabelWidth + 8;
  ctx.fillRect(latestChipX, latestLabelY - labelHalfHeight, latestChipW, CHART_SCALE_TAG_HEIGHT);
  ctx.strokeStyle = isLightTheme ? 'rgba(37, 99, 235, 0.44)' : 'rgba(0, 102, 255, 0.58)';
  ctx.lineWidth = 1;
  ctx.strokeRect(latestChipX, latestLabelY - labelHalfHeight, latestChipW, CHART_SCALE_TAG_HEIGHT);
  ctx.fillStyle = isLightTheme ? '#1d4ed8' : 'rgba(222, 236, 255, 0.95)';
  ctx.fillText(latestLabel, latestChipX + latestChipW / 2, latestLabelY);
  ctx.textBaseline = 'alphabetic';
}
