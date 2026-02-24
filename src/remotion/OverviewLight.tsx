import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";

const FONT =
  '"Outfit", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const MONO =
  '"JetBrains Mono", "SFMono-Regular", Menlo, Monaco, Consolas, monospace';

const INK = "#13213e";
const MUTED = "#62789f";
const LINE_SOFT = "rgba(117, 146, 194, 0.2)";
const LINE_STRONG = "rgba(117, 146, 194, 0.32)";
const SURFACE_1 = "rgba(255, 255, 255, 0.78)";
const SURFACE_2 = "rgba(255, 255, 255, 0.92)";
const BRAND = "#2563eb";
const SUCCESS = "#12a36d";
const DANGER = "#bb3b51";

const BG = [
  "radial-gradient(120% 90% at 0% 0%, rgba(37, 99, 235, 0.16) 0%, rgba(37, 99, 235, 0) 52%)",
  "radial-gradient(120% 90% at 100% 0%, rgba(16, 185, 129, 0.1) 0%, rgba(16, 185, 129, 0) 56%)",
  "linear-gradient(180deg, #eaf1ff 0%, #f3f7ff 58%)",
].join(", ");

const DURATION = 720;
const WORLD_H = 1680;

const STAGE = {
  chart: [90, 220],
  ticket: [220, 360],
  open: [360, 500],
  closed: [500, 570],
  score: [570, 660],
} as const;

type Cam = { x: number; y: number; scale: number };

type ScoreId = "you" | "mason" | "aria" | "kei";

const SCORE_ROWS: Array<{ id: ScoreId; name: string; base: number; target: number }> = [
  { id: "mason", name: "Bill Gates", base: -217.89, target: -217.89 },
  { id: "aria", name: "Elon Musk", base: -490.25, target: -490.25 },
  { id: "kei", name: "Warren Buffett", base: -627.42, target: -627.42 },
  { id: "you", name: "Ievgen Ignatov", base: -204.55, target: 14.55 },
];

const ORDER_0: ScoreId[] = ["you", "mason", "aria", "kei"];
const ORDER_1: ScoreId[] = ["mason", "you", "aria", "kei"];
const ORDER_2: ScoreId[] = ["you", "mason", "aria", "kei"];

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

function ease(frame: number, start: number, end: number) {
  return Easing.inOut(Easing.cubic)(clamp01((frame - start) / Math.max(1, end - start)));
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function fmt(n: number, dp = 2) {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  });
}

function fmtPnl(v: number) {
  const sign = v >= 0 ? "+" : "-";
  return `${sign}$${Math.abs(v).toFixed(2)}`;
}

function fmtSigned(v: number) {
  const sign = v >= 0 ? "+" : "-";
  return `${sign}$${Math.abs(v).toFixed(2)}`;
}

function stageLabel(frame: number) {
  if (frame < STAGE.chart[0]) return "Overview";
  if (frame < STAGE.chart[1]) return "Chart · Price movement";
  if (frame < STAGE.ticket[1]) return "Ticket Panel · Limit order creation";
  if (frame < STAGE.open[1]) return "Open Positions · Mark + P&L live";
  if (frame < STAGE.closed[1]) return "Closed Trades · Position closed";
  if (frame < STAGE.score[1]) return "Scoreboard · Climbing to first place";
  return "Overview";
}

function cameraAt(frame: number): Cam {
  const full: Cam = { x: 960, y: 540, scale: 1 };
  const chart: Cam = { x: 646, y: 500, scale: 1.33 };
  const ticket: Cam = { x: 1550, y: 500, scale: 1.67 };
  const open: Cam = { x: 960, y: 915, scale: 1.45 };
  const closed: Cam = { x: 960, y: 1145, scale: 1.52 };
  const score: Cam = { x: 1510, y: 180, scale: 1.9 };

  const keys: Array<{ f: number; cam: Cam }> = [
    { f: 0, cam: full },
    { f: STAGE.chart[0], cam: full },
    { f: 120, cam: chart },
    { f: STAGE.chart[1], cam: chart },
    { f: 250, cam: ticket },
    { f: STAGE.ticket[1], cam: ticket },
    { f: 390, cam: open },
    { f: STAGE.open[1], cam: open },
    { f: 520, cam: closed },
    { f: STAGE.closed[1], cam: closed },
    { f: 590, cam: score },
    { f: STAGE.score[1], cam: score },
    { f: DURATION, cam: full },
  ];

  if (frame <= keys[0]!.f) return keys[0]!.cam;
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i]!;
    const b = keys[i + 1]!;
    if (frame <= b.f) {
      const t = ease(frame, a.f, b.f);
      return {
        x: lerp(a.cam.x, b.cam.x, t),
        y: lerp(a.cam.y, b.cam.y, t),
        scale: lerp(a.cam.scale, b.cam.scale, t),
      };
    }
  }
  return keys[keys.length - 1]!.cam;
}

function Panel({
  x,
  y,
  w,
  h,
  title,
  children,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: w,
        height: h,
        borderRadius: 14,
        border: `1px solid ${LINE_STRONG}`,
        background:
          "linear-gradient(160deg, rgba(255, 255, 255, 0.86) 0%, rgba(246, 251, 255, 0.74) 100%)",
        boxShadow: "0 12px 34px rgba(33, 61, 118, 0.12)",
        padding: 16,
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: 14,
          background:
            "linear-gradient(180deg, rgba(255, 255, 255, 0.72) 0%, rgba(255, 255, 255, 0) 46%)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          paddingBottom: 8,
          borderBottom: `1px solid ${LINE_SOFT}`,
        }}
      >
        <h2
          style={{
            margin: 0,
            color: MUTED,
            fontFamily: MONO,
            fontSize: 18,
            fontWeight: 600,
            letterSpacing: "-0.02em",
          }}
        >
          {title}
        </h2>
      </div>
      <div style={{ marginTop: 10 }}>{children}</div>
    </section>
  );
}

function HeroHeader({ frame }: { frame: number }) {
  const tickerX = -((frame * 2.2) % 1500);
  return (
    <section
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: 1920,
        padding: "24px 100px 70px",
        border: `1px solid ${LINE_STRONG}`,
        borderBottom: 0,
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: "-38%",
          right: "-8%",
          width: "52%",
          height: "180%",
          transform: "rotate(14deg)",
          background:
            "linear-gradient(180deg, rgba(255, 255, 255, 0.16) 0%, rgba(255, 255, 255, 0) 68%)",
          pointerEvents: "none",
        }}
      />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "stretch", gap: 12 }}>
        <div>
          <h1
            style={{
              margin: 0,
              letterSpacing: "0.11em",
              textTransform: "uppercase",
              fontWeight: 700,
              color: INK,
              fontSize: 60,
              lineHeight: 1,
            }}
          >
            Market Mentor
          </h1>
          <p
            style={{
              margin: "8px 0 0",
              letterSpacing: "0.28em",
              textTransform: "uppercase",
              fontSize: 20,
              fontWeight: 600,
              color: MUTED,
            }}
          >
            Practice Today. Profit Tomorrow.
          </p>
        </div>

        <div style={{ display: "flex", gap: 14 }}>
          <div
            style={{
              width: 350,
              height: 236,
              borderRadius: 20,
              border: `1px solid ${LINE_STRONG}`,
              background:
                "linear-gradient(165deg, rgba(255, 255, 255, 0.86) 0%, rgba(247, 251, 255, 0.76) 100%)",
              boxShadow:
                "inset 0 1px 0 rgba(255, 255, 255, 0.88), 0 12px 26px rgba(31, 67, 132, 0.14)",
              padding: 14,
              boxSizing: "border-box",
            }}
          >
            <ScoreboardContent frame={frame} compact />
          </div>
          <div
            style={{
              width: 350,
              height: 236,
              borderRadius: 20,
              border: `1px solid ${LINE_STRONG}`,
              background:
                "linear-gradient(165deg, rgba(255, 255, 255, 0.86) 0%, rgba(247, 251, 255, 0.76) 100%)",
              boxShadow:
                "inset 0 1px 0 rgba(255, 255, 255, 0.88), 0 12px 26px rgba(31, 67, 132, 0.14)",
              padding: 14,
              boxSizing: "border-box",
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "7px 10px",
              alignContent: "start",
            }}
          >
            {[
              ["Source", "Coinbase"],
              ["Mode", "Live"],
              ["Balance", "$9,795.45"],
              ["Available Margin", "$3,314.05"],
              ["Cash Balance", "$9,961.79"],
              ["Session Return", "-2.05%", DANGER],
            ].map(([k, v, c]) => (
              <div key={k as string} style={{ padding: "7px 8px", borderRadius: 12, border: `1px solid ${LINE_SOFT}` }}>
                <span
                  style={{
                    display: "block",
                    fontSize: 10,
                    color: MUTED,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  {k as string}
                </span>
                <strong
                  style={{
                    fontFamily: MONO,
                    fontSize: 13,
                    fontWeight: 620,
                    color: (c as string) ?? INK,
                    lineHeight: 1.25,
                  }}
                >
                  {v as string}
                </strong>
              </div>
            ))}
            <div
              style={{
                gridColumn: "1 / -1",
                marginTop: 2,
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                alignItems: "center",
              }}
            >
              {[
                ["Reset Session"],
                ["Sign Out"],
              ].map(([label], idx) => (
                <div key={label} style={{ display: "flex", alignItems: "stretch" }}>
                  {idx > 0 ? <span style={{ width: 1, background: LINE_SOFT }} /> : null}
                  <span
                    style={{
                      flex: 1,
                      textAlign: "center",
                      padding: "6px 4px",
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      color: MUTED,
                    }}
                  >
                    {label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div
        style={{
          marginTop: 14,
          overflow: "hidden",
          maskImage:
            "linear-gradient(to right, transparent 0%, #000 8%, #000 92%, transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(to right, transparent 0%, #000 8%, #000 92%, transparent 100%)",
        }}
      >
        <div style={{ display: "flex", whiteSpace: "nowrap", transform: `translateX(${tickerX}px)` }}>
          {[
            "Bitcoin (BTC) Block Reward Halving 2028",
            "Ask El Salvador for advice: Cuba suspends dollar cash deposits in banks due to US sanctions",
            "One of the Richest Bitcoin Whales in History Bought $138,000,000 in BTC",
            "Fed commentary keeps crypto traders cautious ahead of CPI",
            "ETH options open interest climbs as volatility cools",
          ]
            .concat([
              "Bitcoin (BTC) Block Reward Halving 2028",
              "Ask El Salvador for advice: Cuba suspends dollar cash deposits in banks due to US sanctions",
              "One of the Richest Bitcoin Whales in History Bought $138,000,000 in BTC",
              "Fed commentary keeps crypto traders cautious ahead of CPI",
              "ETH options open interest climbs as volatility cools",
            ])
            .map((item, idx) => (
              <span key={`${item}-${idx}`} style={{ fontSize: 13, color: MUTED, padding: "9px 0" }}>
                <span style={{ margin: "0 12px 0 16px", opacity: 0.55 }}>•</span>
                {item}
              </span>
            ))}
        </div>
      </div>
    </section>
  );
}

function ChartPanelCore({ frame }: { frame: number }) {
  const livePrice =
    63175 +
    interpolate(frame, [90, 220, 360], [0, 580, 760], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }) +
    Math.sin(frame * 0.08) * 44 +
    Math.cos(frame * 0.03) * 26;

  const chartPath = Array.from({ length: 84 }, (_, i) => {
    const x = (i / 83) * 1000;
    const y =
      310 -
      (Math.sin(i * 0.22 + frame * 0.07) * 58 +
        Math.cos(i * 0.1 + frame * 0.03) * 35 +
        i * 1.2);
    return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${Math.max(28, Math.min(344, y)).toFixed(2)}`;
  }).join(" ");

  return (
    <Panel x={100} y={360} w={1140} h={680} title="Chart Panel">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 10,
          marginBottom: 8,
        }}
      >
        <div
          style={{
            display: "inline-flex",
            gap: 2,
            border: `1px solid ${LINE_SOFT}`,
            borderRadius: 12,
            padding: 3,
            background:
              "linear-gradient(170deg, rgba(255, 255, 255, 0.9) 0%, rgba(245, 250, 255, 0.82) 100%)",
          }}
        >
          {["BTC / USDT", "ETH / USDT", "SOL / USDT", "XRP / USD"].map((pair, idx) => (
            <span
              key={pair}
              style={{
                borderRadius: 9,
                padding: "6px 10px",
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                lineHeight: 1.2,
                fontFamily: MONO,
                color: idx === 0 ? INK : MUTED,
                background: idx === 0 ? "rgba(37, 99, 235, 0.12)" : "transparent",
              }}
            >
              {pair}
            </span>
          ))}
        </div>

        <div
          style={{
            display: "inline-flex",
            gap: 2,
            border: `1px solid ${LINE_SOFT}`,
            borderRadius: 12,
            padding: 3,
            background:
              "linear-gradient(170deg, rgba(255, 255, 255, 0.9) 0%, rgba(245, 250, 255, 0.82) 100%)",
          }}
        >
          {["1M", "15M", "1H", "1D", "1W"].map((tf, idx) => (
            <span
              key={tf}
              style={{
                borderRadius: 9,
                padding: "6px 10px",
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                lineHeight: 1.2,
                fontFamily: MONO,
                color: idx === 1 ? INK : MUTED,
                background: idx === 1 ? "rgba(37, 99, 235, 0.12)" : "transparent",
              }}
            >
              {tf}
            </span>
          ))}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
          gap: 8,
          marginBottom: 10,
        }}
      >
        {[
          ["Open", "$63,183.24"],
          ["High", "$63,224.28"],
          ["Low", "$63,127.13"],
          ["Close", `$${fmt(livePrice)}`],
          ["Volume", "29"],
        ].map(([k, v]) => (
          <div
            key={k as string}
            style={{
              background: SURFACE_1,
              border: `1px solid ${LINE_SOFT}`,
              borderRadius: 10,
              padding: "9px 10px",
            }}
          >
            <p
              style={{
                margin: "0 0 3px",
                color: MUTED,
                fontSize: 10,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              {k as string}
            </p>
            <p
              style={{
                margin: 0,
                fontWeight: 620,
                fontSize: 14,
                color: INK,
                fontVariantNumeric: "tabular-nums",
                fontFamily: MONO,
              }}
            >
              {v as string}
            </p>
          </div>
        ))}
      </div>

      <div
        style={{
          border: `1px solid ${LINE_STRONG}`,
          borderRadius: 12,
          overflow: "hidden",
          height: 520,
          background: SURFACE_2,
          boxShadow:
            "inset 0 1px 0 rgba(255, 255, 255, 0.88), 0 8px 24px rgba(31, 67, 132, 0.1)",
        }}
      >
        <svg width="100%" height="100%" viewBox="0 0 1000 372" preserveAspectRatio="none">
          <rect width="1000" height="372" fill="rgba(255,255,255,0.8)" />
          {[40, 95, 150, 205, 260, 315].map((y) => (
            <line key={y} x1={0} y1={y} x2={1000} y2={y} stroke={LINE_SOFT} strokeWidth={1} />
          ))}
          {[80, 300, 520, 740, 920].map((x) => (
            <line key={x} x1={x} y1={0} x2={x} y2={372} stroke={LINE_SOFT} strokeWidth={1} strokeDasharray="4 4" />
          ))}
          <path d={chartPath} fill="none" stroke={SUCCESS} strokeWidth={2.6} />
          <line x1={0} y1={252} x2={1000} y2={252} stroke="rgba(18,163,109,0.68)" strokeWidth={1} strokeDasharray="6 5" />
          <rect x={944} y={244} width={56} height={16} fill="rgba(18,163,109,0.16)" />
          <text x={972} y={256} textAnchor="middle" fontFamily={MONO} fontSize={10} fill={SUCCESS}>
            ${fmt(livePrice)}
          </text>
        </svg>
      </div>
    </Panel>
  );
}

function TicketPanelCore({ frame }: { frame: number }) {
  const typed = frame >= 330;
  const typeText = (text: string, start: number, end: number) => {
    const t = clamp01((frame - start) / Math.max(1, end - start));
    return text.slice(0, Math.ceil(t * text.length));
  };

  const qtyText = typed ? "0.032" : typeText("0.032", 232, 252);
  const priceText = typed ? "97,450.00" : typeText("97,450.00", 254, 282);
  const tpText = typed ? "99,800.00" : typeText("99,800.00", 284, 304);
  const slText = typed ? "96,700.00" : typeText("96,700.00", 306, 324);

  const press = interpolate(frame, [318, 326, 332], [0, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <Panel x={1260} y={360} w={560} h={680} title="Ticket Panel">
      <div style={{ display: "grid", gap: 10 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 2,
            padding: 3,
            borderRadius: 12,
            background:
              "linear-gradient(170deg, rgba(255, 255, 255, 0.9) 0%, rgba(245, 250, 255, 0.82) 100%)",
            border: `1px solid ${LINE_SOFT}`,
          }}
        >
          <span
            style={{
              borderRadius: 9,
              padding: "6px 10px",
              color: MUTED,
              fontSize: 11,
              fontWeight: 600,
              textAlign: "center",
              fontFamily: MONO,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
            }}
          >
            Market
          </span>
          <span
            style={{
              borderRadius: 9,
              padding: "6px 10px",
              color: INK,
              fontSize: 11,
              fontWeight: 600,
              textAlign: "center",
              fontFamily: MONO,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              background: "rgba(37, 99, 235, 0.12)",
            }}
          >
            Limit
          </span>
        </div>

        {[
          ["Quantity", qtyText || "0.000"],
          ["Limit price", priceText || "0.00"],
        ].map(([label, value]) => (
          <label key={label as string} style={{ display: "grid", gap: 5 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: MUTED }}>{label as string}</span>
            <span
              style={{
                border: `1px solid ${LINE_SOFT}`,
                borderRadius: 10,
                padding: "10px 10px",
                fontSize: 13,
                color: INK,
                background: SURFACE_2,
                fontFamily: MONO,
              }}
            >
              {value as string}
            </span>
          </label>
        ))}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {[
            ["Take-profit", tpText || "0.00"],
            ["Stop-loss", slText || "0.00"],
          ].map(([label, value]) => (
            <label key={label as string} style={{ display: "grid", gap: 5 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: MUTED }}>{label as string}</span>
              <span
                style={{
                  border: `1px solid ${LINE_SOFT}`,
                  borderRadius: 10,
                  padding: "10px 10px",
                  fontSize: 13,
                  color: INK,
                  background: SURFACE_2,
                  fontFamily: MONO,
                }}
              >
                {value as string}
              </span>
            </label>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <span
            style={{
              minHeight: 44,
              borderRadius: 10,
              border: `1px solid rgba(18,163,109,${(0.34 + press * 0.28).toFixed(3)})`,
              background: `rgba(18,163,109,${(0.08 + press * 0.16).toFixed(3)})`,
              color: SUCCESS,
              fontSize: 12,
              fontWeight: 600,
              fontFamily: MONO,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            Buy / Long
          </span>
          <span
            style={{
              minHeight: 44,
              borderRadius: 10,
              border: "1px solid rgba(187,59,81,0.34)",
              background: "rgba(187,59,81,0.08)",
              color: DANGER,
              fontSize: 12,
              fontWeight: 600,
              fontFamily: MONO,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            Sell / Short
          </span>
        </div>

        <div style={{ marginTop: 8 }}>
          <h3 style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 600, color: MUTED, fontFamily: MONO }}>
            Pending Limit Orders
          </h3>
          <div
            style={{
              border: `1px solid ${LINE_STRONG}`,
              borderRadius: 10,
              padding: 8,
              background: SURFACE_1,
              fontSize: 13,
              color: INK,
              minHeight: 126,
              boxSizing: "border-box",
            }}
          >
            {typed ? (
              <div style={{ padding: "9px 2px" }}>BTC/USDT Buy 0.032 @ $97,450.00</div>
            ) : (
              <div style={{ padding: "9px 2px", color: MUTED }}>No pending orders.</div>
            )}
          </div>
        </div>
      </div>
    </Panel>
  );
}

function OpenPositionsPanelCore({ frame }: { frame: number }) {
  const rowAppear = interpolate(frame, [340, 368], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const rowGone = interpolate(frame, [492, 510], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const rowOpacity = rowAppear * rowGone;

  const markStep = Math.floor(frame / 30);
  const markBase = 97452.8;
  const mark = markBase + Math.sin(markStep * 0.84) * 65 + Math.cos(markStep * 0.48) * 33 + (markStep % 2 === 0 ? 1.25 : -1.25);
  const pnl = 17.5 + (mark - markBase) * 0.032;
  const pos = pnl >= 0;

  return (
    <Panel x={100} y={1060} w={1720} h={220} title="Open Positions">
      <div
        style={{
          border: `1px solid ${LINE_STRONG}`,
          borderRadius: 10,
          overflow: "hidden",
          background: SURFACE_1,
        }}
      >
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            tableLayout: "fixed",
            fontFamily: MONO,
            fontSize: 13,
            color: INK,
          }}
        >
          <thead>
            <tr>
              {["Side", "Quantity", "Entry", "Mark", "P&L", "TP", "SL", "Action"].map((label) => (
                <th
                  key={label}
                  style={{
                    textAlign: "left",
                    padding: "10px 9px",
                    borderBottom: `1px solid ${LINE_SOFT}`,
                    color: "#2b4268",
                    background: "rgba(237, 244, 255, 0.92)",
                    fontWeight: 650,
                  }}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rowOpacity > 0.01 ? (
              <tr style={{ opacity: rowOpacity }}>
                <td style={{ padding: "10px 9px", borderBottom: `1px solid ${LINE_SOFT}`, color: SUCCESS, fontWeight: 700 }}>long</td>
                <td style={{ padding: "10px 9px", borderBottom: `1px solid ${LINE_SOFT}` }}>0.032 BTC</td>
                <td style={{ padding: "10px 9px", borderBottom: `1px solid ${LINE_SOFT}` }}>$97,450.00</td>
                <td style={{ padding: "10px 9px", borderBottom: `1px solid ${LINE_SOFT}` }}>${fmt(mark)}</td>
                <td
                  style={{
                    padding: "10px 9px",
                    borderBottom: `1px solid ${LINE_SOFT}`,
                    color: pos ? SUCCESS : DANGER,
                    fontWeight: 700,
                  }}
                >
                  {fmtPnl(pnl)}
                </td>
                <td style={{ padding: "10px 9px", borderBottom: `1px solid ${LINE_SOFT}`, color: BRAND }}>$99,800.00</td>
                <td style={{ padding: "10px 9px", borderBottom: `1px solid ${LINE_SOFT}`, color: BRAND }}>$96,700.00</td>
                <td style={{ padding: "10px 9px", borderBottom: `1px solid ${LINE_SOFT}`, color: BRAND, fontWeight: 700 }}>Close</td>
              </tr>
            ) : (
              <tr>
                <td colSpan={8} style={{ padding: "12px", color: MUTED, fontFamily: FONT, fontSize: 13 }}>
                  No open positions
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function ClosedTradesPanelCore({ frame }: { frame: number }) {
  const rowOpacity = interpolate(frame, [508, 534], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <Panel x={100} y={1300} w={1720} h={230} title="Closed Trades">
      <div
        style={{
          border: `1px solid ${LINE_STRONG}`,
          borderRadius: 10,
          overflow: "hidden",
          background: SURFACE_1,
        }}
      >
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            tableLayout: "fixed",
            fontFamily: MONO,
            fontSize: 13,
            color: INK,
          }}
        >
          <thead>
            <tr>
              {["Side", "Quantity", "Entry", "Exit", "P&L", "Reason", "Bal. Before", "Bal. After"].map((label) => (
                <th
                  key={label}
                  style={{
                    textAlign: "left",
                    padding: "10px 9px",
                    borderBottom: `1px solid ${LINE_SOFT}`,
                    color: "#2b4268",
                    background: "rgba(237, 244, 255, 0.92)",
                    fontWeight: 650,
                  }}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rowOpacity > 0.01 ? (
              <tr style={{ opacity: rowOpacity }}>
                <td style={{ padding: "10px 9px", borderBottom: `1px solid ${LINE_SOFT}`, color: SUCCESS, fontWeight: 700 }}>long</td>
                <td style={{ padding: "10px 9px", borderBottom: `1px solid ${LINE_SOFT}` }}>0.032 BTC</td>
                <td style={{ padding: "10px 9px", borderBottom: `1px solid ${LINE_SOFT}` }}>$97,450.00</td>
                <td style={{ padding: "10px 9px", borderBottom: `1px solid ${LINE_SOFT}` }}>$98,180.40</td>
                <td style={{ padding: "10px 9px", borderBottom: `1px solid ${LINE_SOFT}`, color: SUCCESS, fontWeight: 700 }}>
                  +$21.74
                </td>
                <td style={{ padding: "10px 9px", borderBottom: `1px solid ${LINE_SOFT}`, color: MUTED }}>take-profit</td>
                <td style={{ padding: "10px 9px", borderBottom: `1px solid ${LINE_SOFT}` }}>$10,000.00</td>
                <td style={{ padding: "10px 9px", borderBottom: `1px solid ${LINE_SOFT}` }}>$10,021.74</td>
              </tr>
            ) : (
              <tr>
                <td colSpan={8} style={{ padding: "12px", color: MUTED, fontFamily: FONT, fontSize: 13 }}>
                  No closed trades yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function ScoreboardContent({ frame, compact = false }: { frame: number; compact?: boolean }) {
  const p1 = ease(frame, 588, 612);
  const p2 = ease(frame, 616, 640);
  const rowH = compact ? 34 : 40;
  const rowGap = 4;
  const slot = rowH + rowGap;

  const mapIdx = (order: ScoreId[]) => {
    const map = new Map<ScoreId, number>();
    order.forEach((id, idx) => map.set(id, idx));
    return map;
  };
  const i0 = mapIdx(ORDER_0);
  const i1 = mapIdx(ORDER_1);
  const i2 = mapIdx(ORDER_2);

  const yFor = (id: ScoreId) => {
    const y0 = (i0.get(id) ?? 0) * slot;
    const y1 = (i1.get(id) ?? 0) * slot;
    const y2 = (i2.get(id) ?? 0) * slot;
    if (frame < 616) return lerp(y0, y1, p1);
    return lerp(y1, y2, p2);
  };

  const rank = (id: ScoreId) => {
    if (frame < 616) return Math.round(lerp((i0.get(id) ?? 0) + 1, (i1.get(id) ?? 0) + 1, p1));
    return Math.round(lerp((i1.get(id) ?? 0) + 1, (i2.get(id) ?? 0) + 1, p2));
  };

  const toneForRank = (r: number) => {
    if (r === 1) return { bg: "rgba(255, 215, 0, 0.08)", border: "rgba(218, 165, 32, 0.22)", badge: "#b8860b" };
    if (r === 2) return { bg: "rgba(176, 196, 222, 0.2)", border: "rgba(176, 196, 222, 0.2)", badge: "#607090" };
    if (r === 3) return { bg: "rgba(205, 133, 63, 0.08)", border: "rgba(205, 133, 63, 0.2)", badge: "#8b5e3c" };
    return { bg: "rgba(100, 116, 139, 0.07)", border: "rgba(100, 116, 139, 0.16)", badge: MUTED };
  };

  return (
    <div style={{ display: "grid", gap: 6, height: "100%" }}>
      <div style={{ position: "relative", height: rowH * 4 + rowGap * 3 }}>
        {SCORE_ROWS.map((row) => {
          const r = rank(row.id);
          const tone = toneForRank(r);
          const value = lerp(row.base, row.target, ease(frame, 592, 644));
          const isYou = row.id === "you";
          return (
            <div
              key={row.id}
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                height: rowH,
                transform: `translateY(${yFor(row.id)}px)`,
                display: "grid",
                gridTemplateColumns: compact ? "50px 1fr 92px" : "56px 1fr 110px",
                alignItems: "center",
                padding: compact ? "7px 10px" : "8px 11px",
                borderRadius: 12,
                boxSizing: "border-box",
                background: `linear-gradient(90deg, ${tone.bg} 0%, transparent 100%)`,
                border: `1px solid ${tone.border}`,
              }}
            >
              <span style={{ fontSize: 11, fontWeight: 800, fontFamily: MONO, color: tone.badge, letterSpacing: "0.08em" }}>
                {r}TH
              </span>
              <span style={{ fontSize: 13, fontWeight: 600, color: INK }}>
                {row.name}
                {isYou ? <span style={{ fontSize: 10, fontWeight: 500, opacity: 0.7 }}> (you)</span> : null}
              </span>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 800,
                  fontFamily: MONO,
                  color: value >= 0 ? SUCCESS : DANGER,
                  textAlign: "right",
                }}
              >
                {fmtSigned(value)}
              </span>
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: "auto" }}>
        <div style={{ height: 1, background: LINE_SOFT, margin: "8px 0 6px" }} />
        <div style={{ fontSize: 11, color: MUTED, textAlign: "center", lineHeight: 1.2 }}>
          You lead this ride. Keep going!
        </div>
      </div>
    </div>
  );
}

function ScoreboardPanel({ frame }: { frame: number }) {
  return (
    <Panel x={1260} y={1060} w={560} h={320} title="Scoreboard">
      <ScoreboardContent frame={frame} />
    </Panel>
  );
}

function BottomPlaceholders() {
  return (
    <>
      <Panel x={100} y={1542} w={860} h={120} title="Session Analytics">
        <p style={{ margin: 0, color: MUTED, fontSize: 13 }}>Metrics keep updating as trades close and score changes.</p>
      </Panel>
      <Panel x={980} y={1542} w={840} h={120} title="Pair News">
        <p style={{ margin: 0, color: MUTED, fontSize: 13 }}>Headline stream remains active while you execute the strategy.</p>
      </Panel>
    </>
  );
}

export const OverviewLight = () => {
  const frame = useCurrentFrame();
  const cam = cameraAt(frame);
  const tx = 960 - cam.x * cam.scale;
  const ty = 540 - cam.y * cam.scale;

  return (
    <AbsoluteFill style={{ background: BG, overflow: "hidden", fontFamily: FONT }}>
      <div
        style={{
          position: "absolute",
          left: 18,
          top: 16,
          zIndex: 40,
          background: "rgba(255,255,255,0.82)",
          border: `1px solid ${LINE_STRONG}`,
          borderRadius: 999,
          padding: "6px 12px",
          color: INK,
          fontFamily: MONO,
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        {stageLabel(frame)}
      </div>

      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: 1920,
          height: WORLD_H,
          transformOrigin: "0 0",
          transform: `translate(${tx}px, ${ty}px) scale(${cam.scale})`,
        }}
      >
        <HeroHeader frame={frame} />
        <ChartPanelCore frame={frame} />
        <TicketPanelCore frame={frame} />
        <OpenPositionsPanelCore frame={frame} />
        <ClosedTradesPanelCore frame={frame} />
        <ScoreboardPanel frame={frame} />
        <BottomPlaceholders />
      </div>

      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 4,
          background: "rgba(37, 99, 235, 0.12)",
        }}
      >
        <div
          style={{
            width: `${(frame / DURATION) * 100}%`,
            height: "100%",
            background: "linear-gradient(90deg, #2563eb 0%, #12a36d 100%)",
            borderRadius: "0 2px 2px 0",
          }}
        />
      </div>
    </AbsoluteFill>
  );
};
