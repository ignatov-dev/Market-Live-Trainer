/**
 * ScoreboardCard.tsx
 * Remotion composition: scoreboard card with smooth reordering animation.
 *
 * 300 frames @ 30 fps = 10 s
 *
 * Timeline:
 *   0 – 32   card enters (spring slide-up + fade)
 *  55 – 92   user climbs from 4TH -> 2ND (fast, smooth reorder)
 * 120 – 156  user climbs from 2ND -> 1ST (fast, smooth reorder)
 * 156 – 300  settled state (focused)
 */

import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Easing,
} from "remotion";

// ─── Design tokens (match app CSS vars / SessionSummaryCard) ─────────────────

const FONT =
  '"SF Pro Text", -apple-system, BlinkMacSystemFont, "Helvetica Neue", "Segoe UI", sans-serif';
const SUCCESS = "#1b8a63";
const DANGER = "#bb3b51";
const INK = "#17253d";

const BG = [
  "radial-gradient(120% 92% at 0% 0%, rgba(209,207,247,0.95) 0%, rgba(209,207,247,0.52) 44%, rgba(209,207,247,0) 76%)",
  "radial-gradient(115% 94% at 100% 0%, rgba(184,217,243,0.94) 0%, rgba(184,217,243,0.56) 46%, rgba(184,217,243,0) 78%)",
  "linear-gradient(180deg, #d1cff7 0%, #b8d9f3 58%, #ffffff 100%)",
].join(", ");

// ─── Ambient blob (same vibe as other Remotion demos) ────────────────────────

interface BlobProps {
  cx: number;
  cy: number;
  r: number;
  color: string;
  opacity: number;
  frame: number;
  speedX?: number;
  speedY?: number;
  phase?: number;
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
}: BlobProps) {
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

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtMoneySigned(value: number) {
  const sign = value >= 0 ? "+" : "−";
  return `${sign}$${Math.abs(value).toFixed(2)}`;
}

function ordinalBadge(rank: number) {
  const s = rank % 100;
  if (s >= 11 && s <= 13) return `${rank}TH`;
  switch (rank % 10) {
    case 1:
      return `${rank}ST`;
    case 2:
      return `${rank}ND`;
    case 3:
      return `${rank}RD`;
    default:
      return `${rank}TH`;
  }
}

function mix(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

type EntryId = "you" | "mason" | "aria" | "kei";
type Entry = {
  id: EntryId;
  name: string;
  isYou?: boolean;
  pnl0: number;
  pnl1: number;
  pnl2: number;
  vol: number;
};

const ENTRIES: Entry[] = [
  { id: "mason", name: "Mason", pnl0: 312.24, pnl1: 312.24, pnl2: 312.24, vol: 2.6 },
  { id: "aria", name: "Aria", pnl0: 254.51, pnl1: 254.51, pnl2: 254.51, vol: 2.2 },
  { id: "kei", name: "Kei", pnl0: 198.07, pnl1: 198.07, pnl2: 198.07, vol: 2.1 },
  { id: "you", name: "You", isYou: true, pnl0: 176.12, pnl1: 290.33, pnl2: 360.85, vol: 2.9 },
];

const ORDER_0: EntryId[] = ["mason", "aria", "kei", "you"]; // you = 4th
const ORDER_1: EntryId[] = ["mason", "you", "aria", "kei"]; // you = 2nd
const ORDER_2: EntryId[] = ["you", "mason", "aria", "kei"]; // you = 1st

function posMap(order: EntryId[]) {
  const m = new Map<EntryId, number>();
  order.forEach((id, idx) => m.set(id, idx));
  return m;
}

function rankMap(order: EntryId[]) {
  const m = new Map<EntryId, number>();
  order.forEach((id, idx) => m.set(id, idx + 1));
  return m;
}

function tierForRank(rank: number) {
  if (rank === 1) return "gold";
  if (rank === 2) return "silver";
  if (rank === 3) return "bronze";
  return "candidate";
}

function rowStyleForTier(tier: ReturnType<typeof tierForRank>) {
  switch (tier) {
    case "gold":
      return {
        background:
          "linear-gradient(90deg, rgba(255, 215, 0, 0.10) 0%, transparent 100%)",
        border: "1px solid rgba(218, 165, 32, 0.22)",
        badge: "#b8860b",
      };
    case "silver":
      return {
        background:
          "linear-gradient(90deg, rgba(176, 196, 222, 0.5) 0%, transparent 100%)",
        border: "1px solid rgba(176, 196, 222, 0.2)",
        badge: "#607090",
      };
    case "bronze":
      return {
        background:
          "linear-gradient(90deg, rgba(205, 133, 63, 0.10) 0%, transparent 100%)",
        border: "1px solid rgba(205, 133, 63, 0.20)",
        badge: "#8b5e3c",
      };
    default:
      return {
        background:
          "linear-gradient(90deg, rgba(100, 116, 139, 0.07) 0%, transparent 100%)",
        border: "1px solid rgba(100, 116, 139, 0.16)",
        badge: "#64748b",
      };
  }
}

function orderAtFrame(frame: number) {
  if (frame < 55) return ORDER_0;
  if (frame < 120) return ORDER_1;
  return ORDER_2;
}

function idSeed(id: EntryId) {
  // Stable seed for "random" updates.
  return id.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
}

function hash32(x: number) {
  // Deterministic 32-bit hash (public domain-style mix).
  let v = x | 0;
  v ^= v >>> 16;
  v = Math.imul(v, 0x7feb352d);
  v ^= v >>> 15;
  v = Math.imul(v, 0x846ca68b);
  v ^= v >>> 16;
  return v >>> 0;
}

function rand01(seed: number) {
  // [0,1)
  return (hash32(seed) & 0xffffff) / 0x1000000;
}

function TrophyIcon({
  size = 16,
  title = "Trophy",
}: {
  size?: number;
  title?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={title}
    >
      <path
        d="M12 15C8.68629 15 6 12.3137 6 9V3.44444C6 3.0306 6 2.82367 6.06031 2.65798C6.16141 2.38021 6.38021 2.16141 6.65798 2.06031C6.82367 2 7.0306 2 7.44444 2H16.5556C16.9694 2 17.1763 2 17.342 2.06031C17.6198 2.16141 17.8386 2.38021 17.9397 2.65798C18 2.82367 18 3.0306 18 3.44444V9C18 12.3137 15.3137 15 12 15ZM12 15V18M18 4H20.5C20.9659 4 21.1989 4 21.3827 4.07612C21.6277 4.17761 21.8224 4.37229 21.9239 4.61732C22 4.80109 22 5.03406 22 5.5V6C22 6.92997 22 7.39496 21.8978 7.77646C21.6204 8.81173 20.8117 9.62038 19.7765 9.89778C19.395 10 18.93 10 18 10M6 4H3.5C3.03406 4 2.80109 4 2.61732 4.07612C2.37229 4.17761 2.17761 4.37229 2.07612 4.61732C2 4.80109 2 5.03406 2 5.5V6C2 6.92997 2 7.39496 2.10222 7.77646C2.37962 8.81173 3.18827 9.62038 4.22354 9.89778C4.60504 10 5.07003 10 6 10M7.44444 22H16.5556C16.801 22 17 21.801 17 21.5556C17 19.5919 15.4081 18 13.4444 18H10.5556C8.59188 18 7 19.5919 7 21.5556C7 21.801 7.19898 22 7.44444 22Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <TrophyIcon title="Gold" />;
  if (rank === 2) return <TrophyIcon title="Silver" />;
  if (rank === 3) return <TrophyIcon title="Bronze" />;
  return <>{ordinalBadge(rank)}</>;
}

export const ScoreboardCard = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // ── Card entrance ──────────────────────────────────────────────────────────
  const cardIn = spring({
    fps,
    frame,
    config: { damping: 20, stiffness: 55, mass: 1.1 },
    from: 0,
    to: 1,
  });
  const cardOpacity = interpolate(frame, [0, 18], [0, 1], {
    extrapolateRight: "clamp",
  });

  // ── Reorder schedule ───────────────────────────────────────────────────────
  const MOVE_1_START = 55;
  const MOVE_2_START = 120;

  const STEP_FRAMES = Math.max(1, Math.round(fps)); // at most once per second
  const stepF = Math.floor(frame / STEP_FRAMES) * STEP_FRAMES;
  const prevStepF = Math.max(0, stepF - STEP_FRAMES);
  const inTick = frame - stepF;

  const reorderSpring = { damping: 24, stiffness: 280, mass: 0.85 } as const;

  // Smooth, frame-driven reordering (layout-like).
  const p1Layout = spring({
    fps,
    frame: frame - MOVE_1_START,
    config: reorderSpring,
    from: 0,
    to: 1,
  });
  const p2Layout = spring({
    fps,
    frame: frame - MOVE_2_START,
    config: reorderSpring,
    from: 0,
    to: 1,
  });

  // Values update <= 1×/sec: choose a new target on the step boundary, then ease to it.
  const tickT = spring({
    fps,
    frame: inTick,
    // Faster than reorder so numbers "catch up" by the time the row finishes moving.
    config: { damping: 34, stiffness: 420, mass: 0.6 },
    from: 0,
    to: 1,
  });

  const pos0 = posMap(ORDER_0);
  const pos1 = posMap(ORDER_1);
  const pos2 = posMap(ORDER_2);
  const rank0 = rankMap(ORDER_0);
  const rank1 = rankMap(ORDER_1);
  const rank2 = rankMap(ORDER_2);

  const ROW_H = 34;
  const ROW_GAP = 4;
  const SLOT = ROW_H + ROW_GAP;

  const yAt = (id: EntryId) => {
    const y0 = (pos0.get(id) ?? 0) * SLOT;
    const y1 = (pos1.get(id) ?? 0) * SLOT;
    const y2 = (pos2.get(id) ?? 0) * SLOT;
    if (frame < MOVE_1_START) return y0;
    if (frame < MOVE_2_START) return mix(y0, y1, p1Layout);
    return mix(y1, y2, p2Layout);
  };

  const computeTargetsAtStep = (stepFrame: number) => {
    const p1Step = spring({
      fps,
      frame: stepFrame - MOVE_1_START,
      config: reorderSpring,
      from: 0,
      to: 1,
    });
    const p2Step = spring({
      fps,
      frame: stepFrame - MOVE_2_START,
      config: reorderSpring,
      from: 0,
      to: 1,
    });

    const raw = new Map<EntryId, number>();
    for (const entry of ENTRIES) {
      const base =
        stepFrame < MOVE_1_START
          ? entry.pnl0
          : stepFrame < MOVE_2_START
            ? mix(entry.pnl0, entry.pnl1, p1Step)
            : mix(entry.pnl1, entry.pnl2, p2Step);

      const seed = stepFrame + idSeed(entry.id) * 1000;
      const u = rand01(seed) * 2 - 1; // [-1,1]
      const jitter = u * entry.vol;
      raw.set(entry.id, base + jitter);
    }

    // Keep values consistent with the displayed rank order so the leader always has the
    // highest value (especially after "you" reaches 1st).
    const order = orderAtFrame(stepFrame);
    const MIN_GAP = 2.75;
    const out = new Map<EntryId, number>();
    let prev = raw.get(order[0]!) ?? 0;
    out.set(order[0]!, prev);
    for (let i = 1; i < order.length; i++) {
      const id = order[i]!;
      const v = raw.get(id) ?? 0;
      const clamped = Math.min(v, prev - MIN_GAP);
      out.set(id, clamped);
      prev = clamped;
    }
    return out;
  };

  const targetsPrev = computeTargetsAtStep(prevStepF);
  const targetsNext = computeTargetsAtStep(stepF);

  const pnlAt = (entry: Entry) => {
    const prev = targetsPrev.get(entry.id) ?? 0;
    const next = targetsNext.get(entry.id) ?? 0;
    return mix(prev, next, tickT);
  };

  const youBoost = (() => {
    const bump = (p: number) =>
      interpolate(p, [0, 0.5, 1], [0, 1, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
    const b1 =
      frame < MOVE_1_START ? 0 : frame < MOVE_2_START ? bump(p1Layout) : 0;
    const b2 = frame < MOVE_2_START ? 0 : bump(p2Layout);
    return Math.max(b1, b2);
  })();

  const phase = frame < MOVE_1_START ? 0 : frame < MOVE_2_START ? 1 : 2;
  const phraseA =
    phase === 0
      ? "Every trade is a new chance to rise."
      : phase === 1
        ? "Right on the leader's heels. Push harder."
        : "Top of the board. Defend your crown.";
  const phraseB =
    phase === 0
      ? "Keep pushing. The leaderboard shifts fast."
      : phase === 1
        ? "One strong move can take the lead."
        : "You set the pace. Stay unstoppable.";
  const phrase =
    frame < MOVE_1_START
      ? phraseA
      : frame < MOVE_2_START
        ? phraseB
        : "You lead this ride. Keep going!";

  // ── Card geometry (matches app) ────────────────────────────────────────────
  const CARD_W = 350;
  const CARD_H = 236;
  const CARD_SCALE = 2.4;

  const rowsContainerH = ROW_H * 4 + ROW_GAP * 3;
  const listTopPad = 6;

  return (
    <AbsoluteFill style={{ background: BG, overflow: "hidden" }}>
      <Blob
        cx={200}
        cy={180}
        r={260}
        color="rgba(209,207,247,0.55)"
        opacity={1}
        frame={frame}
        speedX={0.018}
        speedY={0.012}
        phase={0}
      />
      <Blob
        cx={1720}
        cy={200}
        r={220}
        color="rgba(184,217,243,0.60)"
        opacity={1}
        frame={frame}
        speedX={0.014}
        speedY={0.02}
        phase={2.1}
      />
      <Blob
        cx={960}
        cy={900}
        r={300}
        color="rgba(220,215,250,0.40)"
        opacity={1}
        frame={frame}
        speedX={0.01}
        speedY={0.008}
        phase={1.0}
      />

      {/* Card wrapper — position + entrance + scale */}
      <div
        style={{
          position: "absolute",
          left: 960 - CARD_W / 2,
          top: 540 - CARD_H / 2,
          width: CARD_W,
          height: CARD_H,
          opacity: cardOpacity,
          transform: `translateY(${(1 - cardIn) * 60}px) scale(${CARD_SCALE})`,
          transformOrigin: "50% 50%",
        }}
      >
        {/* Shadow glow */}
        <div
          style={{
            position: "absolute",
            left: -30,
            top: -30,
            width: CARD_W + 60,
            height: CARD_H + 60,
            borderRadius: 32,
            background: "rgba(120,100,200,0.18)",
            filter: `blur(${48 / CARD_SCALE}px)`,
            opacity: 1.1,
            pointerEvents: "none",
          }}
        />

        {/* Glass card */}
        <div
          style={{
            position: "relative",
            width: CARD_W,
            height: CARD_H,
            background:
              "linear-gradient(165deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.08) 100%)",
            border: "1px solid rgba(255,255,255,0.34)",
            borderRadius: 20,
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
            padding: "14px 14px 12px",
            boxSizing: "border-box" as const,
            boxShadow:
              "inset 0 1px 0 rgba(255,255,255,0.34), 0 10px 24px rgba(9, 28, 56, 0.25)",
            display: "flex",
            flexDirection: "column",
            fontFamily: FONT,
            color: INK,
            overflow: "hidden",
          }}
        >
          <div style={{ display: "grid", gap: listTopPad }}>

            <div
              style={{
                position: "relative",
                height: rowsContainerH,
              }}
            >
              {ENTRIES.map((entry) => {
                const r0 = rank0.get(entry.id) ?? 4;
                const r1 = rank1.get(entry.id) ?? 4;
                const r2 = rank2.get(entry.id) ?? 4;

                const currentTier =
                  frame < MOVE_1_START
                    ? tierForRank(r0)
                    : frame < MOVE_2_START
                      ? tierForRank(r1)
                      : tierForRank(r2);
                const style = rowStyleForTier(currentTier);

                const y = yAt(entry.id);
                const pnl = pnlAt(entry);
                const isPositive = pnl >= 0;

                const badgeOpacityA =
                  frame < MOVE_1_START
                    ? 1
                    : frame < MOVE_2_START
                      ? interpolate(p1Layout, [0, 1], [1, 0], {
                          extrapolateLeft: "clamp",
                          extrapolateRight: "clamp",
                        })
                      : 0;
                const badgeOpacityB =
                  frame < MOVE_1_START
                    ? 0
                    : frame < MOVE_2_START
                      ? interpolate(p1Layout, [0, 1], [0, 1], {
                          extrapolateLeft: "clamp",
                          extrapolateRight: "clamp",
                        })
                      : interpolate(p2Layout, [0, 1], [1, 0], {
                          extrapolateLeft: "clamp",
                          extrapolateRight: "clamp",
                        });
                const badgeOpacityC =
                  frame < MOVE_2_START
                    ? 0
                    : interpolate(p2Layout, [0, 1], [0, 1], {
                        extrapolateLeft: "clamp",
                        extrapolateRight: "clamp",
                      });

                const highlight =
                  entry.isYou ? youBoost : 0;
                const rowEnter = spring({
                  fps,
                  frame: frame - 8 - (pos0.get(entry.id) ?? 0) * 3,
                  config: { damping: 24, stiffness: 120, mass: 0.8 },
                  from: 0,
                  to: 1,
                });

                const rowOpacity = interpolate(
                  rowEnter,
                  [0, 1],
                  [0, 1],
                  { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
                );

                const rowLift = interpolate(rowEnter, [0, 1], [10, 0], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                });

                return (
                  <div
                    key={entry.id}
                    style={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      height: ROW_H,
                      transform: `translateY(${y}px) translateY(${rowLift}px) scale(${1 + highlight * 0.065})`,
                      transformOrigin: "50% 50%",
                      opacity: rowOpacity,
                      display: "grid",
                      gridTemplateColumns: "40px 1fr 72px",
                      alignItems: "center",
                      padding: "7px 10px",
                      borderRadius: 12,
                      boxSizing: "border-box" as const,
                      background: style.background,
                      border: style.border,
                      boxShadow: entry.isYou
                        ? [
                            `0 10px 26px rgba(99, 102, 241, ${0.10 + highlight * 0.18})`,
                            `0 0 0 1px rgba(99, 102, 241, ${0.12 + highlight * 0.22})`,
                          ].join(", ")
                        : "none",
                    }}
                  >
                    <span
                      style={{
                        position: "relative",
                        fontSize: 11,
                        fontWeight: 800,
                        textTransform: "uppercase" as const,
                        letterSpacing: "0.08em",
                        color: style.badge,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "flex-start",
                      }}
                    >
                      <span
                        style={{
                          position: "absolute",
                          inset: 0,
                          opacity: badgeOpacityA,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "flex-start",
                        }}
                      >
                        <RankBadge rank={r0} />
                      </span>
                      <span
                        style={{
                          position: "absolute",
                          inset: 0,
                          opacity: badgeOpacityB,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "flex-start",
                        }}
                      >
                        <RankBadge rank={r1} />
                      </span>
                      <span
                        style={{
                          position: "absolute",
                          inset: 0,
                          opacity: badgeOpacityC,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "flex-start",
                        }}
                      >
                        <RankBadge rank={r2} />
                      </span>
                      <span style={{ opacity: 0 }}>
                        <RankBadge rank={r2} />
                      </span>
                    </span>

                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: INK,
                        minWidth: 0,
                        overflow: "hidden",
                        whiteSpace: "nowrap" as const,
                        textOverflow: "ellipsis",
                      }}
                    >
                      {entry.name}
                      {entry.isYou && (
                        <span style={{ fontSize: 10, fontWeight: 500, opacity: 0.7 }}>
                          {" "}
                          (you)
                        </span>
                      )}
                    </span>

                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 800,
                        fontVariantNumeric: "tabular-nums",
                        color: isPositive ? SUCCESS : DANGER,
                        textAlign: "right" as const,
                      }}
                    >
                      {fmtMoneySigned(pnl)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ marginTop: "auto" }}>
            <div
              style={{
                height: 1,
                background: "rgba(16,38,76,0.10)",
                margin: "8px 0 6px",
              }}
            />

            <div
              style={{
                fontSize: 11,
                color: "rgba(16,38,76,0.62)",
                textAlign: "center",
                lineHeight: 1.2,
                opacity: interpolate(frame, [28, 44], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: Easing.out(Easing.cubic),
                }),
              }}
            >
              {phrase}
            </div>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 3,
          background: "rgba(100,80,180,0.12)",
        }}
      >
        <div
          style={{
            width: `${(frame / 300) * 100}%`,
            height: "100%",
            background: "linear-gradient(90deg, #a89de8 0%, #7db8e8 100%)",
            borderRadius: "0 2px 2px 0",
          }}
        />
      </div>
    </AbsoluteFill>
  );
};
