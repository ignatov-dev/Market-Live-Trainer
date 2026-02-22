/**
 * ChartPanelDemo.tsx
 * Remotion composition: BTC/USDT chart panel with live last candle.
 *
 * 300 frames @ 30 fps = 10 s
 *
 * Only the final (forming) candle updates — open/high/low/close of all
 * previous candles are deterministic from a seeded RNG.
 * The live close snaps 2× per second (every 15 frames).
 */

import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Easing,
} from "remotion";

// ─── Design tokens ────────────────────────────────────────────────────────────

const FONT =
  '"SF Pro Text", -apple-system, BlinkMacSystemFont, "Helvetica Neue", "Segoe UI", sans-serif';

// ─── Background (same as SessionSummaryCard) ──────────────────────────────────

const BG = [
  "radial-gradient(120% 92% at 0% 0%, rgba(209,207,247,0.95) 0%, rgba(209,207,247,0.52) 44%, rgba(209,207,247,0) 76%)",
  "radial-gradient(115% 94% at 100% 0%, rgba(184,217,243,0.94) 0%, rgba(184,217,243,0.56) 46%, rgba(184,217,243,0) 78%)",
  "linear-gradient(180deg, #d1cff7 0%, #b8d9f3 58%, #ffffff 100%)",
].join(", ");

interface BlobProps {
  cx: number; cy: number; r: number;
  color: string; opacity: number;
  frame: number; speedX?: number; speedY?: number; phase?: number;
}
function Blob({ cx, cy, r, color, opacity, frame, speedX = 0, speedY = 0, phase = 0 }: BlobProps) {
  const x = cx + Math.sin(frame * speedX + phase) * 40;
  const y = cy + Math.cos(frame * speedY + phase) * 28;
  return (
    <div style={{
      position: "absolute",
      left: x - r, top: y - r, width: r * 2, height: r * 2,
      borderRadius: "50%", background: color, opacity,
      filter: `blur(${r * 0.65}px)`, pointerEvents: "none",
    }} />
  );
}

// ─── Seeded RNG (deterministic candles every render) ─────────────────────────

function mulberry32(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Candle data ──────────────────────────────────────────────────────────────

interface Candle {
  open: number;
  close: number;
  high: number;
  low: number;
  ts: number;
}

const HISTORICAL_COUNT = 50;
const BASE_TS = 1_700_000_000_000; // arbitrary fixed epoch (ms)
const TF_MS   = 60 * 60 * 1000;    // 1-hour timeframe

function makeHistoricalCandles(count: number): Candle[] {
  const rng = mulberry32(0xdeadbeef);
  const out: Candle[] = [];
  let price = 97_800;
  for (let i = 0; i < count; i++) {
    const body  = (rng() - 0.45) * 1_400; // slight upward bias
    const open  = price;
    const close = open + body;
    const wick1 = rng() * 600;
    const wick2 = rng() * 600;
    const high  = Math.max(open, close) + wick1;
    const low   = Math.min(open, close) - wick2;
    out.push({ open, close, high, low, ts: BASE_TS + i * TF_MS });
    price = close;
  }
  return out;
}

const HISTORICAL: readonly Candle[] = makeHistoricalCandles(HISTORICAL_COUNT);
const LIVE_OPEN = HISTORICAL[HISTORICAL.length - 1]!.close;

// ─── Live close simulation ────────────────────────────────────────────────────

function getLiveClose(stepF: number): number {
  const trend = interpolate(
    stepF,
    [0, 100, 220, 300],
    [0, 900, 1_250, 1_050],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    },
  );
  const osc = Math.sin(stepF * 0.009) * 280 + Math.sin(stepF * 0.004) * 110;
  return LIVE_OPEN + trend + osc;
}

// ─── Formatters ──────────────────────────────────────────────────────────────

function fmtStrip(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtScale(n: number): string {
  return Math.abs(n) >= 1000 ? (n / 1000).toFixed(1) + "k" : n.toFixed(2);
}

function fmtAxisLabel(ts: number): string {
  const d  = new Date(ts);
  const h  = d.getUTCHours().toString().padStart(2, "0");
  const mo = d.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  const dd = d.getUTCDate().toString().padStart(2, "0");
  return `${mo} ${dd}  ${h}:00`;
}

// ─── Chart SVG ───────────────────────────────────────────────────────────────
// Faithfully replicates drawCandles.ts layout (padding, colors, labels).

interface ChartSvgProps { w: number; h: number; liveClose: number }

function ChartSvg({ w, h, liveClose }: ChartSvgProps) {
  // Padding matches real chart exactly
  const PAD   = { top: 20, right: 58, bottom: 52, left: 16 };
  const R_GAP = 6; // CHART_RIGHT_GAP_SLOTS

  // Build full visible candle list
  const liveCandle: Candle = {
    open:  LIVE_OPEN,
    close: liveClose,
    high:  Math.max(LIVE_OPEN, liveClose) + 260,
    low:   Math.min(LIVE_OPEN, liveClose) - 220,
    ts:    BASE_TS + HISTORICAL_COUNT * TF_MS,
  };

  // Show last VIEW_SIZE candles
  const VIEW_SIZE = 42;
  const allCandles = [...HISTORICAL, liveCandle];
  const visible    = allCandles.slice(Math.max(0, allCandles.length - VIEW_SIZE));

  const chartW = w - PAD.left - PAD.right;
  const chartH = h - PAD.top  - PAD.bottom;

  // Price range
  const allPrices = visible.flatMap(c => [c.high, c.low]);
  const pMin      = Math.min(...allPrices);
  const pMax      = Math.max(...allPrices);
  const range     = Math.max(pMax - pMin, pMax * 0.003);
  const yMin      = pMin - range * 0.08;
  const yMax      = pMax + range * 0.08;

  const yPx = (price: number) => {
    const ratio = (price - yMin) / (yMax - yMin);
    return PAD.top + chartH - ratio * chartH;
  };

  const xStep    = chartW / (visible.length + R_GAP);
  const bodyW    = Math.max(2, xStep * 0.62);
  const scaleX   = w - PAD.right;           // vertical price-scale line x
  const labelX   = scaleX + 4;              // CHART_PRICE_SCALE_TEXT_RIGHT_INSET

  // Y ticks (5)
  const Y_TICKS = 5;
  const yTicks = Array.from({ length: Y_TICKS }, (_, i) => {
    const ratio = i / (Y_TICKS - 1);
    return {
      y:     PAD.top + ratio * chartH,
      price: yMax - ratio * (yMax - yMin),
    };
  });

  // X ticks — matches drawCandles.ts: Math.max(2, Math.min(6, Math.floor(chartWidth / 130)))
  const X_TICKS = Math.max(2, Math.min(6, Math.floor(chartW / 130)));
  const xTicks = Array.from({ length: X_TICKS }, (_, i) => {
    const idx = Math.round((i * (visible.length - 1)) / Math.max(1, X_TICKS - 1));
    return {
      x:     PAD.left + idx * xStep + xStep / 2,
      label: visible[idx] ? fmtAxisLabel(visible[idx]!.ts) : "",
      align: i === 0 ? "start" : i === X_TICKS - 1 ? "end" : "middle",
    };
  });

  // Last price indicator
  const lastY      = Math.max(PAD.top + 8, Math.min(PAD.top + chartH - 8, yPx(liveClose)));
  const lastLabel  = `$${fmtScale(liveClose)}`;
  const lastCandleX = PAD.left + (visible.length - 1) * xStep + xStep / 2;

  const LABEL_W = 52; // fixed width for price scale labels (fits "$105.1k" at 10px)

  return (
    <svg
      width={w}
      height={h}
      style={{ display: "block" }}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Background */}
      <rect width={w} height={h} fill="#f8fbff" />

      {/* ── Horizontal grid lines ── */}
      {yTicks.map(({ y }, i) => (
        <line key={`hy${i}`} x1={PAD.left} y1={y} x2={scaleX} y2={y}
          stroke="#e3e8f2" strokeWidth={1} />
      ))}

      {/* ── Price scale vertical separator ── */}
      <line x1={scaleX} y1={PAD.top} x2={scaleX} y2={PAD.top + chartH}
        stroke="#cfd8e3" strokeWidth={1} />

      {/* ── Price axis labels ── */}
      {yTicks.map(({ y, price }, i) => (
        <g key={`py${i}`}>
          <rect x={labelX - 3} y={y - 7} width={LABEL_W} height={14}
            fill="rgba(249,251,255,0.92)" />
          <text x={labelX} y={y} dominantBaseline="middle"
            fontFamily={FONT} fontSize={10} fill="#5f6d82">
            ${fmtScale(price)}
          </text>
        </g>
      ))}

      {/* ── Vertical dashed time lines ── */}
      {xTicks.map(({ x }, i) => (
        <line key={`vl${i}`} x1={x} y1={PAD.top} x2={x} y2={PAD.top + chartH}
          stroke="#e9edf4" strokeWidth={1} strokeDasharray="3 3" />
      ))}

      {/* ── Time axis ticks + labels ── */}
      {xTicks.map(({ x, label, align }, i) => (
        <g key={`xl${i}`}>
          <line x1={x} y1={PAD.top + chartH} x2={x} y2={PAD.top + chartH + 5}
            stroke="#cfd8e3" strokeWidth={1} />
          <text x={x} y={PAD.top + chartH + 24}
            textAnchor={align as "start" | "middle" | "end"}
            fontFamily={FONT} fontSize={10} fill="#5f6d82">
            {label}
          </text>
        </g>
      ))}

      {/* ── Candles ── */}
      {visible.map((c, idx) => {
        const x      = PAD.left + idx * xStep + xStep / 2;
        const openY  = yPx(c.open);
        const closeY = yPx(c.close);
        const highY  = yPx(c.high);
        const lowY   = yPx(c.low);
        const rising = c.close >= c.open;
        const bodyTop = Math.min(openY, closeY);
        const bodyH   = Math.max(1.2, Math.abs(closeY - openY));

        return (
          <g key={`c${idx}`}>
            {/* Wick */}
            <line x1={x} y1={highY} x2={x} y2={lowY}
              stroke={rising ? "#0f766e" : "#b42318"} strokeWidth={1} />
            {/* Body */}
            <rect
              x={x - bodyW / 2} y={bodyTop}
              width={bodyW} height={bodyH}
              fill={rising ? "#12b981" : "#ef4444"}
            />
          </g>
        );
      })}

      {/* ── Last price dashed horizontal line ── */}
      <line x1={scaleX} y1={lastY} x2={lastCandleX} y2={lastY}
        stroke="#1d4ed8" strokeWidth={1} strokeDasharray="4 4" />

      {/* ── Last price label chip ── */}
      <rect x={labelX - 3} y={lastY - 8} width={LABEL_W} height={16}
        fill="rgba(223,235,255,0.98)"
        stroke="rgba(29,78,216,0.38)" strokeWidth={1} />
      <text x={labelX} y={lastY} dominantBaseline="middle"
        fontFamily={FONT} fontSize={10} fill="#1e3a8a">
        {lastLabel}
      </text>
    </svg>
  );
}

// ─── Main composition ─────────────────────────────────────────────────────────

const PAIRS      = ["BTC / USDT", "ETH / USDT", "SOL / USDT", "XRP / USD"] as const;
const TIMEFRAMES = ["1M", "15M", "1H", "1D", "1W"] as const;
const ACTIVE_PAIR = 0;
const ACTIVE_TF   = 2; // 1H

// Panel geometry — centered, ~60% of the viewport size.
const PW = 1056;                        // panel width  (880 * 1.2)
const PH = 576;                         // panel height (480 * 1.2)
const PX = (1920 - PW) / 2;            // 432 — horizontally centered
const PY = (1080 - PH) / 2;            // 252 — vertically centered
const PAD = 16;                  // panel padding (matches .panel)
const INNER_W = PW - PAD * 2;   // 1728

// Computed heights of panel sections (used to size the chart wrapper):
//  panel-head: nav(3+29+3=35px) + paddingBottom:8 + borderBottom:1 = 44px
//  market strip: marginTop:10 + pill(1+9+12+3+17+9+1=52px)       = 62px
//  chart marginTop                                                  = 12px
const CHART_TOP_OFFSET = 44 + 62 + 12; // 118px below inner-content top
// Chart div uses boxSizing:border-box so CHART_H is the total box height (incl. 1px border).
// Inner content = CHART_H - 2. Total panel flow = 44+62+12+810 = 928 = PH-PAD*2 ✓
const CHART_H = PH - PAD - CHART_TOP_OFFSET - PAD; // 810px

export const ChartPanelDemo = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Panel entrance spring
  const entrance = spring({
    fps, frame,
    config: { damping: 22, stiffness: 55, mass: 1.1 },
    from: 0, to: 1,
  });
  const opacity = interpolate(frame, [0, 18], [0, 1], { extrapolateRight: "clamp" });

  // Live close: snaps 2× per second
  const stepF     = Math.floor(frame / 15) * 15;
  const liveClose = getLiveClose(stepF);

  // Current live candle values for the market strip
  const stripHigh   = Math.max(LIVE_OPEN, liveClose) + 260;
  const stripLow    = Math.min(LIVE_OPEN, liveClose) - 220;
  const stripVolume = 4_812 + Math.floor(stepF * 1.4); // slowly growing volume

  return (
    <AbsoluteFill style={{ background: BG, overflow: "hidden", fontFamily: FONT }}>

      {/* ── Ambient blobs ── */}
      <Blob cx={200}  cy={180}  r={260} color="rgba(209,207,247,0.55)" opacity={1} frame={frame} speedX={0.018} speedY={0.012} phase={0} />
      <Blob cx={1720} cy={200}  r={220} color="rgba(184,217,243,0.60)" opacity={1} frame={frame} speedX={0.014} speedY={0.020} phase={2.1} />
      <Blob cx={960}  cy={900}  r={300} color="rgba(220,215,250,0.40)" opacity={1} frame={frame} speedX={0.010} speedY={0.008} phase={1.0} />
      <Blob cx={400}  cy={820}  r={180} color="rgba(184,217,243,0.35)" opacity={1} frame={frame} speedX={0.022} speedY={0.016} phase={3.5} />
      <Blob cx={1580} cy={780}  r={200} color="rgba(209,207,247,0.38)" opacity={1} frame={frame} speedX={0.016} speedY={0.024} phase={5.2} />

      {/* ── Panel ── */}
      <div style={{
        position:    "absolute",
        left:        PX,
        top:         PY,
        width:       PW,
        height:      PH,
        borderRadius: 14,                  // --radius-lg
        background:   "#ffffff",
        boxShadow:    "0 4px 14px rgba(32,52,84,0.08)",
        padding:      PAD,
        boxSizing:    "border-box" as const,
        overflow:     "hidden",
        opacity,
        transform:    `translateY(${(1 - entrance) * 36}px)`,
      }}>

        {/* Panel inner top-gloss (matches .panel::before) */}
        <div style={{
          position:      "absolute",
          top:           0,
          right:         0,
          bottom:        0,
          left:          0,
          borderRadius:  14,
          background:    "linear-gradient(180deg, rgba(255,255,255,0.46) 0%, rgba(255,255,255,0) 44%)",
          pointerEvents: "none",
        }} />

        {/* ── Panel head ── */}
        <div style={{
          display:        "flex",
          justifyContent: "space-between",
          alignItems:     "center",
          gap:            10,
          paddingBottom:  8,
          borderBottom:   "1px solid rgba(179,196,219,0.3)",
        }}>

          {/* Pair tabs */}
          <div style={{
            display:      "inline-flex",
            alignItems:   "center",
            borderRadius: 999,
            background:   "#f8fbff",
            padding:      3,
          }}>
            {PAIRS.map((label, i) => (
              <React.Fragment key={label}>
                <span style={{
                  borderRadius:  999,
                  padding:       "7px 11px",
                  fontSize:      12,
                  fontWeight:    600,
                  letterSpacing: "0.01em",
                  lineHeight:    1.2,
                  whiteSpace:    "nowrap",
                  color:         i === ACTIVE_PAIR ? "#1f4f96" : "#65758e",
                }}>
                  {label}
                </span>
                {i < PAIRS.length - 1 && (
                  <span style={{
                    display:    "inline-block",
                    width:      1,
                    height:     12,
                    margin:     "0 1px",
                    background: "rgba(149,169,199,0.45)",
                  }} />
                )}
              </React.Fragment>
            ))}
          </div>

          {/* Timeframe tabs */}
          <div style={{
            display:      "inline-flex",
            alignItems:   "center",
            borderRadius: 999,
            background:   "#f8fbff",
            padding:      3,
          }}>
            {TIMEFRAMES.map((label, i) => (
              <React.Fragment key={label}>
                <span style={{
                  borderRadius:  999,
                  padding:       "6px 10px",
                  fontSize:      12,
                  fontWeight:    600,
                  letterSpacing: "0.01em",
                  lineHeight:    1.2,
                  whiteSpace:    "nowrap",
                  color:         i === ACTIVE_TF ? "#1f4f96" : "#65758e",
                }}>
                  {label}
                </span>
                {i < TIMEFRAMES.length - 1 && (
                  <span style={{
                    display:    "inline-block",
                    width:      1,
                    height:     12,
                    margin:     "0 1px",
                    background: "rgba(149,169,199,0.45)",
                  }} />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* ── Market strip ── */}
        <div style={{
          marginTop:           10,
          display:             "grid",
          gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
          gap:                 8,
        }}>
          {(
            [
              { label: "Open",   value: `$${fmtStrip(LIVE_OPEN)}` },
              { label: "High",   value: `$${fmtStrip(stripHigh)}` },
              { label: "Low",    value: `$${fmtStrip(stripLow)}`  },
              { label: "Close",  value: `$${fmtStrip(liveClose)}` },
              { label: "Volume", value: stripVolume.toLocaleString("en-US") },
            ] as const
          ).map(({ label, value }) => (
            <div key={label} style={{
              background:   "#f8fbff",
              border:       "1px solid rgba(156,175,204,0.46)",
              borderRadius: 10,
              padding:      "9px 10px",
            }}>
              {/* .label */}
              <p style={{
                margin:        "0 0 3px",
                color:         "#68788f",
                fontSize:      10,
                textTransform: "uppercase" as const,
                letterSpacing: "0.05em",
              }}>
                {label}
              </p>
              {/* .value */}
              <p style={{
                margin:             0,
                fontWeight:         620,
                fontSize:           14,
                color:              "#223753",
                fontVariantNumeric: "tabular-nums",
              }}>
                {value}
              </p>
            </div>
          ))}
        </div>

        {/* ── Chart canvas area ── */}
        <div style={{
          marginTop:    12,
          width:        INNER_W,
          border:       "1px solid rgba(152,172,201,0.5)",
          borderRadius: 12,
          overflow:     "hidden",
          height:       CHART_H,
          boxSizing:    "border-box" as const,
          background:   "#f8fbff",
        }}>
          <ChartSvg w={INNER_W - 2} h={CHART_H - 2} liveClose={liveClose} />
        </div>
      </div>

    </AbsoluteFill>
  );
};
