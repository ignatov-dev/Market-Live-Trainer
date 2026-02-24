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
const SUCCESS = "#12a36d";
const DANGER = "#bb3b51";

const BG = [
  "radial-gradient(120% 90% at 0% 0%, rgba(37, 99, 235, 0.16) 0%, rgba(37, 99, 235, 0) 52%)",
  "radial-gradient(120% 90% at 100% 0%, rgba(16, 185, 129, 0.1) 0%, rgba(16, 185, 129, 0) 56%)",
  "linear-gradient(180deg, #eaf1ff 0%, #f3f7ff 58%)",
].join(", ");

type ClosedTradeRow = {
  side: "long" | "short";
  qty: string;
  entry: string;
  exit: string;
  pnl: string;
  pnlPos: boolean;
  reason: string;
  balBefore: string;
  balAfter: string;
};

const ROWS: ClosedTradeRow[] = [
  {
    side: "long",
    qty: "0.018 BTC",
    entry: "$96,520.00",
    exit: "$97,210.00",
    pnl: "+$11.66",
    pnlPos: true,
    reason: "take-profit",
    balBefore: "$10,422.17",
    balAfter: "$10,433.83",
  },
  {
    side: "short",
    qty: "2.200 ETH",
    entry: "$3,456.30",
    exit: "$3,480.54",
    pnl: "-$53.33",
    pnlPos: false,
    reason: "stop-loss",
    balBefore: "$10,433.83",
    balAfter: "$10,380.50",
  },
  {
    side: "long",
    qty: "1,200 SOL",
    entry: "$186.44",
    exit: "$193.08",
    pnl: "+$79.68",
    pnlPos: true,
    reason: "manual-close",
    balBefore: "$10,380.50",
    balAfter: "$10,460.18",
  },
];

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

export const ClosedTradesWidgetLight = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

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
        cx={260}
        cy={880}
        r={240}
        color="rgba(37,99,235,0.12)"
        opacity={1}
        frame={frame}
        speedX={0.018}
        speedY={0.012}
      />
      <Blob
        cx={1660}
        cy={180}
        r={210}
        color="rgba(16,185,129,0.1)"
        opacity={1}
        frame={frame}
        speedX={0.014}
        speedY={0.018}
        phase={2.2}
      />

      <div
        style={{
          position: "absolute",
          left: (1920 - 1460) / 2,
          top: (1080 - 440) / 2,
          width: 1460,
          height: 440,
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
            Closed Trades
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
            <colgroup>
              <col style={{ width: 90 }} />
              <col style={{ width: 150 }} />
              <col style={{ width: 150 }} />
              <col style={{ width: 150 }} />
              <col style={{ width: 130 }} />
              <col style={{ width: 190 }} />
              <col style={{ width: 170 }} />
              <col style={{ width: 170 }} />
            </colgroup>
            <thead>
              <tr>
                {[
                  "Side",
                  "Quantity",
                  "Entry",
                  "Exit",
                  "P&L",
                  "Reason",
                  "Bal. Before",
                  "Bal. After",
                ].map((label) => (
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
                return (
                  <tr
                    key={`${row.side}-${row.qty}-${row.entry}`}
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
                    <td style={{ padding: "10px 9px", borderBottom: `1px solid ${LINE_SOFT}` }}>{row.exit}</td>
                    <td
                      style={{
                        padding: "10px 9px",
                        borderBottom: `1px solid ${LINE_SOFT}`,
                        color: row.pnlPos ? SUCCESS : DANGER,
                        fontWeight: 700,
                      }}
                    >
                      {row.pnl}
                    </td>
                    <td
                      style={{
                        padding: "10px 9px",
                        borderBottom: `1px solid ${LINE_SOFT}`,
                        color: MUTED,
                      }}
                    >
                      {row.reason}
                    </td>
                    <td style={{ padding: "10px 9px", borderBottom: `1px solid ${LINE_SOFT}` }}>{row.balBefore}</td>
                    <td style={{ padding: "10px 9px", borderBottom: `1px solid ${LINE_SOFT}` }}>{row.balAfter}</td>
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

