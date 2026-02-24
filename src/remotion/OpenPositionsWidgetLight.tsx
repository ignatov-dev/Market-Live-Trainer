import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from "remotion";

const FONT =
  '"Outfit", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const MONO =
  '"JetBrains Mono", "SFMono-Regular", Menlo, Monaco, Consolas, monospace';

const INK = "#13213e";
const MUTED = "#62789f";
const LINE_SOFT = "rgba(117, 146, 194, 0.2)";
const LINE_STRONG = "rgba(117, 146, 194, 0.32)";
const SURFACE_1 = "rgba(255, 255, 255, 0.78)";
const BRAND = "#2563eb";
const SUCCESS = "#12a36d";
const DANGER = "#bb3b51";

const BG = [
  "radial-gradient(120% 90% at 0% 0%, rgba(37, 99, 235, 0.16) 0%, rgba(37, 99, 235, 0) 52%)",
  "radial-gradient(120% 90% at 100% 0%, rgba(16, 185, 129, 0.1) 0%, rgba(16, 185, 129, 0) 56%)",
  "linear-gradient(180deg, #eaf1ff 0%, #f3f7ff 58%)",
].join(", ");

type OpenPositionRow = {
  side: "long" | "short";
  qty: string;
  entry: string;
  markBase: number;
  pnlBase: number;
  pnlPerPoint: number;
  tp: string;
  sl: string;
  action: string;
};

const ROWS: OpenPositionRow[] = [
  {
    side: "long",
    qty: "0.032 BTC",
    entry: "$97,422.00",
    markBase: 98115.4,
    pnlBase: 18.37,
    pnlPerPoint: 0.032,
    tp: "$99,800.00",
    sl: "$96,700.00",
    action: "Close",
  },
  {
    side: "short",
    qty: "1.250 ETH",
    entry: "$3,404.12",
    markBase: 3371.66,
    pnlBase: 40.03,
    pnlPerPoint: -1.25,
    tp: "Setup",
    sl: "$3,462.00",
    action: "Close",
  },
  {
    side: "long",
    qty: "845 SOL",
    entry: "$202.18",
    markBase: 201.44,
    pnlBase: -62.53,
    pnlPerPoint: 8.45,
    tp: "$218.00",
    sl: "Setup",
    action: "Close",
  },
];

const MARK_VOLATILITY = [64, 7.5, 0.62] as const;
const MARK_TICK = [1.35, 0.24, 0.05] as const;

function formatMarkPrice(value: number) {
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatPnl(value: number) {
  const sign = value >= 0 ? "+" : "-";
  return `${sign}$${Math.abs(value).toFixed(2)}`;
}

function simulateMark(base: number, rowIndex: number, step: number) {
  const amp = MARK_VOLATILITY[rowIndex] ?? 1;
  const tick = MARK_TICK[rowIndex] ?? 0.05;
  const wave =
    Math.sin(step * (0.73 + rowIndex * 0.11)) * amp +
    Math.cos(step * (0.41 + rowIndex * 0.07)) * amp * 0.55;
  const micro = (step % 2 === 0 ? 1 : -1) * tick;
  return base + wave + micro;
}

function Blob({
  cx,
  cy,
  r,
  color,
  opacity,
  frame,
  speedX = 0,
  speedY = 0,
  phase = 0,
}: {
  cx: number;
  cy: number;
  r: number;
  color: string;
  opacity: number;
  frame: number;
  speedX?: number;
  speedY?: number;
  phase?: number;
}) {
  const x = cx + Math.sin(frame * speedX + phase) * 40;
  const y = cy + Math.cos(frame * speedY + phase) * 28;
  return (
    <div
      style={{
        position: "absolute",
        left: x - r,
        top: y - r,
        width: r * 2,
        height: r * 2,
        borderRadius: "50%",
        background: color,
        opacity,
        filter: `blur(${r * 0.65}px)`,
        pointerEvents: "none",
      }}
    />
  );
}

export const OpenPositionsWidgetLight = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const secondStep = Math.floor(frame / Math.max(1, Math.round(fps)));

  const panelIn = spring({
    fps,
    frame,
    config: { damping: 22, stiffness: 58, mass: 1.05 },
    from: 0,
    to: 1,
  });

  return (
    <AbsoluteFill style={{ background: BG, overflow: "hidden", fontFamily: FONT }}>
      <Blob
        cx={180}
        cy={150}
        r={230}
        color="rgba(37,99,235,0.12)"
        opacity={1}
        frame={frame}
        speedX={0.016}
        speedY={0.012}
      />
      <Blob
        cx={1700}
        cy={900}
        r={260}
        color="rgba(16,185,129,0.1)"
        opacity={1}
        frame={frame}
        speedX={0.014}
        speedY={0.018}
        phase={2}
      />

      <div
        style={{
          position: "absolute",
          left: (1920 - 1280) / 2,
          top: (1080 - 420) / 2,
          width: 1280,
          height: 420,
          borderRadius: 14,
          border: `1px solid ${LINE_STRONG}`,
          background:
            "linear-gradient(160deg, rgba(255, 255, 255, 0.86) 0%, rgba(246, 251, 255, 0.74) 100%)",
          boxShadow: "0 12px 34px rgba(33, 61, 118, 0.12)",
          padding: 16,
          boxSizing: "border-box",
          transform: `translateY(${(1 - panelIn) * 26}px)`,
          opacity: interpolate(frame, [0, 16], [0, 1], {
            extrapolateRight: "clamp",
          }),
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
            justifyContent: "space-between",
            alignItems: "center",
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
            Open Positions
          </h2>
        </div>

        <div
          style={{
            marginTop: 10,
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
              {ROWS.map((row, i) => {
                const rowIn = spring({
                  fps,
                  frame: frame - 8 - i * 4,
                  config: { damping: 24, stiffness: 110, mass: 0.8 },
                  from: 0,
                  to: 1,
                });
                const currentMark = simulateMark(row.markBase, i, secondStep);
                const currentPnl =
                  row.pnlBase + (currentMark - row.markBase) * row.pnlPerPoint;
                const isPnlPos = currentPnl >= 0;
                return (
                  <tr
                    key={`${row.side}-${row.qty}`}
                    style={{
                      opacity: rowIn,
                      transform: `translateY(${(1 - rowIn) * 8}px)`,
                    }}
                  >
                    <td
                      style={{
                        padding: "10px 9px",
                        borderBottom: `1px solid ${LINE_SOFT}`,
                        color: row.side === "long" ? SUCCESS : DANGER,
                        textTransform: "uppercase",
                        fontWeight: 700,
                      }}
                    >
                      {row.side}
                    </td>
                    <td style={{ padding: "10px 9px", borderBottom: `1px solid ${LINE_SOFT}` }}>{row.qty}</td>
                    <td style={{ padding: "10px 9px", borderBottom: `1px solid ${LINE_SOFT}` }}>{row.entry}</td>
                    <td style={{ padding: "10px 9px", borderBottom: `1px solid ${LINE_SOFT}` }}>
                      {formatMarkPrice(currentMark)}
                    </td>
                    <td
                      style={{
                        padding: "10px 9px",
                        borderBottom: `1px solid ${LINE_SOFT}`,
                        color: isPnlPos ? SUCCESS : DANGER,
                        fontWeight: 700,
                      }}
                    >
                      {formatPnl(currentPnl)}
                    </td>
                    <td
                      style={{
                        padding: "10px 9px",
                        borderBottom: `1px solid ${LINE_SOFT}`,
                        color: row.tp === "Setup" ? MUTED : BRAND,
                        fontWeight: row.tp === "Setup" ? 500 : 600,
                      }}
                    >
                      {row.tp}
                    </td>
                    <td
                      style={{
                        padding: "10px 9px",
                        borderBottom: `1px solid ${LINE_SOFT}`,
                        color: row.sl === "Setup" ? MUTED : BRAND,
                        fontWeight: row.sl === "Setup" ? 500 : 600,
                      }}
                    >
                      {row.sl}
                    </td>
                    <td
                      style={{
                        padding: "10px 9px",
                        borderBottom: `1px solid ${LINE_SOFT}`,
                        color: BRAND,
                        fontWeight: 700,
                        letterSpacing: "0.04em",
                        fontSize: 12,
                      }}
                    >
                      {row.action}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </AbsoluteFill>
  );
};
