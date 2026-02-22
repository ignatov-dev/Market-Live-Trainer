import { useCallback, useEffect, useMemo, useRef } from 'react';
import './styles.css';
import HeroHeader from './components/HeroHeader/HeroHeader';
import ChartPanel from './components/ChartPanel/ChartPanel';
import TicketPanel from './components/TicketPanel/TicketPanel';
import AnalyticsPanel from './components/AnalyticsPanel/AnalyticsPanel';
import CoachPanel from './components/CoachPanel/CoachPanel';
import ClosedTradesPanel from './components/ClosedTradesPanel/ClosedTradesPanel';
import NewsPanel from './components/NewsPanel/NewsPanel';
import TimelinePanel from './components/TimelinePanel/TimelinePanel';
import OpenPositionsPanel from './components/OpenPositionsPanel/OpenPositionsPanel';
import PatternNotifications from './components/PatternNotifications/PatternNotifications';
import LayoutGrid from './components/LayoutGrid/LayoutGrid';
import { PAIRS } from './constants/market';
import { getLatestMarksByPair } from './components/CandleChart/utils/candles';
import { getMetrics, defaultTicket } from './utils/trading';
import { INITIAL_BALANCE, FEE_RATE } from './constants/trading';
import { useAppDispatch, useAppSelector } from './store/hooks';
import { setSession, setTicket } from './store/slices/sessionSlice';
import { setChartEndIndex, setChartMarkerTooltip } from './store/slices/chartSlice';
import { useAuth } from './providers/AuthProvider';
import type { Candle, Datasets, SessionMetrics } from './types/domain';
import { useChartDataLoader } from './components/ChartPanel/hooks/useChartDataLoader';
import { useSessionCandleEngine } from './hooks/useSessionCandleEngine';
import { usePatternNotifications } from './hooks/usePatternNotifications';
import { useBackendPositionSyncController } from './hooks/useBackendPositionSyncController';
import { useBackendAccountController } from './hooks/useBackendAccountController';
import { useExtensionSync } from './hooks/useExtensionSync';

export default function App() {
  const dispatch = useAppDispatch();

  // ---------------------------------------------------------------------------
  // Redux state — chart
  // ---------------------------------------------------------------------------
  const pair = useAppSelector((s) => s.chart.pair);
  const timeframeId = useAppSelector((s) => s.chart.timeframeId);
  const datasets = useAppSelector((s) => s.chart.datasets);
  const newsByPair = useAppSelector((s) => s.chart.newsByPair);
  const backendClosedPositions = useAppSelector((s) => s.backend.backendClosedPositions);
  const backendPnlByPositionId = useAppSelector((s) => s.backend.backendPnlByPositionId);
  const backendAccount = useAppSelector((s) => s.backend.backendAccount);

  // ---------------------------------------------------------------------------
  // Redux state — session
  // ---------------------------------------------------------------------------
  const session = useAppSelector((s) => s.session.session);

  const {
    backendAuthToken,
    hasBackendAuth,
    hasNeonAuthUrl,
    authMode,
    authNameInput,
    authEmailInput,
    authPasswordInput,
    authSessionEmail,
    authError,
    isAuthSubmitting,
    setAuthMode,
    setAuthNameInput,
    setAuthEmailInput,
    setAuthPasswordInput,
    handleAuthSubmit,
    handleAuthSignOut,
  } = useAuth();

  // ---------------------------------------------------------------------------
  // Refs — non-serializable / stale-closure mitigation
  // ---------------------------------------------------------------------------
  const sessionRef = useRef(session);
  const datasetsRef = useRef<Datasets>(datasets);
  const currentCandleRef = useRef<Candle | null>(null);
  sessionRef.current = session;
  datasetsRef.current = datasets;

  const backendPositionIdsRef = useRef<Map<string, string>>(new Map());
  const backendOpenSyncInFlightRef = useRef<Set<string>>(new Set());
  const backendCloseSyncInFlightRef = useRef<Set<string>>(new Set());
  const backendCloseSyncedTradeIdsRef = useRef<Set<string>>(new Set());
  const backendClosedLocalIdsRef = useRef<Set<string>>(new Set());

  // ---------------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------------
  const pairMeta = PAIRS.find((item) => item.id === pair) ?? PAIRS[0]!;
  const candles = useMemo(() => datasets[pair] ?? [], [datasets, pair]);
  const newsItems = newsByPair[pair] ?? [];
  const hasCandles = candles.length > 0;

  const fallbackCandle = useMemo<Candle>(
    () => ({ index: 0, timestamp: Date.now(), open: 0, high: 0, low: 0, close: 0, volume: 0 }),
    [],
  );

  const safeReplayIndex = hasCandles
    ? Math.max(0, Math.min(session.replayIndex, candles.length - 1))
    : 0;
  
  const activeIndex = hasBackendAuth && hasCandles ? candles.length - 1 : safeReplayIndex;
  const currentCandle = hasCandles ? (candles[activeIndex] ?? fallbackCandle) : fallbackCandle;

  currentCandleRef.current = currentCandle;

  const marksByPair = useMemo(() => getLatestMarksByPair(datasets), [datasets]);
  const currentInitialBalance = useMemo(() => {
    const backendInitial = Number(backendAccount?.initialBalance);
    return Number.isFinite(backendInitial) && backendInitial > 0
      ? backendInitial
      : INITIAL_BALANCE;
  }, [backendAccount?.initialBalance]);

  const localMetrics = useMemo(() => getMetrics(session, marksByPair), [session, marksByPair]);
  const metrics = useMemo<SessionMetrics>(() => {
    if (!hasBackendAuth) {
      return localMetrics;
    }

    const closedPnls = backendClosedPositions
      .map((position) => Number(position.closePnl))
      .filter((value): value is number => Number.isFinite(value));
    const closedNetPnl = closedPnls.reduce((sum, value) => sum + value, 0);

    const unrealized = Object.values(backendPnlByPositionId).reduce((sum, snapshot) => {
      const value = Number(snapshot.unrealizedNetPnl);
      return Number.isFinite(value) ? sum + value : sum;
    }, 0);
    const openPnlInclFees = Object.values(backendPnlByPositionId).reduce((sum, snapshot) => {
      const value = Number(snapshot.unrealizedTotalNetPnl);
      if (Number.isFinite(value)) {
        return sum + value;
      }
      const fallback = Number(snapshot.unrealizedNetPnl);
      return Number.isFinite(fallback) ? sum + fallback : sum;
    }, 0);

    const accountInitialBalance = Number(backendAccount?.initialBalance);
    const accountCashBalance = Number(backendAccount?.cashBalance);
    const initialBalance = currentInitialBalance;
    const cashBalance = Number.isFinite(accountCashBalance)
      ? accountCashBalance
      : INITIAL_BALANCE + closedNetPnl;

    const equity = cashBalance + unrealized;
    const netPnl = equity - initialBalance;
    const realizedPnl = netPnl - openPnlInclFees;
    const grossProfit = closedPnls
      .filter((value) => value > 0)
      .reduce((sum, value) => sum + value, 0);
    const grossLossAbs = Math.abs(
      closedPnls
        .filter((value) => value < 0)
        .reduce((sum, value) => sum + value, 0),
    );
    const profitFactor = grossLossAbs === 0 ? null : grossProfit / grossLossAbs;
    const winRate =
      closedPnls.length === 0
        ? 0
        : (closedPnls.filter((value) => value > 0).length / closedPnls.length) * 100;

    return {
      ...localMetrics,
      unrealized,
      openPnlInclFees,
      realizedPnl,
      equity,
      netPnl,
      grossProfit,
      grossLossAbs,
      profitFactor,
      winRate,
      avgR: null,
      avgHold: null,
    };
  }, [backendAccount, backendClosedPositions, backendPnlByPositionId, hasBackendAuth, localMetrics]);
  const analyticsClosedTradesCount = hasBackendAuth
    ? backendClosedPositions.length
    : session.closedTrades.length;

  useChartDataLoader({
    pair,
    timeframeId,
    coinbaseProduct: pairMeta.coinbaseProduct,
    coinPaprikaId: pairMeta.coinPaprikaId,
    pairLabel: pairMeta.label,
  });
  useSessionCandleEngine({ datasets, timeframeId, pair });
  const {
    patternNotifications,
    dismissPatternNotification,
  } = usePatternNotifications({
    candles,
    pair,
    timeframeId,
    symbol: pairMeta.coinbaseProduct,
  });

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  const getLatestCandleForPair = useCallback(
    (pairId: string): Candle => {
      const series = datasetsRef.current[pairId] ?? [];
      if (Array.isArray(series) && series.length > 0) {
        return series[series.length - 1]!;
      }
      return currentCandleRef.current ?? fallbackCandle;
    },
    [fallbackCandle],
  );

  useBackendPositionSyncController({
    backendAuthToken,
    hasBackendAuth,
    session,
    sessionRef,
    getLatestCandleForPair,
    backendPositionIdsRef,
    backendOpenSyncInFlightRef,
    backendCloseSyncInFlightRef,
    backendCloseSyncedTradeIdsRef,
    backendClosedLocalIdsRef,
  });
  useBackendAccountController({
    backendAuthToken,
    hasBackendAuth,
  });
  useExtensionSync(session, currentInitialBalance, FEE_RATE);

  // ---------------------------------------------------------------------------
  // Effects
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const latestIndex = Math.max(0, candles.length - 1);
    const currentSession = sessionRef.current;
    if (currentSession.replayIndex !== latestIndex) {
      dispatch(setSession({ ...currentSession, replayIndex: latestIndex }));
    }
    dispatch(setTicket(defaultTicket(candles[latestIndex]?.close)));
    dispatch(setChartEndIndex(null));
    dispatch(setChartMarkerTooltip(null));
  }, [dispatch, pair, timeframeId]);

  useEffect(() => {
    if (!hasBackendAuth) {
      return;
    }

    const backendCashBalance = Number(backendAccount?.cashBalance);
    if (!Number.isFinite(backendCashBalance)) {
      return;
    }

    const currentSession = sessionRef.current;
    if (Math.abs(currentSession.balance - backendCashBalance) < 1e-9) {
      return;
    }

    dispatch(setSession({ ...currentSession, balance: backendCashBalance }));
  }, [backendAccount?.cashBalance, dispatch, hasBackendAuth]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="app-shell">
      <HeroHeader
        hasBackendAuth={hasBackendAuth}
        authMode={authMode}
        authNameInput={authNameInput}
        authEmailInput={authEmailInput}
        authPasswordInput={authPasswordInput}
        authError={authError}
        isAuthSubmitting={isAuthSubmitting}
        hasNeonAuthUrl={hasNeonAuthUrl}
        onModeChange={setAuthMode}
        onNameChange={setAuthNameInput}
        onEmailChange={setAuthEmailInput}
        onPasswordChange={setAuthPasswordInput}
        onAuthSubmit={handleAuthSubmit}
        metrics={metrics}
        session={session}
        newsItems={newsItems}
        pairLabel={pairMeta.label}
        authSessionEmail={authSessionEmail}
        onSignOut={handleAuthSignOut}
        authToken={backendAuthToken}
      />

      <LayoutGrid>
        <ChartPanel
          candles={candles}
          currentCandle={currentCandle}
        />

        <TicketPanel />

        <OpenPositionsPanel />

        <AnalyticsPanel
          metrics={metrics}
          session={session}
          closedTradesCount={analyticsClosedTradesCount}
        />

        <CoachPanel />

        <ClosedTradesPanel />

        <NewsPanel />

        <TimelinePanel />

      </LayoutGrid>

      <PatternNotifications
        notifications={patternNotifications}
        onDismiss={dismissPatternNotification}
      />
    </div>
  );
}
