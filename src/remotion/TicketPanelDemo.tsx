/**
 * TicketPanelDemo.tsx
 * Remotion composition: order-ticket panel — scripted form-fill animation.
 *
 * 300 frames @ 30 fps = 10 s
 *
 * Timeline:
 *   0–32    panel + elements entrance (staggered springs)
 *  50–75    type Quantity    "0.010"
 *  83–108   type Limit price "97,450.00"
 * 116–141   type Take-profit "99,200.00"
 * 149–174   type Stop-loss   "96,800.00"
 * 182–196   Buy button press (brightens then returns)
 * 196       form resets to empty
 * 198–212   new pending order fades in
 * 212–300   settled state
 *
 * "Limit" tab is active by default.
 * PnL shown once TP/SL fields are non-empty:
 *   TP: (99200 − 97450) × 0.010 = +$17.50
 *   SL: (96800 − 97450) × 0.010 = −$6.50
 */

import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from "remotion";

// ─── Design tokens ────────────────────────────────────────────────────────────

const FONT =
  '"SF Pro Text", -apple-system, BlinkMacSystemFont, "Helvetica Neue", "Segoe UI", sans-serif';
const SUCCESS = "#1b8a63";
const DANGER  = "#bb3b51";

// ─── Background ───────────────────────────────────────────────────────────────

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

// ─── Typing helper ────────────────────────────────────────────────────────────

function typeText(text: string, startF: number, endF: number, frame: number): string {
  const p = interpolate(frame, [startF, endF], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });
  return text.slice(0, Math.ceil(p * text.length));
}

// ─── Panel geometry ───────────────────────────────────────────────────────────
// Limit mode adds a "Limit price" field → 4 input rows instead of 3.
//
// Form content (marginTop:12, grid gap:10):
//   tabs(41) + gap(10) + qty(59) + gap(10) + limitPrice(59)
//   + gap(10) + brackets(59) + (gap+marginTop)(12) + buttons(40) = 300
//   + marginTop:12 = 312
//
// Pending section (marginTop:14):
//   h3(17) + mb(10) + listBox(border1+pad8+content92+pad8+border1) = 151
//
// Total inner: 312 + 151 = 463   Panel: 16 + 463 + 16 = 495 → PH=496

const PW      = 440;
const PH      = 496;
const PX      = (1920 - PW) / 2;   // 740
const PY      = (1080 - PH) / 2;   // 292
const PAD     = 16;
const INNER_W = PW - PAD * 2;      // 408

// Tabs geometry:
//   root inner width = INNER_W − 2×4(pad) = 400
//   tabW = (400 − 4(gap)) / 2 = 198
//   tabH = 9(pad) + ⌈12×1.2⌉(text15) + 9(pad) = 33
const TAB_W = (INNER_W - 8 - 4) / 2; // 198
const TAB_H = 9 + 15 + 9;            // 33
// "Limit" is tab index 1 → indicator left = 4(pad) + 198(tabW) + 4(gap) = 206
const LIMIT_INDICATOR_LEFT = 4 + TAB_W + 4; // 206

// ─── Styled primitives ────────────────────────────────────────────────────────

function Input({
  value,
  paddingRight = 11,
  placeholder = "",
}: {
  value: string;
  paddingRight?: number;
  placeholder?: string;
}) {
  return (
    <div style={{
      border:             "1px solid rgba(141,161,189,0.54)",
      borderRadius:       8,
      padding:            `10px ${paddingRight}px 10px 11px`,
      fontSize:           14,
      color:              value ? "#17253d" : "rgba(23,37,61,0.35)",
      background:         "#ffffff",
      fontFamily:         FONT,
      fontVariantNumeric: "tabular-nums",
      lineHeight:         1.2,
      boxSizing:          "border-box" as const,
      width:              "100%",
      minHeight:          39,
    }}>
      {value || placeholder}
    </div>
  );
}

function FieldLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gap: 5 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: "#60718b", fontFamily: FONT }}>
        {label}
      </span>
      {children}
    </div>
  );
}

// ─── Main composition ─────────────────────────────────────────────────────────

const SUBMIT_FRAME     = 130;
const ORDER_FADE_START = 132;
const ORDER_FADE_END   = 148;

const TP_PNL = "+$17.50";  // (99200 − 97450) × 0.010
const SL_PNL = "−$6.50";  // (96800 − 97450) × 0.010

export const TicketPanelDemo = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Panel entrance
  const entrance = spring({
    fps, frame,
    config: { damping: 22, stiffness: 55, mass: 1.1 },
    from: 0, to: 1,
  });
  const opacity = interpolate(frame, [0, 18], [0, 1], { extrapolateRight: "clamp" });

  // Staggered element entrance springs
  function spr(delay: number) {
    return spring({
      fps, frame: frame - delay,
      config: { damping: 22, stiffness: 90, mass: 0.7 },
      from: 0, to: 1,
    });
  }
  const tabsIn     = spr(6);
  const qtyIn      = spr(11);
  const priceIn    = spr(14);
  const bracketsIn = spr(18);
  const buttonsIn  = spr(23);
  const pendingIn  = spr(30);

  // Submitted state
  const submitted = frame >= SUBMIT_FRAME;

  // Typed values (reset to "" after submission)
  const qtyText   = submitted ? "" : typeText("0.010",      12,  32,  frame);
  const priceText = submitted ? "" : typeText("97,450.00",  36,  60,  frame);
  const tpText    = submitted ? "" : typeText("99,200.00",  64,  88,  frame);
  const slText    = submitted ? "" : typeText("96,800.00",  92,  116, frame);

  // PnL fades in progressively as the field is being typed
  const tpPnlOpacity = submitted ? 0 : interpolate(frame, [64, 88],   [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const slPnlOpacity = submitted ? 0 : interpolate(frame, [92, 116],  [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Buy button press strength (ramp up → hold → ramp down)
  const btnPress = interpolate(
    frame, [118, 124, 127, SUBMIT_FRAME],
    [0,    1,   1,   0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const buyBgAlpha     = 0.08 + btnPress * 0.16;
  const buyBorderAlpha = 0.32 + btnPress * 0.24;

  // New pending order fade-in
  const orderOpacity = interpolate(
    frame, [ORDER_FADE_START, ORDER_FADE_END],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <AbsoluteFill style={{ background: BG, overflow: "hidden", fontFamily: FONT }}>

      {/* ── Ambient blobs ── */}
      <Blob cx={200}  cy={180}  r={260} color="rgba(209,207,247,0.55)" opacity={1} frame={frame} speedX={0.018} speedY={0.012} phase={0} />
      <Blob cx={1720} cy={200}  r={220} color="rgba(184,217,243,0.60)" opacity={1} frame={frame} speedX={0.014} speedY={0.020} phase={2.1} />
      <Blob cx={960}  cy={900}  r={300} color="rgba(220,215,250,0.40)" opacity={1} frame={frame} speedX={0.010} speedY={0.008} phase={1.0} />
      <Blob cx={400}  cy={820}  r={180} color="rgba(184,217,243,0.35)" opacity={1} frame={frame} speedX={0.022} speedY={0.016} phase={3.5} />
      <Blob cx={1580} cy={780}  r={200} color="rgba(209,207,247,0.38)" opacity={1} frame={frame} speedX={0.016} speedY={0.024} phase={5.2} />

      {/* ── Panel (section.panel.ticket-panel) ── */}
      <div style={{
        position:     "absolute",
        left:         PX,
        top:          PY,
        width:        PW,
        height:       PH,
        borderRadius: 14,
        background:   "#ffffff",
        boxShadow:    "0 4px 14px rgba(32,52,84,0.08)",
        padding:      PAD,
        boxSizing:    "border-box" as const,
        overflow:     "hidden",
        opacity,
        transform:    `translateY(${(1 - entrance) * 36}px) scale(1.44)`,
        transformOrigin: "center center",
      }}>

        {/* Top gloss */}
        <div style={{
          position: "absolute", top: 0, right: 0, bottom: 0, left: 0,
          borderRadius: 14,
          background: "linear-gradient(180deg, rgba(255,255,255,0.46) 0%, rgba(255,255,255,0) 44%)",
          pointerEvents: "none",
        }} />

        {/* ── form.ticketForm — marginTop:12, display:grid, gap:10 ── */}
        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>

          {/* ticketTabsRow */}
          <div style={{
            display: "grid", gap: 6,
            opacity: tabsIn, transform: `translateY(${(1 - tabsIn) * 8}px)`,
          }}>
            {/* Tabs root */}
            <div style={{
              position: "relative",
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: 4, padding: 4, borderRadius: 10, background: "#f8fbff",
            }}>
              {/* .activeIndicator — under "Limit" tab (index 1) */}
              <div style={{
                position:     "absolute",
                left:         LIMIT_INDICATOR_LEFT, // 206
                top:          4,
                width:        TAB_W,  // 198
                height:       TAB_H,  // 33
                borderRadius: 8,
                background:   "#eaf1fb",
                pointerEvents: "none",
              }} />
              {/* Market tab (inactive) */}
              <div style={{
                position: "relative", zIndex: 1, borderRadius: 8,
                fontSize: 12, fontWeight: 600, padding: "9px 10px",
                color: "#63748d", textAlign: "center", fontFamily: FONT,
              }}>Market</div>
              {/* Limit tab (active) */}
              <div style={{
                position: "relative", zIndex: 1, borderRadius: 8,
                fontSize: 12, fontWeight: 600, padding: "9px 10px",
                color: "#1f4f96", textAlign: "center", fontFamily: FONT,
              }}>Limit</div>
            </div>
          </div>

          {/* Quantity */}
          <div style={{ opacity: qtyIn, transform: `translateY(${(1 - qtyIn) * 8}px)` }}>
            <FieldLabel label="Quantity">
              <Input value={qtyText} placeholder="0.000" />
            </FieldLabel>
          </div>

          {/* Limit price (visible only in limit mode) */}
          <div style={{ opacity: priceIn, transform: `translateY(${(1 - priceIn) * 8}px)` }}>
            <FieldLabel label="Limit price">
              <Input value={priceText} placeholder="0.00" />
            </FieldLabel>
          </div>

          {/* ticketBracketsRow — grid 2-col, gap:10 */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10,
            opacity: bracketsIn, transform: `translateY(${(1 - bracketsIn) * 8}px)`,
          }}>
            {/* Take-profit */}
            <FieldLabel label="Take-profit">
              <div style={{ position: "relative" }}>
                <Input value={tpText} placeholder="0.00" paddingRight={tpPnlOpacity > 0 ? 76 : 11} />
                <span style={{
                  position: "absolute", top: "50%", right: 12,
                  transform: "translateY(-50%)",
                  fontSize: 12, fontWeight: 700,
                  fontVariantNumeric: "tabular-nums", letterSpacing: "0.01em",
                  color: SUCCESS, fontFamily: FONT, pointerEvents: "none",
                  opacity: tpPnlOpacity,
                }}>
                  {TP_PNL}
                </span>
              </div>
            </FieldLabel>

            {/* Stop-loss */}
            <FieldLabel label="Stop-loss">
              <div style={{ position: "relative" }}>
                <Input value={slText} placeholder="0.00" paddingRight={slPnlOpacity > 0 ? 76 : 11} />
                <span style={{
                  position: "absolute", top: "50%", right: 12,
                  transform: "translateY(-50%)",
                  fontSize: 12, fontWeight: 700,
                  fontVariantNumeric: "tabular-nums", letterSpacing: "0.01em",
                  color: DANGER, fontFamily: FONT, pointerEvents: "none",
                  opacity: slPnlOpacity,
                }}>
                  {SL_PNL}
                </span>
              </div>
            </FieldLabel>
          </div>

          {/* ticketSideActions — grid 2-col, gap:10, marginTop:2 */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: 10, marginTop: 2,
            opacity: buttonsIn, transform: `translateY(${(1 - buttonsIn) * 8}px)`,
          }}>
            {/* Buy/Long — brightens on press */}
            <div style={{
              minHeight:     40, borderRadius: 8,
              border:        `1px solid rgba(16,129,81,${buyBorderAlpha.toFixed(3)})`,
              background:    `rgba(16,129,81,${buyBgAlpha.toFixed(3)})`,
              color:         SUCCESS,
              fontSize:      12, fontWeight: 600, fontFamily: FONT,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              Buy / Long
            </div>
            {/* Sell/Short */}
            <div style={{
              minHeight:     40, borderRadius: 8,
              border:        "1px solid rgba(191,35,61,0.34)",
              background:    "rgba(191,35,61,0.08)",
              color:         DANGER,
              fontSize:      12, fontWeight: 600, fontFamily: FONT,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              Sell / Short
            </div>
          </div>
        </div>

        {/* ── PendingOrdersList — marginTop:14 ── */}
        <div style={{
          marginTop: 14,
          opacity: pendingIn, transform: `translateY(${(1 - pendingIn) * 8}px)`,
        }}>
          {/* h3 — .panel h3 */}
          <h3 style={{
            margin: "0 0 10px", fontSize: 14, fontWeight: 600,
            color: "#334761", fontFamily: FONT, lineHeight: 1.2,
          }}>
            Pending Limit Orders
          </h3>

          {/* .listBox */}
          <div style={{
            border: "1px solid rgba(154,173,203,0.5)",
            borderRadius: 10, padding: 8,
            background: "#f9fbff", fontSize: 13, fontFamily: FONT,
            minHeight: 92, boxSizing: "border-box" as const,
          }}>

            {/* New order fades in after submit — on top */}
            {submitted && (
              <div style={{
                opacity: orderOpacity,
                transform: `translateY(${(1 - orderOpacity) * 6}px)`,
                borderBottom: "1px solid rgba(154,173,203,0.35)",
              }}>
                <div style={{
                  display: "flex", justifyContent: "space-between",
                  alignItems: "center", gap: 10, padding: "9px 2px",
                }}>
                  <div>
                    BTC/USDT Buy 0.010 @ $97,450.00
                    <br />
                    <small style={{ color: "#64758d" }}>SL: $96,800.00 | TP: $99,200.00</small>
                  </div>
                  <div style={{
                    border: "1px solid rgba(134,156,190,0.5)",
                    background: "#ffffff", color: "#2b4567",
                    borderRadius: 8, padding: "7px 10px",
                    fontWeight: 600, fontSize: 12, flexShrink: 0, fontFamily: FONT,
                  }}>
                    Cancel
                  </div>
                </div>
              </div>
            )}

            {/* Pre-existing order — always visible */}
            <div style={{
              display: "flex", justifyContent: "space-between",
              alignItems: "center", gap: 10, padding: "9px 2px",
            }}>
              <div>
                BTC/USDT Buy 0.005 @ $96,100.00
                <br />
                <small style={{ color: "#64758d" }}>SL: $95,400.00 | TP: $98,500.00</small>
              </div>
              <div style={{
                border: "1px solid rgba(134,156,190,0.5)",
                background: "#ffffff", color: "#2b4567",
                borderRadius: 8, padding: "7px 10px",
                fontWeight: 600, fontSize: 12, flexShrink: 0, fontFamily: FONT,
              }}>
                Cancel
              </div>
            </div>
          </div>
        </div>

      </div>
    </AbsoluteFill>
  );
};
