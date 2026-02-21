import { useCallback, useEffect, useRef } from 'react';
import {
  createPosition as createBackendPosition,
  closePosition as closeBackendPosition,
  listClosedPositions as listBackendClosedPositions,
  listPositions as listBackendPositions,
} from '../integration/positionsApi';
import { PAIR_TO_PRODUCT } from '../constants/market';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { setSession } from '../store/slices/sessionSlice';
import {
  setBackendPnlEntry,
  setBackendPnlByPositionId,
  setBackendHydrated,
  incrementSyncRevision,
  setLoadingClosedPositions,
  setBackendError,
  setBackendClosedPositions,
} from '../store/slices/backendSlice';
import { useWebsocket } from '../providers/WebsocketProvider';
import {
  closePosition as closePositionLocal,
  getPlannedRMultiple,
  buildBackendPositionKey,
  resolvePairFromBackendSymbol,
} from '../utils/trading';
import type { MutableRefObject } from 'react';
import type { Candle, LocalPosition, Session } from '../types/domain';
import type { PositionClosedEvent } from '../integration/usePositionEvents';
import type { PositionPnlEvent } from '../integration/usePositionPnlEvents';

interface Params {
  backendAuthToken: string | null;
  hasBackendAuth: boolean;
  session: Session;
  sessionRef: MutableRefObject<Session>;
  getLatestCandleForPair: (pairId: string) => Candle;
  backendPositionIdsRef: MutableRefObject<Map<string, string>>;
  backendOpenSyncInFlightRef: MutableRefObject<Set<string>>;
  backendCloseSyncInFlightRef: MutableRefObject<Set<string>>;
  backendCloseSyncedTradeIdsRef: MutableRefObject<Set<string>>;
  backendClosedLocalIdsRef: MutableRefObject<Set<string>>;
}

export function useBackendPositionSyncController({
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
}: Params): void {
  const dispatch = useAppDispatch();
  const { subscribeClosedEvents, subscribePnlEvents } = useWebsocket();

  const backendSyncRevision = useAppSelector((s) => s.backend.backendSyncRevision);
  const backendPnlByPositionId = useAppSelector((s) => s.backend.backendPnlByPositionId);
  const isBackendHydrated = useAppSelector((s) => s.backend.isBackendHydrated);

  const backendPnlRef = useRef(backendPnlByPositionId);
  backendPnlRef.current = backendPnlByPositionId;

  const handleBackendPositionClosed = useCallback(
    ({ position }: PositionClosedEvent) => {
      const backendPositionId = position.id;
      if (typeof backendPositionId !== 'string' || backendPositionId.length === 0) {
        return;
      }

      const forcedPrice = Number(position.closePrice);
      const closeReasonRaw = position.closeReason;
      const closeReason =
        typeof closeReasonRaw === 'string' && closeReasonRaw.length > 0
          ? `backend ${closeReasonRaw.replace('_', '-')}`
          : 'backend close';

      const currentSession = sessionRef.current;
      const localPosition = currentSession.positions.find((item) => {
        if (item.backendPositionId === backendPositionId) {
          return true;
        }
        const candidateBackendId = backendPositionIdsRef.current.get(String(item.id));
        return candidateBackendId === backendPositionId;
      });
      if (!localPosition) {
        return;
      }

      backendClosedLocalIdsRef.current.add(String(localPosition.id));
      const closeCandle = getLatestCandleForPair(localPosition.pair);
      const newSession = closePositionLocal(
        currentSession,
        closeCandle,
        localPosition.id,
        closeReason,
        Number.isFinite(forcedPrice) && forcedPrice > 0 ? forcedPrice : null,
      );
      dispatch(setSession(newSession));
    },
    [
      backendClosedLocalIdsRef,
      backendPositionIdsRef,
      dispatch,
      getLatestCandleForPair,
      sessionRef,
    ],
  );

  const handleBackendPositionsPnl = useCallback(
    ({ position }: PositionPnlEvent) => {
      const backendPositionId = position.positionId;
      if (backendPositionId.length === 0) {
        return;
      }

      const unrealizedNetPnl = position.unrealizedNetPnl;
      const unrealizedTotalNetPnl = Number.isFinite(position.unrealizedTotalNetPnl)
        ? position.unrealizedTotalNetPnl
        : position.unrealizedNetPnl;
      const markPrice = position.markPrice;
      if (
        !Number.isFinite(unrealizedNetPnl) ||
        !Number.isFinite(unrealizedTotalNetPnl) ||
        !Number.isFinite(markPrice) ||
        markPrice <= 0
      ) {
        return;
      }

      const current = backendPnlRef.current[backendPositionId];
      if (
        current &&
        Number(current.unrealizedNetPnl) === unrealizedNetPnl &&
        Number(current.unrealizedTotalNetPnl) === unrealizedTotalNetPnl &&
        Number(current.markPrice) === markPrice
      ) {
        return;
      }

      dispatch(
        setBackendPnlEntry({
          positionId: backendPositionId,
          entry: { unrealizedNetPnl, unrealizedTotalNetPnl, markPrice },
        }),
      );
    },
    [dispatch],
  );

  useEffect(() => {
    return subscribeClosedEvents(handleBackendPositionClosed);
  }, [handleBackendPositionClosed, subscribeClosedEvents]);

  useEffect(() => {
    return subscribePnlEvents(handleBackendPositionsPnl);
  }, [handleBackendPositionsPnl, subscribePnlEvents]);

  useEffect(() => {
    if (!hasBackendAuth) {
      dispatch(setBackendPnlByPositionId({}));
      backendPositionIdsRef.current.clear();
      backendOpenSyncInFlightRef.current.clear();
      backendCloseSyncInFlightRef.current.clear();
      backendCloseSyncedTradeIdsRef.current.clear();
      backendClosedLocalIdsRef.current.clear();
    }
  }, [
    backendCloseSyncedTradeIdsRef,
    backendCloseSyncInFlightRef,
    backendClosedLocalIdsRef,
    backendOpenSyncInFlightRef,
    backendPositionIdsRef,
    dispatch,
    hasBackendAuth,
  ]);

  useEffect(() => {
    const isPristineSession =
      session.sequence <= 1 &&
      session.positions.length === 0 &&
      session.pendingOrders.length === 0 &&
      session.closedTrades.length === 0;
    if (!isPristineSession) {
      return;
    }

    backendPositionIdsRef.current.clear();
    backendOpenSyncInFlightRef.current.clear();
    backendCloseSyncInFlightRef.current.clear();
    backendCloseSyncedTradeIdsRef.current.clear();
    backendClosedLocalIdsRef.current.clear();
  }, [
    backendCloseSyncedTradeIdsRef,
    backendCloseSyncInFlightRef,
    backendClosedLocalIdsRef,
    backendOpenSyncInFlightRef,
    backendPositionIdsRef,
    session.closedTrades.length,
    session.pendingOrders.length,
    session.positions.length,
    session.sequence,
  ]);

  useEffect(() => {
    const openBackendIds = new Set(
      session.positions
        .map((position) => {
          if (
            typeof position.backendPositionId === 'string' &&
            position.backendPositionId.length > 0
          ) {
            return position.backendPositionId;
          }
          return null;
        })
        .filter((id): id is string => id !== null),
    );

    const entries = Object.entries(backendPnlByPositionId);
    if (entries.length === 0) {
      return;
    }

    let changed = false;
    const next: typeof backendPnlByPositionId = {};
    for (const [id, snapshot] of entries) {
      if (openBackendIds.has(id)) {
        next[id] = snapshot;
        continue;
      }
      changed = true;
    }

    if (changed) {
      dispatch(setBackendPnlByPositionId(next));
    }
  }, [backendPnlByPositionId, dispatch, session.positions]);

  useEffect(() => {
    if (!hasBackendAuth) {
      return;
    }

    let isCancelled = false;

    async function hydrateBackendOpenPositions() {
      try {
        const backendOpenPositions = await listBackendPositions('open');
        if (isCancelled || !Array.isArray(backendOpenPositions)) {
          return;
        }

        const backendByKey = new Map<string, typeof backendOpenPositions>();
        for (const backendPosition of backendOpenPositions) {
          const key = buildBackendPositionKey(
            backendPosition.symbol,
            backendPosition.side,
            backendPosition.quantity,
            backendPosition.entryPrice,
            backendPosition.takeProfit,
            backendPosition.stopLoss,
          );
          const existing = backendByKey.get(key) ?? [];
          existing.push(backendPosition);
          backendByKey.set(key, existing);
        }

        const currentSession = sessionRef.current;
        if (!Array.isArray(currentSession.positions)) {
          return;
        }

        let changed = false;
        const matchedBackendIds = new Set<string>();
        const nextPositions = currentSession.positions.map((position) => {
          const localPositionId = String(position.id);

          if (
            typeof position.backendPositionId === 'string' &&
            position.backendPositionId.length > 0
          ) {
            backendPositionIdsRef.current.set(localPositionId, position.backendPositionId);
            matchedBackendIds.add(position.backendPositionId);
            return position;
          }

          const symbol = PAIR_TO_PRODUCT[position.pair];
          if (typeof symbol !== 'string' || symbol.length === 0) {
            return position;
          }

          const matchKey = buildBackendPositionKey(
            symbol,
            position.side,
            position.qty,
            position.entryPrice,
            position.takeProfit,
            position.stopLoss,
          );
          const bucket = backendByKey.get(matchKey);
          if (!Array.isArray(bucket) || bucket.length === 0) {
            return position;
          }

          const matchedBackendPosition = bucket.shift();
          if (!matchedBackendPosition) {
            return position;
          }

          backendPositionIdsRef.current.set(localPositionId, matchedBackendPosition.id);
          matchedBackendIds.add(matchedBackendPosition.id);
          changed = true;
          return {
            ...position,
            backendPositionId: matchedBackendPosition.id,
          };
        });

        const existingLocalIds = new Set(nextPositions.map((item) => String(item.id)));
        const importedBackendPositions: LocalPosition[] = [];

        for (const backendPosition of backendOpenPositions) {
          if (matchedBackendIds.has(backendPosition.id)) {
            continue;
          }

          const localPositionId = `backend:${backendPosition.id}`;
          if (existingLocalIds.has(localPositionId)) {
            continue;
          }

          const resolvedPair = resolvePairFromBackendSymbol(backendPosition.symbol);
          const qty = Number(backendPosition.quantity);
          const entryPrice = Number(backendPosition.entryPrice);

          if (
            !resolvedPair ||
            !Number.isFinite(qty) ||
            qty <= 0 ||
            !Number.isFinite(entryPrice) ||
            entryPrice <= 0
          ) {
            continue;
          }

          const stopLoss =
            backendPosition.stopLoss === null ? null : Number(backendPosition.stopLoss);
          const takeProfit =
            backendPosition.takeProfit === null ? null : Number(backendPosition.takeProfit);
          const openedAtTsCandidate = new Date(backendPosition.createdAt).getTime();
          const openedAtTs =
            Number.isFinite(openedAtTsCandidate) && openedAtTsCandidate > 0
              ? openedAtTsCandidate
              : Date.now();
          const riskAmount =
            stopLoss === null ? null : Math.abs(entryPrice - stopLoss) * qty;

          backendPositionIdsRef.current.set(localPositionId, backendPosition.id);
          importedBackendPositions.push({
            id: localPositionId as unknown as number,
            backendPositionId: backendPosition.id,
            pair: resolvedPair,
            side: backendPosition.side,
            qty,
            entryPrice,
            stopLoss,
            takeProfit,
            openedAtIndex: currentSession.replayIndex,
            openedAtTs,
            entryType: 'market',
            riskAmount,
            riskPct: null,
            plannedR: getPlannedRMultiple(
              backendPosition.side,
              entryPrice,
              stopLoss,
              takeProfit,
            ),
          });
          existingLocalIds.add(localPositionId);
        }

        if (!changed && importedBackendPositions.length === 0) {
          return;
        }

        dispatch(
          setSession({
            ...currentSession,
            positions: [...nextPositions, ...importedBackendPositions],
          }),
        );
      } catch (error) {
        if (!isCancelled) {
          console.error('Failed to hydrate backend positions', error);
        }
      } finally {
        if (!isCancelled) {
          dispatch(setBackendHydrated(true));
        }
      }
    }

    void hydrateBackendOpenPositions();

    return () => {
      isCancelled = true;
    };
  }, [backendAuthToken, backendPositionIdsRef, dispatch, hasBackendAuth, sessionRef]);

  useEffect(() => {
    if (!hasBackendAuth || !isBackendHydrated) {
      return;
    }

    let isCancelled = false;

    async function loadBackendClosedPositions() {
      dispatch(setLoadingClosedPositions(true));
      try {
        const closedPositions = await listBackendClosedPositions();
        if (isCancelled) {
          return;
        }

        dispatch(
          setBackendClosedPositions(Array.isArray(closedPositions) ? closedPositions : []),
        );
        dispatch(setBackendError(''));
      } catch (error) {
        if (!isCancelled) {
          dispatch(
            setBackendError(
              error instanceof Error ? error.message : 'Failed to load closed positions.',
            ),
          );
        }
      } finally {
        if (!isCancelled) {
          dispatch(setLoadingClosedPositions(false));
        }
      }
    }

    void loadBackendClosedPositions();

    return () => {
      isCancelled = true;
    };
  }, [
    backendAuthToken,
    backendSyncRevision,
    dispatch,
    hasBackendAuth,
    isBackendHydrated,
    session.closedTrades.length,
  ]);

  useEffect(() => {
    if (!hasBackendAuth || !isBackendHydrated) {
      return;
    }

    let isCancelled = false;

    async function syncOpenedPositions() {
      for (const position of sessionRef.current.positions) {
        if (isCancelled) {
          return;
        }

        const localPositionId = String(position.id);
        const persistedBackendPositionId =
          typeof position.backendPositionId === 'string' &&
          position.backendPositionId.length > 0
            ? position.backendPositionId
            : null;

        if (persistedBackendPositionId) {
          if (!backendPositionIdsRef.current.has(localPositionId)) {
            backendPositionIdsRef.current.set(localPositionId, persistedBackendPositionId);
          }
          continue;
        }

        if (backendPositionIdsRef.current.has(localPositionId)) {
          continue;
        }

        if (backendOpenSyncInFlightRef.current.has(localPositionId)) {
          continue;
        }

        const symbol = PAIR_TO_PRODUCT[position.pair];
        if (typeof symbol !== 'string' || symbol.length === 0) {
          continue;
        }

        backendOpenSyncInFlightRef.current.add(localPositionId);

        try {
          const created = await createBackendPosition({
            symbol,
            side: position.side,
            quantity: position.qty,
            entryPrice: position.entryPrice,
            takeProfit: position.takeProfit,
            stopLoss: position.stopLoss,
          });

          if (!isCancelled) {
            backendPositionIdsRef.current.set(localPositionId, created.id);
            const prev = sessionRef.current;
            dispatch(
              setSession({
                ...prev,
                positions: prev.positions.map((item) =>
                  String(item.id) === localPositionId
                    ? { ...item, backendPositionId: created.id }
                    : item,
                ),
              }),
            );
            dispatch(incrementSyncRevision());
          }
        } catch (error) {
          if (!isCancelled) {
            console.error('Failed to create backend position', error);
          }
        } finally {
          backendOpenSyncInFlightRef.current.delete(localPositionId);
        }
      }
    }

    void syncOpenedPositions();

    return () => {
      isCancelled = true;
    };
  }, [
    backendAuthToken,
    backendOpenSyncInFlightRef,
    backendPositionIdsRef,
    backendSyncRevision,
    dispatch,
    hasBackendAuth,
    isBackendHydrated,
    session.positions,
    sessionRef,
  ]);

  useEffect(() => {
    if (!hasBackendAuth) {
      return undefined;
    }

    let isCancelled = false;

    async function syncClosedPositions() {
      for (const trade of sessionRef.current.closedTrades) {
        if (isCancelled) {
          return;
        }

        const tradeId = String(trade.id);
        if (backendCloseSyncedTradeIdsRef.current.has(tradeId)) {
          continue;
        }

        if (backendCloseSyncInFlightRef.current.has(tradeId)) {
          continue;
        }

        const localPositionId = String(trade.positionId ?? '');
        if (localPositionId.length === 0) {
          backendCloseSyncedTradeIdsRef.current.add(tradeId);
          continue;
        }

        if (backendClosedLocalIdsRef.current.has(localPositionId)) {
          backendClosedLocalIdsRef.current.delete(localPositionId);
          backendPositionIdsRef.current.delete(localPositionId);
          backendCloseSyncedTradeIdsRef.current.add(tradeId);
          dispatch(incrementSyncRevision());
          continue;
        }

        const backendPositionIdFromTrade =
          typeof trade.backendPositionId === 'string' && trade.backendPositionId.length > 0
            ? trade.backendPositionId
            : null;
        const backendPositionId =
          backendPositionIdFromTrade ?? backendPositionIdsRef.current.get(localPositionId);
        if (!backendPositionId) {
          continue;
        }

        backendCloseSyncInFlightRef.current.add(tradeId);

        try {
          await closeBackendPosition(backendPositionId, trade.exitPrice);
          if (!isCancelled) {
            backendPositionIdsRef.current.delete(localPositionId);
            backendCloseSyncedTradeIdsRef.current.add(tradeId);
            dispatch(incrementSyncRevision());
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          if (
            errorMessage.includes('already closed') ||
            errorMessage.includes('not found')
          ) {
            backendPositionIdsRef.current.delete(localPositionId);
            backendCloseSyncedTradeIdsRef.current.add(tradeId);
            dispatch(incrementSyncRevision());
          } else if (!isCancelled) {
            console.error('Failed to close backend position', error);
          }
        } finally {
          backendCloseSyncInFlightRef.current.delete(tradeId);
        }
      }
    }

    void syncClosedPositions();

    return () => {
      isCancelled = true;
    };
  }, [
    backendAuthToken,
    backendCloseSyncedTradeIdsRef,
    backendCloseSyncInFlightRef,
    backendClosedLocalIdsRef,
    backendPositionIdsRef,
    backendSyncRevision,
    hasBackendAuth,
    session.closedTrades,
    sessionRef,
  ]);

  useEffect(() => {
    if (!hasBackendAuth) {
      return undefined;
    }

    const hasUnsyncedOpen = session.positions.some(
      (position) =>
        typeof position.backendPositionId !== 'string' ||
        position.backendPositionId.length === 0,
    );
    const hasUnsyncedClosed = session.closedTrades.some(
      (trade) => !backendCloseSyncedTradeIdsRef.current.has(String(trade.id)),
    );

    if (!hasUnsyncedOpen && !hasUnsyncedClosed) {
      return undefined;
    }

    const retryTimer = window.setTimeout(() => {
      dispatch(incrementSyncRevision());
    }, 5000);

    return () => {
      window.clearTimeout(retryTimer);
    };
  }, [
    backendCloseSyncedTradeIdsRef,
    backendSyncRevision,
    dispatch,
    hasBackendAuth,
    session.closedTrades,
    session.positions,
  ]);
}
