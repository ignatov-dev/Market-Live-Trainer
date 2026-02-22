/**
 * AppShowcase.tsx
 * A cinematic product video for Market Live Trainer.
 *
 * Storyboard (750 frames @ 30 fps = 25 s):
 *   0 – 80    Browser window materialises on dark bg
 *  80 – 150   App floats gently inside browser frame
 * 150 – 220   "Fullscreen" — chrome dissolves, app expands
 * 220 – 310   Full-app overview · product title floats in
 * 310 – 410   Hero Header zoom  · metrics float as callouts
 * 410 – 510   Chart Panel zoom  · candles animate · pair strip
 * 510 – 600   Trade Ticket + Open Positions spotlight
 * 600 – 670   Analytics Panel  · equity curve · metrics grid
 * 670 – 750   Pull-back → outro card with logo
 */

import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Easing,
} from "remotion";

// ─── 0. Design System ─────────────────────────────────────────────────────────

const DS = {
  bgBase:       "#eef3fa",
  bgTop:        "#f6f9fd",
  surface1:     "#f9fbff",
  surface2:     "#ffffff",
  ink:          "#17253d",
  inkSoft:      "rgba(23,37,61,0.72)",
  muted:        "#63728a",
  brand:        "#2a6fdb",
  brandStrong:  "#1c54ad",
  success:      "#1b8a63",
  successSoft:  "rgba(27,138,99,0.12)",
  danger:       "#bb3b51",
  dangerSoft:   "rgba(187,59,81,0.12)",
  lineSoft:     "rgba(165,181,205,0.36)",
  shadow:       "0 4px 14px rgba(32,52,84,0.08)",
  shadowElevated:"0 8px 24px rgba(31,50,82,0.14)",
} as const;

const FONT =
  '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", "Segoe UI", sans-serif';

// ─── 1. Seeded RNG ────────────────────────────────────────────────────────────

function makeRng(seed: number) {
  let s = seed;
  return () => {
    s = ((s * 1664525 + 1013904223) | 0) >>> 0;
    return s / 4294967296;
  };
}

// ─── 2. Deterministic Candle Data ─────────────────────────────────────────────

interface Candle { o: number; h: number; l: number; c: number; bull: boolean }

const CANDLES: Candle[] = (() => {
  const rng = makeRng(42_137);
  const data: Candle[] = [];
  let p = 43_300;
  const bias = [
    0.46,0.46,0.48,0.52,0.54,0.52,0.50,0.50,0.48,0.46,
    0.46,0.48,0.52,0.54,0.56,0.54,0.52,0.52,0.50,0.50,
    0.48,0.46,0.46,0.48,0.52,0.54,0.56,0.54,0.52,0.50,
    0.50,0.52,0.54,0.56,0.58,0.56,0.54,0.52,0.50,0.50,
    0.48,0.46,0.44,0.46,0.48,0.52,0.56,0.58,0.60,0.58,
    0.56,0.54,0.52,0.54,0.56,0.58,0.60,0.62,0.60,0.58,
    0.56,0.54,0.52,0.54,0.56,0.58,0.60,0.58,0.56,0.54,
  ];
  for (let i = 0; i < 70; i++) {
    const vol = 0.007 + rng() * 0.005;
    const chg = (rng() - (bias[i] ?? 0.5)) * p * vol;
    const o = p;
    p = Math.max(41_800, Math.min(46_000, p + chg));
    const c = p;
    const h = Math.max(o, c) + rng() * p * 0.003;
    const l = Math.min(o, c) - rng() * p * 0.003;
    data.push({ o, h, l, c, bull: c >= o });
  }
  return data;
})();

// ─── 3. Helpers ───────────────────────────────────────────────────────────────

function clamp01(v: number) { return Math.min(1, Math.max(0, v)); }

function easeIn(f: number, s: number, e: number) {
  return interpolate(f, [s, e], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
}

function easeOut(f: number, s: number, e: number) {
  return interpolate(f, [s, e], [1, 0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
    easing: Easing.in(Easing.quad),
  });
}

function fmt(n: number, dp = 2) {
  return n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}
function fmtSigned(n: number) { return (n >= 0 ? "+" : "") + "$" + fmt(Math.abs(n)); }

// ─── 4. Camera System ─────────────────────────────────────────────────────────
// Pure scale-from-center: no panning. Every section zooms in/out symmetrically
// around the video centre (960, 540). The app div uses transform-origin: 50% 50%.

interface Camera { scale: number }

function cameraToTransform(c: Camera): string {
  return `scale(${c.scale})`;
}

function lerpCam(a: Camera, b: Camera, t: number): Camera {
  const e = Easing.out(Easing.cubic)(clamp01(t));
  return { scale: a.scale + (b.scale - a.scale) * e };
}

// ─── Named cameras ─────────────────────────────────────────────────────────────
const CAM = {
  full:      { scale: 1.00 }, // full overview
  hero:      { scale: 1.12 }, // gentle zoom — hero header still in frame
  chart:     { scale: 1.55 }, // chart + ticket area nicely centred
  ticket:    { scale: 1.72 }, // slightly deeper zoom same region
  positions: { scale: 1.44 }, // positions row moves toward centre
  analytics: { scale: 1.52 }, // analytics area
};

// ─── 5. Candle Chart SVG ──────────────────────────────────────────────────────

function CandleChart({ w, h, count }: { w: number; h: number; count: number }) {
  const PAD = { t: 14, r: 56, b: 28, l: 6 };
  const cw = w - PAD.l - PAD.r;
  const ch = h - PAD.t - PAD.b;

  const visible = CANDLES.slice(-Math.max(5, Math.min(count, CANDLES.length)));
  const allH = visible.map(c => c.h);
  const allL = visible.map(c => c.l);
  const minP = Math.min(...allL);
  const maxP = Math.max(...allH);
  const rng  = maxP - minP;
  const pad  = rng * 0.12;

  const ys = (p: number) => ch - ((p - minP + pad) / (rng + pad * 2)) * ch;
  const gap = cw / visible.length;
  const bw  = Math.max(1.5, gap * 0.55);

  const gridPrices = [0.2, 0.4, 0.6, 0.8].map(f => minP - pad + f * (rng + pad * 2));

  return (
    <svg width={w} height={h} style={{ display: "block", overflow: "visible" }}>
      <defs>
        <clipPath id="cc"><rect x={PAD.l} y={PAD.t} width={cw} height={ch} /></clipPath>
      </defs>
      <g transform={`translate(${PAD.l},${PAD.t})`}>
        {gridPrices.map((p, i) => (
          <g key={i}>
            <line x1={0} y1={ys(p)} x2={cw} y2={ys(p)}
              stroke="rgba(165,181,205,0.2)" strokeWidth={1} />
            <text x={cw + 5} y={ys(p) + 4} fontSize={9} fill={DS.muted} fontFamily={FONT}
              textAnchor="start">{fmt(p, 0)}</text>
          </g>
        ))}
        <g clipPath="url(#cc)">
          {visible.map((c, i) => {
            const x = i * gap + gap / 2;
            const top = ys(Math.max(c.o, c.c));
            const bh  = Math.max(1.5, Math.abs(ys(c.o) - ys(c.c)));
            const col = c.bull ? DS.success : DS.danger;
            return (
              <g key={i}>
                <line x1={x} y1={ys(c.h)} x2={x} y2={ys(c.l)}
                  stroke={col} strokeWidth={1} opacity={0.65} />
                <rect x={x - bw / 2} y={top} width={bw} height={bh}
                  fill={col} rx={0.8} opacity={0.92} />
              </g>
            );
          })}
        </g>
        {/* Last price dot + line */}
        {visible.length > 0 && (() => {
          const last = visible[visible.length - 1]!;
          const lx = (visible.length - 1) * gap + gap / 2;
          const ly = ys(last.c);
          const col = last.bull ? DS.success : DS.danger;
          return (
            <g>
              <line x1={lx} x2={cw} y1={ly} y2={ly}
                stroke={col} strokeWidth={1} strokeDasharray="3,3" opacity={0.5} />
              <circle cx={lx} cy={ly} r={3.5} fill={col} />
              <circle cx={lx} cy={ly} r={7} fill={col} opacity={0.2} />
              <rect x={cw} y={ly - 9} width={48} height={18} rx={4}
                fill={col} opacity={0.9} />
              <text x={cw + 24} y={ly + 4} fontSize={9} fill="#fff"
                textAnchor="middle" fontFamily={FONT} fontWeight={700}>
                {fmt(last.c, 0)}
              </text>
            </g>
          );
        })()}
      </g>
    </svg>
  );
}

// ─── 6. App Mockup Panels ─────────────────────────────────────────────────────

function HeroMockup({ frame }: { frame: number }) {
  const tickX = -((frame * 1.4) % 900);
  const pnl   = 312.50 + Math.sin(frame * 0.035) * 22;
  const equity = 10_000 + pnl;

  const marketItems = [
    { pair: "BTC/USD",  price: "43,521.40", chg: "+1.24%", pos: true  },
    { pair: "ETH/USD",  price: "2,318.75",  chg: "+0.87%", pos: true  },
    { pair: "SOL/USD",  price: "98.42",     chg: "−0.31%", pos: false },
    { pair: "BNB/USD",  price: "384.60",    chg: "+2.11%", pos: true  },
    { pair: "XRP/USD",  price: "0.5821",    chg: "+1.55%", pos: true  },
    { pair: "ADA/USD",  price: "0.4139",    chg: "−0.72%", pos: false },
    { pair: "AVAX/USD", price: "29.84",     chg: "+3.20%", pos: true  },
    { pair: "DOGE/USD", price: "0.0821",    chg: "+0.44%", pos: true  },
    { pair: "DOT/USD",  price: "7.312",     chg: "−0.18%", pos: false },
    { pair: "LINK/USD", price: "14.22",     chg: "+1.02%", pos: true  },
  ];

  const cells = [
    { label: "Balance",   value: "$10,000.00" },
    { label: "Equity",    value: `$${fmt(equity)}`, bold: true },
    { label: "Net P&L",   value: fmtSigned(pnl), colored: true, pos: pnl >= 0 },
    { label: "Positions", value: "2 open" },
    { label: "Win Rate",  value: "66.7%" },
    { label: "Trades",    value: "9 closed" },
  ];

  return (
    <div style={{
      background: "linear-gradient(180deg,rgba(245,249,254,.97) 0%,rgba(239,245,252,.95) 100%)",
      backdropFilter: "blur(6px)",
      borderBottom: `1px solid ${DS.lineSoft}`,
      padding: "20px 60px 0",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Decorative sweep */}
      <div style={{
        position: "absolute", top: "-40%", right: "-8%",
        width: "52%", height: "200%", transform: "rotate(14deg)",
        background: "linear-gradient(180deg,rgba(255,255,255,.18) 0%,rgba(255,255,255,0) 68%)",
        pointerEvents: "none",
      }} />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 20 }}>
        {/* Brand */}
        <div>
          <p style={{ margin: 0, fontSize: 10, fontWeight: 700, letterSpacing: ".11em", textTransform: "uppercase", color: DS.muted, fontFamily: FONT }}>
            Claude Code Challenge MVP
          </p>
          <h1 style={{ margin: "5px 0 4px", fontSize: 32, fontWeight: 760, letterSpacing: "-.025em", color: DS.ink, lineHeight: 1.08, fontFamily: FONT }}>
            Market Live Trainer
          </h1>
          <p style={{ margin: 0, fontSize: 13, color: DS.muted, maxWidth: "50ch", fontFamily: FONT }}>
            Live Coinbase candles · Paper trading · AI coach · Multi-pair
          </p>
        </div>

        {/* Session Summary */}
        <div style={{
          width: 316, flexShrink: 0,
          background: "linear-gradient(165deg,rgba(255,255,255,.24) 0%,rgba(255,255,255,.08) 100%)",
          border: "1px solid rgba(255,255,255,.38)",
          borderRadius: 18, padding: "13px 15px",
          backdropFilter: "blur(14px)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,.36),0 10px 26px rgba(9,28,56,.22)",
        }}>
          <p style={{ margin: "0 0 9px", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".09em", color: DS.ink, fontFamily: FONT }}>
            Session Summary
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            {cells.map(({ label, value, colored, pos }) => (
              <div key={label} style={{
                padding: "7px 9px", borderRadius: 11,
                background: "linear-gradient(170deg,rgba(255,255,255,.16) 0%,rgba(255,255,255,.02) 100%)",
                border: "1px solid rgba(255,255,255,.18)",
              }}>
                <span style={{ display: "block", fontSize: 9, textTransform: "uppercase", letterSpacing: ".06em", opacity: .75, color: DS.ink, fontFamily: FONT }}>
                  {label}
                </span>
                <strong style={{
                  display: "block", fontSize: 12, fontWeight: 660, lineHeight: 1.3, fontFamily: FONT,
                  fontVariantNumeric: "tabular-nums",
                  color: colored ? (pos ? DS.success : DS.danger) : DS.ink,
                }}>
                  {value}
                </strong>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* News Ticker */}
      <div style={{
        marginTop: 14, overflow: "hidden",
        maskImage: "linear-gradient(to right,transparent 0%,#000 7%,#000 93%,transparent 100%)",
        WebkitMaskImage: "linear-gradient(to right,transparent 0%,#000 7%,#000 93%,transparent 100%)",
      }}>
        <div style={{ display: "flex", transform: `translateX(${tickX}px)`, whiteSpace: "nowrap" }}>
          {[...marketItems, ...marketItems].map((m, i) => (
            <span key={i} style={{ display: "inline-flex", alignItems: "center", padding: "7px 0", fontFamily: FONT, fontSize: 12 }}>
              <span style={{ margin: "0 10px 0 18px", opacity: .35, color: DS.ink }}>•</span>
              <span style={{ fontWeight: 700, color: DS.ink, marginRight: 6 }}>{m.pair}</span>
              <span style={{ fontVariantNumeric: "tabular-nums", color: DS.ink, marginRight: 6 }}>{m.price}</span>
              <span style={{ color: m.pos ? DS.success : DS.danger, fontWeight: 700, fontSize: 11 }}>{m.chg}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function ChartPanelMockup({ frame }: { frame: number }) {
  const pairs = ["BTC/USD", "ETH/USD", "SOL/USD", "BNB/USD", "XRP/USD"];
  const strips = [
    { id: "BTC", price: "43,521", chg: "+1.24%", pos: true  },
    { id: "ETH", price: "2,318",  chg: "+0.87%", pos: true  },
    { id: "SOL", price: "98.42",  chg: "−0.31%", pos: false },
    { id: "BNB", price: "384.6",  chg: "+2.11%", pos: true  },
    { id: "XRP", price: "0.582",  chg: "+1.55%", pos: true  },
  ];
  const candleCount = Math.round(interpolate(frame, [0, 120], [8, 55], { extrapolateRight: "clamp" }));

  return (
    <div className="panel chart-panel" style={{ background: DS.surface2, borderRadius: 14, boxShadow: DS.shadow, padding: 16, position: "relative" }}>
      {/* Glass sheen */}
      <div style={{ position: "absolute", inset: 0, borderRadius: 14, background: "linear-gradient(180deg,rgba(255,255,255,.46) 0%,rgba(255,255,255,0) 44%)", pointerEvents: "none" }} />

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", paddingBottom: 9, borderBottom: `1px solid ${DS.lineSoft}` }}>
        <div style={{ display: "flex" }}>
          {pairs.map((p, i) => (
            <button key={p} style={{
              background: "transparent", border: 0, cursor: "pointer", fontFamily: FONT,
              color: p === "BTC/USD" ? DS.brandStrong : DS.muted,
              fontSize: 12, fontWeight: 650, padding: "0 11px", lineHeight: 1.2, height: 22,
              borderRight: i < pairs.length - 1 ? `1px solid rgba(145,165,197,.38)` : "none",
            }}>{p}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 2 }}>
          {["1m","5m","15m","1h","4h","1D"].map(tf => (
            <button key={tf} style={{
              background: tf === "1h" ? "rgba(42,111,219,.1)" : "transparent",
              border: 0, cursor: "pointer", fontFamily: FONT,
              color: tf === "1h" ? DS.brandStrong : DS.muted,
              fontSize: 11, fontWeight: 650, padding: "3px 8px", borderRadius: 6,
            }}>{tf}</button>
          ))}
        </div>
      </div>

      {/* Market Strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 7, marginTop: 10 }}>
        {strips.map(s => (
          <div key={s.id} style={{
            background: "linear-gradient(170deg,rgba(255,255,255,.76) 0%,rgba(245,250,255,.62) 100%)",
            border: "1px solid rgba(255,255,255,.6)", borderRadius: 11, padding: 9,
            boxShadow: "inset 0 1px 0 rgba(255,255,255,.7)",
          }}>
            <p style={{ margin: "0 0 2px", fontSize: 10, color: DS.muted, fontFamily: FONT }}>{s.id}</p>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 660, color: DS.ink, fontVariantNumeric: "tabular-nums", fontFamily: FONT }}>{s.price}</p>
            <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: s.pos ? DS.success : DS.danger, fontFamily: FONT }}>{s.chg}</p>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div style={{
        marginTop: 10, height: 260,
        background: "linear-gradient(180deg,rgba(255,255,255,.82) 0%,rgba(241,247,255,.72) 100%)",
        border: "1px solid rgba(255,255,255,.5)", borderRadius: 10,
        boxShadow: "inset 0 1px 0 rgba(255,255,255,.72)", overflow: "hidden",
        position: "relative",
      }}>
        <CandleChart w={900} h={260} count={candleCount} />
      </div>
    </div>
  );
}

function TicketPanelMockup() {
  return (
    <div style={{ background: DS.surface2, borderRadius: 14, boxShadow: DS.shadow, padding: 16, position: "relative" }}>
      <div style={{ position: "absolute", inset: 0, borderRadius: 14, background: "linear-gradient(180deg,rgba(255,255,255,.46) 0%,rgba(255,255,255,0) 44%)", pointerEvents: "none" }} />
      <div style={{ paddingBottom: 9, borderBottom: `1px solid ${DS.lineSoft}`, marginBottom: 13 }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 720, color: DS.ink, fontFamily: FONT }}>Order Ticket</h2>
      </div>

      {/* Side toggles */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
        <button style={{ background: DS.successSoft, border: 0, borderRadius: 10, padding: "10px", fontSize: 11, fontWeight: 700, color: DS.success, fontFamily: FONT, cursor: "default" }}>BUY / LONG</button>
        <button style={{ background: DS.dangerSoft,  border: 0, borderRadius: 10, padding: "10px", fontSize: 11, fontWeight: 700, color: DS.danger,  fontFamily: FONT, cursor: "default" }}>SELL / SHORT</button>
      </div>

      {/* Type */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {["Market","Limit"].map((t,i) => (
          <div key={t} style={{
            padding: "5px 14px", borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: "default",
            background: i === 0 ? DS.brand : "transparent",
            color: i === 0 ? "#fff" : DS.muted,
            border: i !== 0 ? `1px solid rgba(141,161,189,.5)` : "none",
            fontFamily: FONT,
          }}>{t}</div>
        ))}
      </div>

      {/* Inputs */}
      {[
        { label: "Quantity (BTC)",  val: "0.1" },
        { label: "Take Profit ($)", val: "44,500" },
        { label: "Stop Loss ($)",   val: "42,800" },
      ].map(({ label, val }) => (
        <label key={label} style={{ display: "grid", gap: 4, fontSize: 12, color: DS.muted, marginBottom: 9, fontFamily: FONT }}>
          {label}
          <input readOnly defaultValue={val} style={{
            border: `1px solid rgba(141,161,189,.54)`, borderRadius: 8,
            padding: "9px 11px", fontSize: 13, color: DS.ink, background: "#fff", fontFamily: FONT,
          }} />
        </label>
      ))}

      {/* Buttons */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 4 }}>
        <button style={{
          background: DS.success, border: `1px solid rgba(16,129,81,.5)`,
          borderRadius: 10, padding: "11px", fontSize: 12, fontWeight: 700,
          color: "#fff", fontFamily: FONT, cursor: "default",
          boxShadow: "0 6px 18px rgba(16,129,81,.28),0 2px 6px rgba(8,13,23,.2)",
        }}>Buy / Long</button>
        <button style={{
          background: DS.danger, border: `1px solid rgba(191,35,61,.5)`,
          borderRadius: 10, padding: "11px", fontSize: 12, fontWeight: 700,
          color: "#fff", fontFamily: FONT, cursor: "default",
          boxShadow: "0 6px 18px rgba(191,35,61,.28),0 2px 6px rgba(8,13,23,.2)",
        }}>Sell / Short</button>
      </div>
    </div>
  );
}

interface PositionProps {
  frame: number; pair: string; side: "long"|"short";
  qty: number; entry: number; tp: number; sl: number; phaseOffset?: number;
}
function PositionCard({ frame, pair, side, qty, entry, tp, sl, phaseOffset = 0 }: PositionProps) {
  // Oscillate mark price between entry and near-TP
  const t = (Math.sin((frame + phaseOffset) * 0.032) + 1) / 2;
  const lo = side === "long" ? entry - 80  : entry + 40;
  const hi = side === "long" ? tp    - 30  : sl    + 60;
  const mark = lo + t * (hi - lo);
  const pnl  = (mark - entry) * qty * (side === "long" ? 1 : -1)
               - entry * qty * 0.001 - mark * qty * 0.001;
  const pos  = pnl >= 0;
  const col  = pos ? DS.success : DS.danger;

  return (
    <div style={{
      border: `1px solid ${pos ? "rgba(27,138,99,.3)" : "rgba(187,59,81,.3)"}`,
      borderRadius: 12, background: DS.surface1, padding: "10px 12px",
      display: "grid", gridTemplateRows: "auto 1fr auto", gap: 8,
      boxShadow: pos
        ? "0 4px 14px rgba(27,138,99,.1)"
        : "0 4px 14px rgba(187,59,81,.1)",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 7, borderBottom: `1px solid rgba(176,194,218,.44)` }}>
        <span style={{
          borderRadius: 999, padding: "3px 9px", fontSize: 10, fontWeight: 700, letterSpacing: ".04em",
          border: `1px solid ${pos ? "rgba(27,138,99,.35)" : "rgba(187,59,81,.35)"}`,
          color: col, textTransform: "uppercase", fontFamily: FONT,
        }}>{side}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: DS.muted, letterSpacing: ".03em", textTransform: "uppercase", fontFamily: FONT }}>{pair}</span>
      </div>
      <div style={{ display: "grid", gap: 5 }}>
        {[
          { label: "Qty",           val: `${qty} BTC` },
          { label: "Entry",         val: `$${fmt(entry)}` },
          { label: "Take Profit",   val: `$${fmt(tp)}`,   c: DS.success },
          { label: "Stop Loss",     val: `$${fmt(sl)}`,   c: DS.danger  },
          { label: "P&L (w/ fees)", val: fmtSigned(pnl),  c: col, big: true },
        ].map(({ label, val, c, big }) => (
          <p key={label} style={{ margin: 0, display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, color: DS.muted, fontFamily: FONT }}>
            <span>{label}</span>
            <span style={{ fontSize: big ? 12 : 11, fontWeight: 700, color: c ?? DS.ink, fontVariantNumeric: "tabular-nums" }}>{val}</span>
          </p>
        ))}
      </div>
      <div style={{ textAlign: "center", paddingTop: 7, borderTop: `1px solid rgba(176,194,218,.4)` }}>
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", color: col, fontFamily: FONT }}>
          Close Position
        </span>
      </div>
    </div>
  );
}

function AnalyticsPanelMockup({ frame }: { frame: number }) {
  const pnl = 312 + Math.sin(frame * 0.04) * 28;

  const cells = [
    { label: "Equity",        val: `$${fmt(10_000 + pnl)}`, pos: null  },
    { label: "Net P&L",       val: fmtSigned(pnl),           pos: true  },
    { label: "Realized P&L",  val: "+$240.00",               pos: true  },
    { label: "Win Rate",      val: "66.7%",                  pos: null  },
    { label: "Profit Factor", val: "2.14",                   pos: null  },
    { label: "Max Drawdown",  val: "−$48.20",                pos: false },
  ];

  return (
    <div style={{ background: DS.surface2, borderRadius: 14, boxShadow: DS.shadow, padding: 16, position: "relative" }}>
      <div style={{ position: "absolute", inset: 0, borderRadius: 14, background: "linear-gradient(180deg,rgba(255,255,255,.46) 0%,rgba(255,255,255,0) 44%)", pointerEvents: "none" }} />
      <div style={{ paddingBottom: 9, borderBottom: `1px solid ${DS.lineSoft}`, marginBottom: 11 }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 720, color: DS.ink, fontFamily: FONT }}>Analytics</h2>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 7 }}>
        {cells.map(({ label, val, pos }) => (
          <div key={label} style={{
            border: "1px solid rgba(255,255,255,.6)", borderRadius: 11, padding: 9,
            background: "linear-gradient(160deg,rgba(255,255,255,.72) 0%,rgba(244,249,255,.48) 100%)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,.64)",
          }}>
            <p style={{ margin: 0, fontSize: 10, color: DS.muted, fontFamily: FONT }}>{label}</p>
            <p style={{
              margin: "2px 0 0", fontWeight: 700, fontSize: 13,
              fontVariantNumeric: "tabular-nums", fontFamily: FONT,
              color: pos === null ? DS.ink : pos ? DS.success : DS.danger,
            }}>{val}</p>
          </div>
        ))}
      </div>
      {/* Mini equity curve */}
      <div style={{
        marginTop: 10, height: 76,
        background: "linear-gradient(180deg,rgba(255,255,255,.82) 0%,rgba(241,247,255,.62) 100%)",
        border: "1px solid rgba(255,255,255,.6)", borderRadius: 11, overflow: "hidden",
      }}>
        <svg width="100%" height="76" preserveAspectRatio="none">
          <defs>
            <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor={DS.success} stopOpacity={0.22} />
              <stop offset="100%" stopColor={DS.success} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <path
            d="M0 58 C40 54 80 40 130 32 C180 24 220 42 280 36 C340 30 380 22 440 16 C500 10 540 24 600 18 C660 12 700 20 760 14"
            fill="none" stroke={DS.success} strokeWidth={2} strokeLinecap="round" />
          <path
            d="M0 58 C40 54 80 40 130 32 C180 24 220 42 280 36 C340 30 380 22 440 16 C500 10 540 24 600 18 C660 12 700 20 760 14 L760 76 L0 76 Z"
            fill="url(#eqGrad)" />
        </svg>
      </div>
    </div>
  );
}

function CoachPanelMockup() {
  return (
    <div style={{ background: DS.surface2, borderRadius: 14, boxShadow: DS.shadow, padding: 16, position: "relative" }}>
      <div style={{ position: "absolute", inset: 0, borderRadius: 14, background: "linear-gradient(180deg,rgba(255,255,255,.46) 0%,rgba(255,255,255,0) 44%)", pointerEvents: "none" }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 9, borderBottom: `1px solid ${DS.lineSoft}`, marginBottom: 11 }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 720, color: DS.ink, fontFamily: FONT }}>AI Coach</h2>
        <span style={{ padding: "4px 10px", borderRadius: 999, background: "rgba(42,111,219,.1)", border: `1px solid rgba(42,111,219,.22)`, fontSize: 10, fontWeight: 700, color: DS.brand, fontFamily: FONT }}>GPT-4</span>
      </div>
      <div style={{
        background: "linear-gradient(180deg,rgba(255,255,255,.65) 0%,rgba(243,248,255,.46) 100%)",
        border: "1px solid rgba(255,255,255,.6)", borderRadius: 11, padding: 13,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <h4 style={{ margin: 0, fontSize: 13, fontWeight: 750, color: DS.ink, fontFamily: FONT }}>Strong Entry ↑</h4>
          <span style={{ fontSize: 11, fontWeight: 700, color: DS.success, fontFamily: FONT }}>Score 82/100</span>
        </div>
        <p style={{ margin: "0 0 10px", fontSize: 12, lineHeight: 1.48, color: "#334761", fontFamily: FONT }}>
          Your BTC long aligns with a breakout from a 4H consolidation zone. R:R of 2.1:1 is favorable given current volatility.
        </p>
        <p style={{ margin: "0 0 4px", fontSize: 11, fontWeight: 700, color: DS.ink, fontFamily: FONT }}>Suggestions:</p>
        <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11, color: "#334761", lineHeight: 1.55, fontFamily: FONT }}>
          <li>Consider trailing stop after +$200 unrealized</li>
          <li>Volume confirms the breakout — hold the trade</li>
        </ul>
      </div>
    </div>
  );
}

// ─── 7. Full App Mockup (1920 × 1080) ────────────────────────────────────────

function FullApp({ frame }: { frame: number }) {
  return (
    <div style={{ width: 1920, height: 1080, background: DS.bgBase, fontFamily: FONT, overflow: "hidden", position: "relative" }}>
      <HeroMockup frame={frame} />
      <div style={{
        display: "grid",
        gridTemplateColumns: "minmax(0,2fr) minmax(0,1fr)",
        gap: 14, padding: "14px 60px 14px",
        gridTemplateAreas: `"chart ticket" "positions positions" "analytics coach"`,
      }}>
        <div style={{ gridArea: "chart" }}>
          <ChartPanelMockup frame={frame} />
        </div>
        <div style={{ gridArea: "ticket" }}>
          <TicketPanelMockup />
        </div>
        <div style={{ gridArea: "positions" }}>
          <div style={{ background: DS.surface2, borderRadius: 14, boxShadow: DS.shadow, padding: 16, position: "relative" }}>
            <div style={{ position: "absolute", inset: 0, borderRadius: 14, background: "linear-gradient(180deg,rgba(255,255,255,.46) 0%,rgba(255,255,255,0) 44%)", pointerEvents: "none" }} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 9, borderBottom: `1px solid ${DS.lineSoft}`, marginBottom: 12 }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 720, color: DS.ink, fontFamily: FONT }}>Open Positions</h2>
              <span style={{ fontSize: 11, color: DS.muted, fontFamily: FONT }}>2 active</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,248px)", gap: 10 }}>
              <PositionCard frame={frame}       pair="BTC/USD" side="long" qty={0.10} entry={43_500} tp={44_500} sl={42_800} />
              <PositionCard frame={frame} phaseOffset={44} pair="ETH/USD" side="long" qty={0.50} entry={2_300}  tp={2_450}  sl={2_180}  />
            </div>
          </div>
        </div>
        <div style={{ gridArea: "analytics" }}>
          <AnalyticsPanelMockup frame={frame} />
        </div>
        <div style={{ gridArea: "coach" }}>
          <CoachPanelMockup />
        </div>
      </div>
    </div>
  );
}

// ─── 8. Browser Frame ─────────────────────────────────────────────────────────

function BrowserFrame({ radius, children }: { radius: number; children: React.ReactNode }) {
  return (
    <div style={{
      borderRadius: radius, overflow: "hidden",
      background: "#252535",
      boxShadow: "0 48px 120px rgba(0,0,0,.72),0 0 0 1px rgba(255,255,255,.07)",
    }}>
      {/* Chrome bar */}
      <div style={{
        height: 40, background: "linear-gradient(180deg,#363648 0%,#2c2c3e 100%)",
        borderBottom: "1px solid rgba(0,0,0,.32)",
        display: "flex", alignItems: "center", padding: "0 16px", gap: 12, flexShrink: 0,
      }}>
        {/* Traffic lights */}
        <div style={{ display: "flex", gap: 6 }}>
          {["#ff5f57","#febc2e","#28c840"].map((c,i) => (
            <div key={i} style={{ width: 11, height: 11, borderRadius: "50%", background: c, boxShadow: `0 0 5px ${c}60` }} />
          ))}
        </div>
        {/* URL bar */}
        <div style={{
          flex: 1, maxWidth: 440, height: 26,
          background: "rgba(0,0,0,.3)", borderRadius: 7,
          display: "flex", alignItems: "center", padding: "0 11px",
          border: "1px solid rgba(255,255,255,.09)",
          gap: 6,
        }}>
          <span style={{ fontSize: 10, opacity: .5, color: "#8af" }}>🔒</span>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,.55)", fontFamily: FONT }}>
            app.marketlivetrainer.com
          </span>
        </div>
      </div>
      {children}
    </div>
  );
}

// ─── 9. Floating Callout Label ────────────────────────────────────────────────

interface CalloutProps {
  x: number; y: number;
  label: string; sub?: string;
  color?: string;
  frame: number; showAt: number; hideAt: number;
  align?: "left" | "right" | "center";
}
function Callout({ x, y, label, sub, color = DS.brand, frame, showAt, hideAt, align = "left" }: CalloutProps) {
  const progress = easeIn(frame, showAt, showAt + 18);
  const fadeOut  = frame > hideAt - 12 ? easeOut(frame, hideAt - 12, hideAt) : 1;
  const opacity  = progress * fadeOut;
  const slideY   = interpolate(frame, [showAt, showAt + 18], [10, 0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  if (opacity < 0.01) return null;
  return (
    <div style={{
      position: "absolute", left: x, top: y,
      opacity, transform: `translateY(${slideY}px)`,
      background: "rgba(8,14,28,.82)", backdropFilter: "blur(12px)",
      border: `1px solid ${color}44`,
      borderRadius: 12, padding: "9px 16px",
      textAlign: align,
      boxShadow: `0 8px 28px rgba(0,0,0,.4), 0 0 0 1px ${color}22`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 7, height: 7, borderRadius: "50%", background: color, boxShadow: `0 0 8px ${color}` }} />
        <span style={{ color: "#fff", fontSize: 14, fontWeight: 700, letterSpacing: "-.01em", fontFamily: FONT }}>{label}</span>
      </div>
      {sub && (
        <p style={{ margin: "3px 0 0 15px", fontSize: 11, color: "rgba(255,255,255,.5)", fontFamily: FONT }}>{sub}</p>
      )}
    </div>
  );
}

// ─── 10. Main Composition ────────────────────────────────────────────────────

export const AppShowcase = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // ── Phase detection ─────────────────────────────────────────────────────────
  // Phase boundaries
  const BROWSER_APPEAR  = 0;
  const BROWSER_END     = 80;
  const FULLSCREEN_START= 140;
  const FULLSCREEN_END  = 220;
  const OVERVIEW_START  = 220;
  const OVERVIEW_END    = 310;
  const HERO_START      = 310;
  const HERO_END        = 410;
  const CHART_START     = 410;
  const CHART_END       = 510;
  const TICKET_START    = 510;
  const TICKET_END      = 600;
  const ANALYTICS_START = 600;
  const ANALYTICS_END   = 670;
  const PULLBACK_START  = 670;
  const PULLBACK_END    = 730;
  const OUTRO_START     = 730;

  // ── Browser frame ────────────────────────────────────────────────────────────
  const browserScale  = spring({ fps, frame, config: { damping: 22, stiffness: 70, mass: 0.9 }, from: 0.82, to: 1.0 });
  const browserOpacity= easeIn(frame, 0, 28);

  // Subtle float (only during browser phase)
  const floatY = frame < FULLSCREEN_END
    ? Math.sin(frame * 0.055) * 6
    : 0;

  // ── Browser → fullscreen transition ─────────────────────────────────────────
  // We transition the "wrapper" that holds the browser. After fullscreen, the
  // browser chrome fades and the inner app fills the video.
  const chromeOpacity   = interpolate(frame, [FULLSCREEN_START, FULLSCREEN_END - 20], [1, 0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic),
  });

  // The outer box that contains the browser / fullscreen app
  // – in browser mode: a centred, smaller box
  // – in fullscreen mode: fills the video
  const BOX_W_BROWSER = 1440;
  const BOX_H_BROWSER = 870;

  const boxW = interpolate(frame, [FULLSCREEN_START, FULLSCREEN_END], [BOX_W_BROWSER, 1920], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic),
  });
  const boxH = interpolate(frame, [FULLSCREEN_START, FULLSCREEN_END], [BOX_H_BROWSER, 1080], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic),
  });
  const boxX = (1920 - boxW) / 2;
  const boxY = (1080 - boxH) / 2;
  const boxRadius = interpolate(frame, [FULLSCREEN_START, FULLSCREEN_END], [18, 0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

  // ── Scale-from-centre camera (fullscreen phase only) ─────────────────────────
  // Smoothly interpolates between scale values. No panning — transform-origin is
  // always 50% 50% so the app always expands from the video centre.

  function camAt(f: number): Camera {
    if (f < FULLSCREEN_END) return CAM.full;
    if (f < OVERVIEW_END)   return CAM.full;
    if (f < HERO_END)       return lerpCam(CAM.full,      CAM.hero,      easeIn(f, OVERVIEW_END,   HERO_END - 30));
    if (f < CHART_END)      return lerpCam(CAM.hero,      CAM.chart,     easeIn(f, HERO_END,       CHART_END - 30));
    if (f < TICKET_END)     return lerpCam(CAM.chart,     CAM.ticket,    easeIn(f, CHART_END,      TICKET_END - 30));
    if (f < ANALYTICS_END)  return lerpCam(CAM.ticket,    CAM.analytics, easeIn(f, TICKET_END,     ANALYTICS_END - 20));
    if (f < PULLBACK_END)   return lerpCam(CAM.analytics, CAM.full,      easeIn(f, PULLBACK_START, PULLBACK_END));
    return CAM.full;
  }

  const cam = camAt(frame);
  const isFullscreenPhase = frame >= FULLSCREEN_END;

  // Browser phase: scale app to fit inside the browser box (origin top-left).
  // Fullscreen phase: pure scale from centre — no translation needed.
  const appScaleForBrowser = BOX_W_BROWSER / 1920; // ≈ 0.75
  const appTransformOrigin = isFullscreenPhase ? "50% 50%" : "0 0";
  const appTransform = isFullscreenPhase
    ? cameraToTransform(cam)
    : `scale(${appScaleForBrowser})`;

  // ── Outro ────────────────────────────────────────────────────────────────────
  const outroProgress = easeIn(frame, OUTRO_START, OUTRO_START + 40);
  const outroSub1     = easeIn(frame, OUTRO_START + 20, OUTRO_START + 46);
  const outroSub2     = easeIn(frame, OUTRO_START + 36, OUTRO_START + 58);

  // ── Fullscreen click pulse ────────────────────────────────────────────────────
  const clickPulse = interpolate(
    frame, [FULLSCREEN_START - 18, FULLSCREEN_START - 8, FULLSCREEN_START],
    [0, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // ── Progress bar ────────────────────────────────────────────────────────────
  const progress = frame / durationInFrames;

  return (
    <AbsoluteFill style={{ background: "#09090f", overflow: "hidden" }}>

      {/* ── Radial ambient glow behind browser ─────────────────────────────── */}
      <div style={{
        position: "absolute",
        left: 960 - 600, top: 540 - 400, width: 1200, height: 800,
        borderRadius: "50%",
        background: "radial-gradient(ellipse at center, rgba(42,111,219,.18) 0%, transparent 70%)",
        opacity: interpolate(frame, [0, 60, FULLSCREEN_END, FULLSCREEN_END + 30], [0, 1, 1, 0], {
          extrapolateLeft: "clamp", extrapolateRight: "clamp",
        }),
      }} />

      {/* ── Browser / App container ─────────────────────────────────────────── */}
      <div style={{
        position: "absolute",
        left: boxX, top: boxY + floatY,
        width: boxW, height: boxH,
        opacity: browserOpacity,
        transform: frame < FULLSCREEN_START ? `scale(${browserScale})` : undefined,
        transformOrigin: "50% 50%",
        willChange: "transform",
        overflow: "hidden",
        borderRadius: boxRadius,
        boxShadow: frame < FULLSCREEN_END
          ? "0 60px 140px rgba(0,0,0,.8),0 0 0 1px rgba(255,255,255,.08)"
          : "none",
      }}>

        {/* Browser chrome (fades out during fullscreen transition) */}
        <div style={{ opacity: chromeOpacity, pointerEvents: "none" }}>
          <div style={{
            height: 40, background: "linear-gradient(180deg,#363648 0%,#2c2c3e 100%)",
            borderBottom: "1px solid rgba(0,0,0,.32)",
            display: "flex", alignItems: "center", padding: "0 16px", gap: 12,
          }}>
            <div style={{ display: "flex", gap: 6 }}>
              {["#ff5f57","#febc2e","#28c840"].map((c,i) => (
                <div key={i} style={{ width: 11, height: 11, borderRadius: "50%", background: c, boxShadow: `0 0 5px ${c}60` }} />
              ))}
            </div>
            <div style={{
              flex: 1, maxWidth: 420, height: 25,
              background: "rgba(0,0,0,.3)", borderRadius: 7,
              display: "flex", alignItems: "center", padding: "0 11px",
              border: "1px solid rgba(255,255,255,.08)",
              gap: 6,
            }}>
              <span style={{ fontSize: 10, opacity: .45, color: "#8af" }}>🔒</span>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,.55)", fontFamily: FONT }}>
                app.marketlivetrainer.com
              </span>
            </div>
            {/* Fullscreen button (pulse just before transition) */}
            <div style={{
              marginLeft: "auto", width: 22, height: 22,
              borderRadius: 5, background: `rgba(255,255,255,${0.06 + clickPulse * 0.22})`,
              display: "flex", alignItems: "center", justifyContent: "center",
              border: `1px solid rgba(255,255,255,${0.08 + clickPulse * 0.3})`,
              boxShadow: `0 0 ${clickPulse * 14}px rgba(88,166,255,${clickPulse * 0.7})`,
            }}>
              <span style={{ fontSize: 9, color: `rgba(255,255,255,${0.4 + clickPulse * 0.5})` }}>⛶</span>
            </div>
          </div>
        </div>

        {/* App content */}
        <div style={{
          position: "absolute",
          top: frame < FULLSCREEN_END ? 40 : 0, // compensate for chrome height
          left: 0,
          width: 1920, height: 1080,
          transformOrigin: appTransformOrigin,
          transform: appTransform,
          willChange: "transform",
        }}>
          <FullApp frame={frame} />
        </div>
      </div>

      {/* ── Floating Callouts ───────────────────────────────────────────────── */}

      {/* Overview */}
      <Callout frame={frame} showAt={OVERVIEW_START + 20} hideAt={OVERVIEW_END}
        x={80} y={460}
        label="Market Live Trainer"
        sub="Full-stack trading simulator — Coinbase data · Paper trades · AI"
        color="#58a6ff"
      />

      {/* Hero section */}
      <Callout frame={frame} showAt={HERO_START + 30} hideAt={HERO_END}
        x={80} y={130}
        label="Live Market Ticker"
        sub="Real-time Coinbase prices for 10+ pairs"
        color={DS.brand}
      />
      <Callout frame={frame} showAt={HERO_START + 48} hideAt={HERO_END}
        x={1100} y={80}
        label="Session Summary"
        sub="Equity, P&L, win rate — always visible"
        color={DS.success}
      />

      {/* Chart section */}
      <Callout frame={frame} showAt={CHART_START + 25} hideAt={CHART_END}
        x={80} y={200}
        label="Candlestick Chart"
        sub="70+ candles · 6 timeframes · live updates"
        color={DS.brand}
      />
      <Callout frame={frame} showAt={CHART_START + 44} hideAt={CHART_END}
        x={80} y={800}
        label="Market Strip"
        sub="5 pairs at a glance"
        color="#e3b341"
      />

      {/* Ticket / Positions */}
      <Callout frame={frame} showAt={TICKET_START + 20} hideAt={TICKET_END}
        x={1080} y={200}
        label="Order Ticket"
        sub="Market & limit · TP/SL · one-click execution"
        color={DS.success}
      />
      <Callout frame={frame} showAt={TICKET_START + 42} hideAt={TICKET_END}
        x={80} y={760}
        label="Open Positions"
        sub="Live unrealized P&L · drag-to-set brackets"
        color={DS.brand}
      />

      {/* Analytics */}
      <Callout frame={frame} showAt={ANALYTICS_START + 20} hideAt={ANALYTICS_END}
        x={80} y={200}
        label="Analytics Dashboard"
        sub="Equity curve · realized P&L · win rate · drawdown"
        color={DS.success}
      />
      <Callout frame={frame} showAt={ANALYTICS_START + 40} hideAt={ANALYTICS_END}
        x={1080} y={350}
        label="AI Coach"
        sub="GPT-4 trade review & improvement tips"
        color="#a371f7"
      />

      {/* ── Outro card ──────────────────────────────────────────────────────── */}
      {frame >= OUTRO_START && (
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(135deg,#070b14 0%,#0d1320 100%)",
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          gap: 0,
        }}>
          {/* Ambient light */}
          <div style={{
            position: "absolute",
            width: 900, height: 600,
            borderRadius: "50%",
            background: "radial-gradient(ellipse,rgba(42,111,219,.2) 0%,transparent 70%)",
            top: "50%", left: "50%", transform: "translate(-50%,-50%)",
          }} />

          <div style={{ opacity: outroProgress, transform: `translateY(${interpolate(outroProgress, [0,1],[24,0])}px)`, textAlign: "center" }}>
            <p style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 700, letterSpacing: ".14em", textTransform: "uppercase", color: "rgba(88,166,255,.8)", fontFamily: FONT }}>
              Claude Code Challenge MVP
            </p>
            <h1 style={{ margin: 0, fontSize: 72, fontWeight: 820, letterSpacing: "-.03em", color: "#fff", fontFamily: FONT, lineHeight: 1.0 }}>
              Market Live Trainer
            </h1>
          </div>

          <div style={{ opacity: outroSub1, transform: `translateY(${interpolate(outroSub1, [0,1],[16,0])}px)`, marginTop: 22 }}>
            <p style={{ margin: 0, fontSize: 22, color: "rgba(255,255,255,.55)", fontFamily: FONT, letterSpacing: "-.01em" }}>
              Live Coinbase candles · Paper trading · AI coach
            </p>
          </div>

          <div style={{ opacity: outroSub2, transform: `translateY(${interpolate(outroSub2, [0,1],[12,0])}px)`, marginTop: 36, display: "flex", gap: 12 }}>
            {["Multi-pair","6 Timeframes","GPT-4 Coach","TP / SL Brackets","Equity Curve"].map(tag => (
              <div key={tag} style={{
                padding: "8px 18px", borderRadius: 999,
                background: "rgba(42,111,219,.12)", border: "1px solid rgba(42,111,219,.28)",
                fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,.7)",
                fontFamily: FONT,
              }}>{tag}</div>
            ))}
          </div>
        </div>
      )}

      {/* ── Progress bar ────────────────────────────────────────────────────── */}
      {frame < OUTRO_START && (
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0, height: 3,
          background: "rgba(255,255,255,.06)",
        }}>
          <div style={{
            width: `${progress * 100}%`, height: "100%",
            background: "linear-gradient(90deg,#2a6fdb 0%,#1b8a63 50%,#58a6ff 100%)",
            borderRadius: "0 2px 2px 0",
          }} />
        </div>
      )}
    </AbsoluteFill>
  );
};
