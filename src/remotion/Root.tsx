import { Composition } from "remotion";
import { MyComposition } from "./MyComposition";
import { OpenPositionDemo } from "./OpenPositionDemo";
import { AppShowcase } from "./AppShowcase";
import { SessionSummaryCard } from "./SessionSummaryCard";
import { ChartPanelDemo } from "./ChartPanelDemo";
import { TicketPanelDemo } from "./TicketPanelDemo";

export const RemotionRoot = () => {
  return (
    <>
      <Composition
        id="MyComposition"
        component={MyComposition}
        durationInFrames={150}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{}}
      />
      <Composition
        id="OpenPositionDemo"
        component={OpenPositionDemo}
        durationInFrames={360}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{}}
      />
      <Composition
        id="AppShowcase"
        component={AppShowcase}
        durationInFrames={750}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{}}
      />
      <Composition
        id="SessionSummaryCard"
        component={SessionSummaryCard}
        durationInFrames={300}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{}}
      />
      <Composition
        id="ChartPanelDemo"
        component={ChartPanelDemo}
        durationInFrames={300}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{}}
      />
      <Composition
        id="TicketPanelDemo"
        component={TicketPanelDemo}
        durationInFrames={300}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{}}
      />
    </>
  );
};
