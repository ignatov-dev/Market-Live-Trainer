import { Composition } from "remotion";
import { MyComposition } from "./MyComposition";
import { OpenPositionDemo } from "./OpenPositionDemo";
import { OverviewLight } from "./OverviewLight";
import { OpenPositionsWidget } from "./OpenPositionsWidget";
import { OpenPositionsWidgetLight } from "./OpenPositionsWidgetLight";
import { AppShowcase } from "./AppShowcase";
import { ClosedTradesWidget } from "./ClosedTradesWidget";
import { ClosedTradesWidgetLight } from "./ClosedTradesWidgetLight";
import { SessionSummaryCard } from "./SessionSummaryCard";
import { SessionSummaryCardLight } from "./SessionSummaryCardLight";
import { ChartPanelDemo } from "./ChartPanelDemo";
import { ChartPanelDemoLight } from "./ChartPanelDemoLight";
import { TicketPanelDemo } from "./TicketPanelDemo";
import { TicketPanelDemoLight } from "./TicketPanelDemoLight";
import { ScoreboardCard } from "./ScoreboardCard";
import { ScoreboardCardLight } from "./ScoreboardCardLight";
import { LightCardsSequence } from "./LightCardsSequence";

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
        id="OverviewLight"
        component={OverviewLight}
        durationInFrames={720}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{}}
      />
      <Composition
        id="OpenPositionsWidget"
        component={OpenPositionsWidget}
        durationInFrames={300}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{}}
      />
      <Composition
        id="OpenPositionsWidgetLight"
        component={OpenPositionsWidgetLight}
        durationInFrames={300}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{}}
      />
      <Composition
        id="ClosedTradesWidget"
        component={ClosedTradesWidget}
        durationInFrames={300}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{}}
      />
      <Composition
        id="ClosedTradesWidgetLight"
        component={ClosedTradesWidgetLight}
        durationInFrames={300}
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
        id="SessionSummaryCardLight"
        component={SessionSummaryCardLight}
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
        id="ChartPanelDemoLight"
        component={ChartPanelDemoLight}
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
      <Composition
        id="TicketPanelDemoLight"
        component={TicketPanelDemoLight}
        durationInFrames={300}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{}}
      />
      <Composition
        id="ScoreboardCard"
        component={ScoreboardCard}
        durationInFrames={300}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{}}
      />
      <Composition
        id="ScoreboardCardLight"
        component={ScoreboardCardLight}
        durationInFrames={300}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{}}
      />
      <Composition
        id="LightCardsSequence"
        component={LightCardsSequence}
        durationInFrames={1210}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{}}
      />
    </>
  );
};
