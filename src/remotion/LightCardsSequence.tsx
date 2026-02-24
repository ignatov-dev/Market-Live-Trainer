import {
  AbsoluteFill,
  Audio,
  Html5Audio,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { ScoreboardCardLight } from "./ScoreboardCardLight";
import { SessionSummaryCardLight } from "./SessionSummaryCardLight";
import { ChartPanelDemoLight } from "./ChartPanelDemoLight";
import { TicketPanelDemoLight } from "./TicketPanelDemoLight";
import { OpenPositionsWidgetLight } from "./OpenPositionsWidgetLight";
import { ClosedTradesWidgetLight } from "./ClosedTradesWidgetLight";

const SEGMENT_DURATION = 180;
const CHART_SCALE = 1.2;
const ENLARGED_SCALE = 1.12;
const OUTRO_DURATION = 120;
const OUTRO_START = SEGMENT_DURATION * 6 + 10;

const FONT =
  '"Outfit", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const INK = "#13213e";
const MUTED = "#62789f";
const LINE_STRONG = "rgba(117, 146, 194, 0.32)";
const BG = [
  "radial-gradient(120% 90% at 0% 0%, rgba(37, 99, 235, 0.16) 0%, rgba(37, 99, 235, 0) 52%)",
  "radial-gradient(120% 90% at 100% 0%, rgba(16, 185, 129, 0.1) 0%, rgba(16, 185, 129, 0) 56%)",
  "linear-gradient(180deg, #eaf1ff 0%, #f3f7ff 58%)",
].join(", ");

const ScaledSection = ({
  scale,
  children,
}: {
  scale: number;
  children: React.ReactNode;
}) => {
  return (
    <AbsoluteFill
      style={{
        transform: `scale(${scale})`,
        transformOrigin: "center center",
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

const HeroOutro = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const textIn = spring({
    fps,
    frame,
    config: { damping: 20, stiffness: 70, mass: 0.9 },
    from: 0,
    to: 1,
  });
  const opacity = interpolate(frame, [0, 14], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ background: BG, overflow: "hidden", fontFamily: FONT }}>
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

      <section
        style={{
          position: "absolute",
          inset: "200px 130px",
          // border: `1px solid ${LINE_STRONG}`,
          // borderRadius: 24,
          // background:
          //   "linear-gradient(165deg, rgba(255, 255, 255, 0.86) 0%, rgba(247, 251, 255, 0.76) 100%)",
          // boxShadow:
          //   "inset 0 1px 0 rgba(255, 255, 255, 0.88), 0 12px 26px rgba(31, 67, 132, 0.14)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          opacity,
          transform: `translateY(${(1 - textIn) * 26}px) scale(${0.98 + textIn * 0.02})`,
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              letterSpacing: "0.11em",
              textTransform: "uppercase",
              fontWeight: 700,
              color: INK,
              fontSize: 88,
              lineHeight: 1,
              textShadow: "0 5px 20px rgba(37, 99, 235, 0.14)",
            }}
          >
            Market Mentor
          </h1>
          <p
            style={{
              margin: "16px 0 0",
              letterSpacing: "0.28em",
              textTransform: "uppercase",
              fontSize: 28,
              fontWeight: 600,
              color: MUTED,
              opacity: 0.92,
            }}
          >
            Practice Today. Profit Tomorrow.
          </p>
        </div>
      </section>
    </AbsoluteFill>
  );
};

export const LightCardsSequence = () => {
  return (
    <AbsoluteFill>
      {/* <Html5Audio src={staticFile("long-Robert.wav")} /> */}
      <Html5Audio src={staticFile("clip-Robert-2026_02_24.wav")} />
      {/* <Audio src={staticFile("clip-Cliff-2026_02_24.wav")} /> */}

      <Sequence from={0} durationInFrames={SEGMENT_DURATION}>
        {/* <Html5Audio src={staticFile("chart-Robert.wav")} /> */}
        <ScaledSection scale={CHART_SCALE}>
          <ChartPanelDemoLight />
        </ScaledSection>
      </Sequence>

      <Sequence from={SEGMENT_DURATION - 10} durationInFrames={SEGMENT_DURATION}>
        {/* <Sequence from={10}>
          <Html5Audio src={staticFile("form-Robert.wav")} />
        </Sequence> */}
        <ScaledSection scale={ENLARGED_SCALE}>
          <TicketPanelDemoLight />
        </ScaledSection>
      </Sequence>

      <Sequence from={SEGMENT_DURATION * 2 - 20} durationInFrames={SEGMENT_DURATION + 30}>
        {/* <Html5Audio src={staticFile("open-positions-Robert.wav")} /> */}
        <ScaledSection scale={ENLARGED_SCALE}>
          <OpenPositionsWidgetLight />
        </ScaledSection>
      </Sequence>

      <Sequence from={SEGMENT_DURATION * 3 + 10} durationInFrames={SEGMENT_DURATION}>
        {/* <Html5Audio src={staticFile("trades-Robert.wav")} /> */}
        <ScaledSection scale={ENLARGED_SCALE}>
          <ClosedTradesWidgetLight />
        </ScaledSection>
      </Sequence>

      <Sequence from={SEGMENT_DURATION * 4 - 10} durationInFrames={SEGMENT_DURATION}>
        {/* <Html5Audio src={staticFile("summary-Robert.wav")} /> */}
        <SessionSummaryCardLight />
      </Sequence>

      <Sequence from={SEGMENT_DURATION * 5 - 30} durationInFrames={SEGMENT_DURATION + 40}>
        {/* <Html5Audio src={staticFile("scoreboard-Robert.wav")} /> */}
        <ScoreboardCardLight />
      </Sequence>

      <Sequence from={OUTRO_START} durationInFrames={OUTRO_DURATION}>
        <Html5Audio src={staticFile("welcome-Robert.wav")} />
        <HeroOutro />
      </Sequence>
    </AbsoluteFill>
  );
};
