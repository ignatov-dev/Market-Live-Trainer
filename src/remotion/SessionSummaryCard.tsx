/**
 * SessionSummaryCard.tsx
 * Remotion composition: SessionSummary as a floating hero card.
 *
 * 300 frames @ 30 fps = 10 s
 *
 * Timeline:
 *   0 – 40   card enters (spring slide-up + fade)
 *  40 – 80   numbers count up from zero
 *  80 – 300  values oscillate live — P&L rises, dips, recovers
 */

import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Easing,
} from "remotion";

// ─── Design tokens (matches app CSS vars) ────────────────────────────────────

const FONT =
  '"SF Pro Text", -apple-system, BlinkMacSystemFont, "Helvetica Neue", "Segoe UI", sans-serif';
const SUCCESS = "#1b8a63";
const DANGER  = "#bb3b51";
const INK     = "#17253d";

// ─── Background gradient (from user spec) ────────────────────────────────────

const BG = [
  "radial-gradient(120% 92% at 0% 0%, rgba(209,207,247,0.95) 0%, rgba(209,207,247,0.52) 44%, rgba(209,207,247,0) 76%)",
  "radial-gradient(115% 94% at 100% 0%, rgba(184,217,243,0.94) 0%, rgba(184,217,243,0.56) 46%, rgba(184,217,243,0) 78%)",
  "linear-gradient(180deg, #d1cff7 0%, #b8d9f3 58%, #ffffff 100%)",
].join(", ");

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number, dp = 2) {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  });
}

function fmtSigned(n: number) {
  return (n >= 0 ? "+" : "−") + "$" + fmt(Math.abs(n));
}

function fmtPct(n: number) {
  return (n >= 0 ? "+" : "") + fmt(n) + "%";
}

// ─── Live data simulation ─────────────────────────────────────────────────────
// P&L rises from 0, oscillates naturally, then settles around +$312.

function computeMetrics(frame: number) {
  const INITIAL_BALANCE = 10_000;

  // Snap to a new value 2× per second (every 15 frames at 30 fps).
  const stepF  = Math.floor(frame / 15) * 15;
  const trend  = interpolate(stepF, [0, 15, 180, 300], [0, 40, 280, 312.5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const osc    = Math.sin(stepF * 0.005) * 18 + Math.sin(stepF * 0.002) * 8;
  const netPnl = Math.max(-60, trend + osc);

  const equity          = INITIAL_BALANCE + netPnl;
  const usedMargin      = frame > 30 ? 1_200 : 0;
  const availableMargin = Math.max(0, equity - usedMargin);
  const cashBalance     = INITIAL_BALANCE + (netPnl < 0 ? netPnl * 0.4 : 0);
  const sessionReturn   = ((equity - INITIAL_BALANCE) / INITIAL_BALANCE) * 100;

  return { equity, netPnl, availableMargin, cashBalance, sessionReturn };
}

// ─── Ambient blob ─────────────────────────────────────────────────────────────

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
      left:   x - r,
      top:    y - r,
      width:  r * 2,
      height: r * 2,
      borderRadius: "50%",
      background: color,
      opacity,
      filter: `blur(${r * 0.65}px)`,
      pointerEvents: "none",
    }} />
  );
}

// ─── Card cell (exact match to .grid p in SessionSummary.module.css) ──────────

interface CellProps {
  label: string;
  children: React.ReactNode;
  delay: number;
  frame: number;
  fps: number;
}
function Cell({ label, children, delay, frame, fps }: CellProps) {
  const entrance = spring({
    fps, frame: frame - delay,
    config: { damping: 22, stiffness: 90, mass: 0.7 },
    from: 0, to: 1,
  });
  return (
    <div style={{
      padding:      "7px 8px",
      borderRadius: 12,
      background:   "linear-gradient(170deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.02) 100%)",
      border:       "1px solid rgba(255,255,255,0.17)",
      display:      "grid",
      gap:          2,
      opacity:      entrance,
      transform:    `translateY(${(1 - entrance) * 10}px)`,
    }}>
      {/* .grid p > span */}
      <span style={{
        fontSize:      10,
        opacity:       0.76,
        textTransform: "uppercase" as const,
        letterSpacing: "0.06em",
        fontFamily:    FONT,
        display:       "block",
      }}>
        {label}
      </span>
      {children}
    </div>
  );
}

// ─── Main Composition ─────────────────────────────────────────────────────────

export const SessionSummaryCard = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const { equity, netPnl, availableMargin, cashBalance, sessionReturn } =
    computeMetrics(frame);

  const isPos = netPnl >= 0;

  // ── Card entrance ──────────────────────────────────────────────────────────
  const cardEntrance = spring({
    fps, frame,
    config: { damping: 20, stiffness: 55, mass: 1.1 },
    from: 0, to: 1,
  });
  const cardOpacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" });

  // No floating after entrance — card is stable once it appears.
  const floatY        = 0;
  const floatTilt     = 0;
  const shadowBlur    = 48;
  const shadowOpacity = 0.18;

  // ── Real card dimensions (matches .session-summary in styles.css) ──────────
  // Scaled up ×2.4 so it reads clearly at 1920×1080.
  const CARD_W     = 350;
  const CARD_H     = 236;
  const CARD_SCALE = 2.4;

  return (
    <AbsoluteFill style={{ background: BG, overflow: "hidden" }}>

      {/* ── Ambient blobs ────────────────────────────────────────────────── */}
      <Blob cx={200}  cy={180}  r={260} color="rgba(209,207,247,0.55)" opacity={1}
        frame={frame} speedX={0.018} speedY={0.012} phase={0} />
      <Blob cx={1720} cy={200}  r={220} color="rgba(184,217,243,0.60)" opacity={1}
        frame={frame} speedX={0.014} speedY={0.020} phase={2.1} />
      <Blob cx={960}  cy={900}  r={300} color="rgba(220,215,250,0.40)" opacity={1}
        frame={frame} speedX={0.010} speedY={0.008} phase={1.0} />
      <Blob cx={400}  cy={820}  r={180} color="rgba(184,217,243,0.35)" opacity={1}
        frame={frame} speedX={0.022} speedY={0.016} phase={3.5} />
      <Blob cx={1580} cy={780}  r={200} color="rgba(209,207,247,0.38)" opacity={1}
        frame={frame} speedX={0.016} speedY={0.024} phase={5.2} />

      {/* ── Card wrapper — position + float + scale ───────────────────────── */}
      <div style={{
        position:        "absolute",
        left:            960 - CARD_W / 2,
        top:             540 - CARD_H / 2,
        width:           CARD_W,
        height:          CARD_H,
        opacity:         cardOpacity,
        transform:       `translateY(${floatY + (1 - cardEntrance) * 60}px) rotate(${floatTilt}deg) scale(${CARD_SCALE})`,
        transformOrigin: "50% 50%",
      }}>

        {/* Shadow glow in card-local coordinates */}
        <div style={{
          position:      "absolute",
          left:          -30,
          top:           -30,
          width:         CARD_W + 60,
          height:        CARD_H + 60,
          borderRadius:  32,
          background:    "rgba(120,100,200,0.18)",
          filter:        `blur(${shadowBlur / CARD_SCALE}px)`,
          opacity:       shadowOpacity * 6,
          pointerEvents: "none",
        }} />

        {/* ── Card — exact .session-summary CSS ─────────────────────────── */}
        <div style={{
          position:             "relative",
          width:                CARD_W,
          height:               CARD_H,
          background:           "linear-gradient(165deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.08) 100%)",
          border:               "1px solid rgba(255,255,255,0.34)",
          borderRadius:         20,
          backdropFilter:       "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          padding:              "14px 14px 12px",
          boxSizing:            "border-box" as const,
          boxShadow: [
            "inset 0 1px 0 rgba(255,255,255,0.34)",
            `0 ${(shadowBlur * 0.4) / CARD_SCALE}px ${(shadowBlur * 1.0) / CARD_SCALE}px rgba(9,28,56,${shadowOpacity * 1.4})`,
            "0 2px 8px rgba(80,60,160,0.08)",
          ].join(", "),
          display:       "flex",
          flexDirection: "column",
          fontFamily:    FONT,
        }}>

          {/* Grid — 2 × 3, exact .grid CSS */}
          <div style={{
            flex:                1,
            display:             "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap:                 "7px 10px",
            alignContent:        "start",
          }}>

            <Cell label="Source" delay={8} frame={frame} fps={fps}>
              {/* .grid strong */}
              <strong style={{ fontSize: 13, fontWeight: 620, lineHeight: 1.25, color: INK }}>
                Coinbase
              </strong>
            </Cell>

            <Cell label="Mode" delay={12} frame={frame} fps={fps}>
              <strong style={{ fontSize: 13, fontWeight: 620, lineHeight: 1.25, color: INK }}>
                Live
              </strong>
            </Cell>

            <Cell label="Balance" delay={18} frame={frame} fps={fps}>
              {/* .valueInline */}
              <strong style={{
                fontSize:   13, fontWeight: 620, lineHeight: 1.25, color: INK,
                display:    "inline-flex", alignItems: "baseline",
                gap:        6, flexWrap: "nowrap" as const,
              }}>
                {/* .valuePrimary */}
                <span style={{ fontVariantNumeric: "tabular-nums" }}>${fmt(equity)}</span>
                {/* .valueDelta */}
                <span style={{
                  fontSize: 11, fontWeight: 620,
                  color: isPos ? SUCCESS : DANGER,
                  fontVariantNumeric: "tabular-nums",
                }}>
                  {fmtSigned(netPnl)}
                </span>
              </strong>
            </Cell>

            <Cell label="Available Margin" delay={24} frame={frame} fps={fps}>
              <strong style={{
                fontSize: 13, fontWeight: 620, lineHeight: 1.25, color: INK,
                fontVariantNumeric: "tabular-nums",
              }}>
                ${fmt(availableMargin)}
              </strong>
            </Cell>

            <Cell label="Cash Balance" delay={30} frame={frame} fps={fps}>
              <strong style={{
                fontSize: 13, fontWeight: 620, lineHeight: 1.25, color: INK,
                fontVariantNumeric: "tabular-nums",
              }}>
                ${fmt(cashBalance)}
              </strong>
            </Cell>

            <Cell label="Session Return" delay={36} frame={frame} fps={fps}>
              <strong style={{
                fontSize: 13, fontWeight: 620, lineHeight: 1.25,
                fontVariantNumeric: "tabular-nums",
                color: sessionReturn >= 0 ? SUCCESS : DANGER,
              }}>
                {fmtPct(sessionReturn)}
              </strong>
            </Cell>
          </div>

          {/* Footer — exact .footer + .resetBtn CSS */}
          <div style={{
            display:    "flex",
            alignItems: "stretch",
            marginTop:  8,
            opacity: spring({ fps, frame: frame - 40, config: { damping: 22, stiffness: 80 }, from: 0, to: 1 }),
          }}>
            {["Reset session", "Sign out"].map((label, i) => (
              <div key={label} style={{ display: "flex", alignItems: "center", flex: 1 }}>
                {i > 0 && (
                  <div style={{
                    width:      1,
                    alignSelf:  "stretch",
                    background: "rgba(16,38,76,0.2)",
                    flexShrink: 0,
                  }} />
                )}
                {/* .resetBtn */}
                <span style={{
                  flex:          1,
                  textAlign:     "center",
                  padding:       "6px 4px",
                  fontSize:      11,
                  fontWeight:    600,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase" as const,
                  color:         "rgba(16,38,76,0.72)",
                  fontFamily:    FONT,
                }}>
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Progress bar ─────────────────────────────────────────────────────── */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0, height: 3,
        background: "rgba(100,80,180,0.12)",
      }}>
        <div style={{
          width:        `${(frame / 300) * 100}%`,
          height:       "100%",
          background:   "linear-gradient(90deg, #a89de8 0%, #7db8e8 100%)",
          borderRadius: "0 2px 2px 0",
        }} />
      </div>
    </AbsoluteFill>
  );
};
