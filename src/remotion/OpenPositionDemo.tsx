import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Easing,
} from "remotion";

// ─── Constants ──────────────────────────────────────────────────────────────

const ENTRY_PRICE = 43_500;
const QTY = 0.1;
const FEE_RATE = 0.001;
const TAKE_PROFIT = 44_500;
const STOP_LOSS = 42_800;
const PAIR = "BTC/USD";
const TOTAL_FRAMES = 360;

// ─── Price simulation ────────────────────────────────────────────────────────

/**
 * Simulates price movement over the video duration.
 * Phases:
 *  0–90   flat at entry (position just opened)
 *  90–180 rises to 44 200 (profit growing)
 * 180–220 dips to 43 900 (pullback)
 * 220–310 surges to 44 520, past TP
 * 310–360 hovers above TP
 */
function getPriceAtFrame(frame: number): number {
  return interpolate(
    frame,
    [0, 90, 180, 220, 310, 360],
    [43_500, 43_500, 44_200, 43_900, 44_520, 44_540],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
}

function calcTotalNetPnl(markPrice: number): number {
  const openFee = ENTRY_PRICE * QTY * FEE_RATE;
  const closeFee = markPrice * QTY * FEE_RATE;
  const unrealized = (markPrice - ENTRY_PRICE) * QTY;
  return unrealized - openFee - closeFee;
}

// ─── Formatting helpers ──────────────────────────────────────────────────────

function fmtPrice(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtPnl(pnl: number): string {
  const sign = pnl >= 0 ? "+" : "";
  return `${sign}$${Math.abs(pnl).toFixed(2)}`;
}

// ─── Color helpers ───────────────────────────────────────────────────────────

function lerpColor(
  a: [number, number, number],
  b: [number, number, number],
  t: number
): string {
  const r = Math.round(a[0] + (b[0] - a[0]) * t);
  const g = Math.round(a[1] + (b[1] - a[1]) * t);
  const bb = Math.round(a[2] + (b[2] - a[2]) * t);
  return `rgb(${r},${g},${bb})`;
}

const GREEN_RGB: [number, number, number] = [27, 138, 99];
const RED_RGB: [number, number, number] = [187, 59, 81];

// ─── Price Chart ─────────────────────────────────────────────────────────────

function PriceChart({ currentFrame }: { currentFrame: number }) {
  const W = 780;
  const H = 420;
  const PAD = { top: 30, right: 80, bottom: 44, left: 72 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const MIN_PRICE = 42_600;
  const MAX_PRICE = 44_800;
  const priceRange = MAX_PRICE - MIN_PRICE;

  const xScale = (frame: number) => (frame / TOTAL_FRAMES) * chartW;
  const yScale = (price: number) =>
    chartH - ((price - MIN_PRICE) / priceRange) * chartH;

  // Build sampled path up to current frame
  const points: { x: number; y: number }[] = [];
  const STEP = 3;
  for (let f = 0; f <= Math.min(currentFrame, TOTAL_FRAMES); f += STEP) {
    points.push({ x: xScale(f), y: yScale(getPriceAtFrame(f)) });
  }
  if (currentFrame % STEP !== 0 && currentFrame > 0) {
    points.push({
      x: xScale(currentFrame),
      y: yScale(getPriceAtFrame(currentFrame)),
    });
  }

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ");

  const last = points[points.length - 1] ?? { x: 0, y: chartH };
  const first = points[0] ?? { x: 0, y: chartH };

  const areaPath = `${linePath} L ${last.x} ${chartH} L ${first.x} ${chartH} Z`;

  const currentPrice = getPriceAtFrame(currentFrame);
  const currentX = xScale(currentFrame);
  const currentY = yScale(currentPrice);
  const tpY = yScale(TAKE_PROFIT);
  const slY = yScale(STOP_LOSS);
  const entryY = yScale(ENTRY_PRICE);

  const gridPrices = [42_800, 43_000, 43_500, 44_000, 44_500];

  return (
    <svg
      width={W}
      height={H}
      style={{ overflow: "visible", display: "block" }}
    >
      <defs>
        <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#58a6ff" stopOpacity={0.45} />
          <stop offset="100%" stopColor="#58a6ff" stopOpacity={0.0} />
        </linearGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <g transform={`translate(${PAD.left},${PAD.top})`}>
        {/* Horizontal grid + Y labels */}
        {gridPrices.map((p) => {
          const y = yScale(p);
          return (
            <g key={p}>
              <line
                x1={0}
                y1={y}
                x2={chartW}
                y2={y}
                stroke="rgba(255,255,255,0.06)"
                strokeWidth={1}
              />
              <text
                x={-10}
                y={y + 4}
                textAnchor="end"
                fill="rgba(255,255,255,0.3)"
                fontSize={11}
                fontFamily="system-ui"
              >
                ${(p / 1000).toFixed(1)}K
              </text>
            </g>
          );
        })}

        {/* Entry line */}
        <line
          x1={0}
          y1={entryY}
          x2={chartW}
          y2={entryY}
          stroke="rgba(88,166,255,0.55)"
          strokeWidth={1.5}
          strokeDasharray="7,4"
        />
        <text
          x={chartW + 8}
          y={entryY + 4}
          fill="rgba(88,166,255,0.85)"
          fontSize={12}
          fontFamily="system-ui"
          fontWeight={600}
        >
          Entry
        </text>

        {/* Take profit line */}
        <line
          x1={0}
          y1={tpY}
          x2={chartW}
          y2={tpY}
          stroke="rgba(46,204,113,0.65)"
          strokeWidth={1.5}
          strokeDasharray="7,4"
        />
        <text
          x={chartW + 8}
          y={tpY + 4}
          fill="rgba(46,204,113,0.9)"
          fontSize={12}
          fontFamily="system-ui"
          fontWeight={600}
        >
          TP
        </text>

        {/* Stop loss line */}
        <line
          x1={0}
          y1={slY}
          x2={chartW}
          y2={slY}
          stroke="rgba(248,81,73,0.65)"
          strokeWidth={1.5}
          strokeDasharray="7,4"
        />
        <text
          x={chartW + 8}
          y={slY + 4}
          fill="rgba(248,81,73,0.9)"
          fontSize={12}
          fontFamily="system-ui"
          fontWeight={600}
        >
          SL
        </text>

        {/* Area fill */}
        {points.length > 1 && (
          <path d={areaPath} fill="url(#areaGrad)" />
        )}

        {/* Price line */}
        {points.length > 1 && (
          <path
            d={linePath}
            fill="none"
            stroke="#58a6ff"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            filter="url(#glow)"
          />
        )}

        {/* Current price dot */}
        {currentFrame > 0 && (
          <>
            <circle
              cx={currentX}
              cy={currentY}
              r={12}
              fill="rgba(88,166,255,0.18)"
            />
            <circle cx={currentX} cy={currentY} r={5} fill="#58a6ff" />
          </>
        )}

        {/* X-axis time labels */}
        {[0, 90, 180, 270, 360].map((f) => {
          const label = ["0s", "3s", "6s", "9s", "12s"][
            [0, 90, 180, 270, 360].indexOf(f)
          ];
          return (
            <text
              key={f}
              x={xScale(f)}
              y={chartH + 20}
              textAnchor="middle"
              fill="rgba(255,255,255,0.25)"
              fontSize={11}
              fontFamily="system-ui"
            >
              {label}
            </text>
          );
        })}
      </g>
    </svg>
  );
}

// ─── Phase annotation ────────────────────────────────────────────────────────

interface Phase {
  startFrame: number;
  endFrame: number;
  label: string;
  color: string;
}

const PHASES: Phase[] = [
  { startFrame: 60, endFrame: 110, label: "Position just opened", color: "#58a6ff" },
  { startFrame: 110, endFrame: 185, label: "Price climbing — profit grows", color: "#3fb950" },
  { startFrame: 185, endFrame: 235, label: "Pullback — stay in the trade", color: "#e3b341" },
  { startFrame: 235, endFrame: 315, label: "Strong breakout!", color: "#3fb950" },
  { startFrame: 315, endFrame: 360, label: "Take profit reached!", color: "#3fb950" },
];

function PhaseLabel({ frame }: { frame: number }) {
  const active = PHASES.find(
    (p) => frame >= p.startFrame && frame <= p.endFrame
  );
  if (!active) return null;

  const fadeIn = interpolate(
    frame,
    [active.startFrame, active.startFrame + 15],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  const fadeOut = interpolate(
    frame,
    [active.endFrame - 15, active.endFrame],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  const opacity = Math.min(fadeIn, fadeOut);
  const slideY = interpolate(
    frame,
    [active.startFrame, active.startFrame + 15],
    [8, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <div
      style={{
        position: "absolute",
        bottom: 62,
        left: 80,
        opacity,
        transform: `translateY(${slideY}px)`,
        display: "flex",
        alignItems: "center",
        gap: 10,
        background: "rgba(0,0,0,0.55)",
        border: `1px solid ${active.color}44`,
        borderRadius: 10,
        padding: "8px 18px",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: active.color,
          flexShrink: 0,
          boxShadow: `0 0 8px ${active.color}`,
        }}
      />
      <span
        style={{
          color: "rgba(255,255,255,0.9)",
          fontSize: 14,
          fontWeight: 500,
          letterSpacing: "0.01em",
        }}
      >
        {active.label}
      </span>
    </div>
  );
}

// ─── P&L Meter ───────────────────────────────────────────────────────────────

function PnlMeter({ pnl }: { pnl: number }) {
  const MAX_PNL = 100;
  const MIN_PNL = -30;
  const range = MAX_PNL - MIN_PNL;

  const clampedPnl = Math.max(MIN_PNL, Math.min(MAX_PNL, pnl));
  const zeroY = ((MAX_PNL - 0) / range) * 100;
  const pnlY = ((MAX_PNL - clampedPnl) / range) * 100;
  const isPos = pnl >= 0;
  const color = isPos ? "#3fb950" : "#f85149";

  return (
    <div
      style={{
        width: 14,
        height: 200,
        background: "rgba(255,255,255,0.06)",
        borderRadius: 99,
        position: "relative",
        overflow: "hidden",
        border: "1px solid rgba(255,255,255,0.1)",
        flexShrink: 0,
      }}
    >
      {/* Zero line */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: `${zeroY}%`,
          height: 1,
          background: "rgba(255,255,255,0.25)",
        }}
      />
      {/* Fill */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: isPos ? `${pnlY}%` : `${zeroY}%`,
          height: isPos
            ? `${zeroY - pnlY}%`
            : `${pnlY - zeroY}%`,
          background: color,
          borderRadius: 99,
          transition: "none",
          minHeight: 2,
        }}
      />
    </div>
  );
}

// ─── Position Card ────────────────────────────────────────────────────────────

function PositionCard({ frame }: { frame: number }) {
  const { fps } = useVideoConfig();

  const markPrice = getPriceAtFrame(frame);
  const pnl = calcTotalNetPnl(markPrice);
  const isPositive = pnl >= 0;

  const slideIn = spring({
    fps,
    frame: frame - 50,
    config: { damping: 20, mass: 0.8, stiffness: 80 },
    from: 40,
    to: 0,
  });
  const cardOpacity = interpolate(frame, [50, 80], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const pnlColor = isPositive ? "#3fb950" : "#f85149";
  const pnlBorderColor = isPositive
    ? "rgba(63,185,80,0.28)"
    : "rgba(248,81,73,0.28)";
  const pnlBg = isPositive
    ? "rgba(63,185,80,0.07)"
    : "rgba(248,81,73,0.07)";

  // Pulse the P&L value on significant changes
  const pnlScale = interpolate(
    Math.abs(pnl),
    [0, 10, 30, 60, 91],
    [1, 1.01, 1.03, 1.05, 1.08],
    { extrapolateRight: "clamp", extrapolateLeft: "clamp" }
  );

  const rows = [
    { label: "Quantity", value: `${QTY} BTC`, color: undefined, highlight: false },
    { label: "Entry Price", value: `$${fmtPrice(ENTRY_PRICE)}`, color: "rgba(88,166,255,0.9)", highlight: false },
    { label: "Current Price", value: `$${fmtPrice(markPrice)}`, color: "#c9d1d9", highlight: true },
    { label: "Take Profit", value: `$${fmtPrice(TAKE_PROFIT)}`, color: "#3fb950", highlight: false },
    { label: "Stop Loss", value: `$${fmtPrice(STOP_LOSS)}`, color: "#f85149", highlight: false },
  ];

  return (
    <div
      style={{
        transform: `translateX(${slideIn}px)`,
        opacity: cardOpacity,
        width: 320,
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <div
        style={{
          background: "rgba(22,27,34,0.85)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 18,
          padding: "24px 26px",
          backdropFilter: "blur(12px)",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 20,
            paddingBottom: 16,
            borderBottom: "1px solid rgba(255,255,255,0.07)",
          }}
        >
          <span
            style={{
              background: "rgba(46,204,113,0.12)",
              color: "#3fb950",
              border: "1px solid rgba(46,204,113,0.35)",
              borderRadius: 999,
              padding: "4px 14px",
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.08em",
            }}
          >
            LONG
          </span>
          <span
            style={{
              color: "rgba(255,255,255,0.7)",
              fontSize: 15,
              fontWeight: 700,
              letterSpacing: "0.05em",
            }}
          >
            {PAIR}
          </span>
        </div>

        {/* Data rows */}
        {rows.map(({ label, value, color, highlight }) => (
          <div
            key={label}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 11,
              padding: highlight ? "7px 10px" : "0 2px",
              background: highlight
                ? "rgba(88,166,255,0.07)"
                : "transparent",
              borderRadius: highlight ? 8 : 0,
              border: highlight
                ? "1px solid rgba(88,166,255,0.12)"
                : "none",
            }}
          >
            <span
              style={{
                color: "rgba(255,255,255,0.4)",
                fontSize: 12,
                letterSpacing: "0.01em",
              }}
            >
              {label}
            </span>
            <span
              style={{
                color: color ?? "rgba(255,255,255,0.85)",
                fontSize: 13,
                fontWeight: 600,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {value}
            </span>
          </div>
        ))}

        {/* P&L section */}
        <div
          style={{
            marginTop: 18,
            padding: "18px 18px",
            background: pnlBg,
            border: `1px solid ${pnlBorderColor}`,
            borderRadius: 14,
            display: "flex",
            alignItems: "center",
            gap: 14,
          }}
        >
          <PnlMeter pnl={pnl} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                color: "rgba(255,255,255,0.4)",
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                marginBottom: 6,
              }}
            >
              Unrealized P&amp;L
            </div>
            <div
              style={{
                color: pnlColor,
                fontSize: 32,
                fontWeight: 800,
                fontVariantNumeric: "tabular-nums",
                letterSpacing: "-0.02em",
                transform: `scale(${pnlScale})`,
                transformOrigin: "left center",
                lineHeight: 1,
              }}
            >
              {fmtPnl(pnl)}
            </div>
            <div
              style={{
                color: "rgba(255,255,255,0.35)",
                fontSize: 11,
                marginTop: 6,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              Δ {isPositive ? "+" : ""}
              {fmtPrice(markPrice - ENTRY_PRICE)} from entry
            </div>
          </div>
        </div>

        {/* Fees note */}
        <div
          style={{
            marginTop: 10,
            color: "rgba(255,255,255,0.22)",
            fontSize: 10,
            textAlign: "right",
            letterSpacing: "0.02em",
          }}
        >
          incl. entry &amp; estimated close fees
        </div>
      </div>
    </div>
  );
}

// ─── TP Hit Flash ─────────────────────────────────────────────────────────────

function TpHitFlash({ frame }: { frame: number }) {
  if (frame < 310) return null;
  const t = frame - 310;
  const opacity = interpolate(t, [0, 8, 25, 50], [0, 0.35, 0.2, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "rgba(63,185,80,1)",
        opacity,
        pointerEvents: "none",
      }}
    />
  );
}

// ─── Main Composition ────────────────────────────────────────────────────────

export const OpenPositionDemo = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const markPrice = getPriceAtFrame(frame);
  const pnl = calcTotalNetPnl(markPrice);
  const isPositive = pnl >= 0;
  const pnlColor = isPositive ? "#3fb950" : "#f85149";

  const headerOpacity = interpolate(frame, [0, 30], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const headerSlide = interpolate(frame, [0, 30], [-12, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.quad),
  });

  const chartOpacity = interpolate(frame, [30, 65], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#0d1117",
        fontFamily: "system-ui, -apple-system, sans-serif",
        overflow: "hidden",
      }}
    >
      {/* Subtle dot grid background */}
      <svg
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          opacity: 0.035,
        }}
      >
        <defs>
          <pattern
            id="dots"
            width="32"
            height="32"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="1.5" cy="1.5" r="1.5" fill="white" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#dots)" />
      </svg>

      {/* Top header bar */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 72,
          background: "rgba(22,27,34,0.9)",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 72px",
          opacity: headerOpacity,
          transform: `translateY(${headerSlide}px)`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <span
            style={{
              color: "rgba(255,255,255,0.9)",
              fontSize: 16,
              fontWeight: 700,
              letterSpacing: "-0.01em",
            }}
          >
            Market Live Trainer
          </span>
          <span
            style={{
              width: 1,
              height: 18,
              background: "rgba(255,255,255,0.15)",
            }}
          />
          <span
            style={{
              color: "rgba(255,255,255,0.45)",
              fontSize: 13,
              letterSpacing: "0.02em",
            }}
          >
            Open Position — Live P&amp;L Demo
          </span>
        </div>

        {/* Live price badge */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 20,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "rgba(88,166,255,0.1)",
              border: "1px solid rgba(88,166,255,0.2)",
              borderRadius: 8,
              padding: "6px 14px",
            }}
          >
            <span
              style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}
            >
              {PAIR}
            </span>
            <span
              style={{
                color: "#58a6ff",
                fontSize: 15,
                fontWeight: 700,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              ${fmtPrice(markPrice)}
            </span>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: isPositive
                ? "rgba(63,185,80,0.1)"
                : "rgba(248,81,73,0.1)",
              border: `1px solid ${isPositive ? "rgba(63,185,80,0.25)" : "rgba(248,81,73,0.25)"}`,
              borderRadius: 8,
              padding: "6px 14px",
            }}
          >
            <span
              style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}
            >
              P&amp;L
            </span>
            <span
              style={{
                color: pnlColor,
                fontSize: 15,
                fontWeight: 700,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {fmtPnl(pnl)}
            </span>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div
        style={{
          position: "absolute",
          top: 90,
          left: 72,
          right: 72,
          bottom: 56,
          display: "flex",
          gap: 56,
          alignItems: "center",
        }}
      >
        {/* Chart section */}
        <div
          style={{
            flex: 1,
            opacity: chartOpacity,
          }}
        >
          <div
            style={{
              color: "rgba(255,255,255,0.35)",
              fontSize: 11,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              marginBottom: 12,
            }}
          >
            Price Chart · Simulated
          </div>
          <PriceChart currentFrame={frame} />
        </div>

        {/* Position card section */}
        <div>
          <div
            style={{
              color: "rgba(255,255,255,0.35)",
              fontSize: 11,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              marginBottom: 12,
              opacity: interpolate(frame, [50, 80], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
            }}
          >
            Position Details
          </div>
          <PositionCard frame={frame} />
        </div>
      </div>

      {/* Phase label */}
      <PhaseLabel frame={frame} />

      {/* TP hit flash */}
      <TpHitFlash frame={frame} />

      {/* Bottom progress bar */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 4,
          background: "rgba(255,255,255,0.06)",
        }}
      >
        <div
          style={{
            width: `${(frame / TOTAL_FRAMES) * 100}%`,
            height: "100%",
            background: "linear-gradient(90deg, #58a6ff 0%, #3fb950 100%)",
            borderRadius: "0 2px 2px 0",
          }}
        />
      </div>
    </AbsoluteFill>
  );
};
