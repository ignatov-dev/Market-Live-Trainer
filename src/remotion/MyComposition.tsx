import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";

export const MyComposition = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#1a1a2e",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <h1
        style={{
          color: "white",
          fontSize: 80,
          fontFamily: "sans-serif",
          opacity: frame / durationInFrames,
        }}
      >
        Market Live Trainer
      </h1>
      <p style={{ color: "#aaa", fontSize: 30, fontFamily: "sans-serif" }}>
        Frame {frame} / {durationInFrames}
      </p>
    </AbsoluteFill>
  );
};
