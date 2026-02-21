import { useCallback, useEffect, useMemo, useRef } from 'react';
import PositionBracketModal from '../PositionBracketModal/PositionBracketModal';
import { updatePositionBrackets as updateBackendPositionBrackets } from '../../integration/positionsApi';
import { appendTimeline, buildTimelineEvent, getLatestMarksByPair } from '../CandleChart/utils/candles';
import { fmtPrice } from '../../utils/formatters';
import {
  getEstimatedNetPnl,
  getPositionMarkPrice,
  parseOptionalPriceInput,
  validateBracketPrices,
} from '../../utils/trading';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  closeBracketEditor,
  setSession,
  updateBracketEditor,
} from '../../store/slices/sessionSlice';
import type { Candle, LocalPosition } from '../../types/domain';

interface BracketPnlResult {
  status: 'valid' | 'invalid' | 'empty';
  pnl: number | null;
}

interface PositionBracketPnlPreview {
  takeProfit: BracketPnlResult;
  stopLoss: BracketPnlResult;
}

export default function PositionBracketEditor() {
  const dispatch = useAppDispatch();
  const session = useAppSelector((s) => s.session.session);
  const positionBracketEditor = useAppSelector((s) => s.session.positionBracketEditor);
  const datasets = useAppSelector((s) => s.chart.datasets);
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const editingPosition = useMemo(
    () =>
      session.positions.find((item) => item.id === positionBracketEditor.positionId) ?? null,
    [session.positions, positionBracketEditor.positionId],
  );

  useEffect(() => {
    if (!positionBracketEditor.isOpen) {
      return;
    }
    if (editingPosition) {
      return;
    }
    dispatch(closeBracketEditor());
  }, [dispatch, editingPosition, positionBracketEditor.isOpen]);

  const marksByPair = useMemo(() => getLatestMarksByPair(datasets), [datasets]);
  const editingPositionCurrentPrice = useMemo(() => {
    if (!editingPosition) {
      return null;
    }
    return getPositionMarkPrice(editingPosition, marksByPair, null);
  }, [editingPosition, marksByPair]);

  const title = useMemo(() => {
    if (
      Number.isFinite(Number(editingPositionCurrentPrice)) &&
      Number(editingPositionCurrentPrice) > 0
    ) {
      return `Configure TP/SL • $${fmtPrice(editingPositionCurrentPrice)}`;
    }
    return 'Configure TP/SL';
  }, [editingPositionCurrentPrice]);

  const canDelete = Boolean(
    editingPosition &&
      (editingPosition.takeProfit !== null || editingPosition.stopLoss !== null),
  );

  const positionBracketPnlPreview = useMemo<PositionBracketPnlPreview>(() => {
    const parseTargetPrice = (
      value: unknown,
    ): { status: 'empty' | 'invalid' | 'valid'; value: number | null } => {
      const trimmed = String(value ?? '').trim();
      if (trimmed.length === 0) {
        return { status: 'empty', value: null };
      }
      const parsed = Number(trimmed);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return { status: 'invalid', value: null };
      }
      return { status: 'valid', value: parsed };
    };

    if (!editingPosition) {
      return {
        takeProfit: { status: 'empty', pnl: null },
        stopLoss: { status: 'empty', pnl: null },
      };
    }

    const takeProfitTarget = parseTargetPrice(positionBracketEditor.takeProfit);
    const stopLossTarget = parseTargetPrice(positionBracketEditor.stopLoss);

    const takeProfitPnl =
      takeProfitTarget.status === 'valid'
        ? getEstimatedNetPnl({
            side: editingPosition.side,
            entryPrice: editingPosition.entryPrice,
            qty: editingPosition.qty,
            exitPrice: takeProfitTarget.value!,
          })
        : null;
    const stopLossPnl =
      stopLossTarget.status === 'valid'
        ? getEstimatedNetPnl({
            side: editingPosition.side,
            entryPrice: editingPosition.entryPrice,
            qty: editingPosition.qty,
            exitPrice: stopLossTarget.value!,
          })
        : null;

    return {
      takeProfit: { status: takeProfitTarget.status, pnl: takeProfitPnl },
      stopLoss: { status: stopLossTarget.status, pnl: stopLossPnl },
    };
  }, [editingPosition, positionBracketEditor.takeProfit, positionBracketEditor.stopLoss]);

  const closeEditor = useCallback(() => {
    dispatch(closeBracketEditor());
  }, [dispatch]);

  const updateField = useCallback(
    (field: 'takeProfit' | 'stopLoss', value: string) => {
      dispatch(updateBracketEditor({ [field]: value, error: '' }));
    },
    [dispatch],
  );

  const getLatestCandleForPair = useCallback(
    (pairId: string, fallbackPosition: LocalPosition): Candle => {
      const series = datasets[pairId] ?? [];
      if (Array.isArray(series) && series.length > 0) {
        return series[series.length - 1]!;
      }

      const fallbackPrice = Number(fallbackPosition.entryPrice) || 0;
      return {
        index: session.replayIndex,
        timestamp: Date.now(),
        open: fallbackPrice,
        high: fallbackPrice,
        low: fallbackPrice,
        close: fallbackPrice,
        volume: 0,
      };
    },
    [datasets, session.replayIndex],
  );

  const savePositionBrackets = useCallback(async () => {
    if (!editingPosition) {
      closeEditor();
      return;
    }

    const parsedTakeProfit = parseOptionalPriceInput(positionBracketEditor.takeProfit, 'Take-profit');
    if (parsedTakeProfit.error) {
      dispatch(updateBracketEditor({ error: parsedTakeProfit.error }));
      return;
    }

    const parsedStopLoss = parseOptionalPriceInput(positionBracketEditor.stopLoss, 'Stop-loss');
    if (parsedStopLoss.error) {
      dispatch(updateBracketEditor({ error: parsedStopLoss.error }));
      return;
    }

    const takeProfit = parsedTakeProfit.value;
    const stopLoss = parsedStopLoss.value;
    const validationError = validateBracketPrices(
      editingPosition.side,
      editingPosition.entryPrice,
      stopLoss,
      takeProfit,
    );
    if (validationError) {
      dispatch(updateBracketEditor({ error: validationError }));
      return;
    }

    const didChange =
      editingPosition.takeProfit !== takeProfit || editingPosition.stopLoss !== stopLoss;
    if (!didChange) {
      closeEditor();
      return;
    }

    if (editingPosition.backendPositionId) {
      try {
        await updateBackendPositionBrackets(editingPosition.backendPositionId, takeProfit, stopLoss);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to update TP/SL on backend.';
        dispatch(updateBracketEditor({ error: message }));
        return;
      }
    }

    const currentSession = sessionRef.current;
    const position = currentSession.positions.find((item) => item.id === editingPosition.id);
    if (!position) {
      closeEditor();
      return;
    }

    let next = {
      ...currentSession,
      positions: currentSession.positions.map((item) =>
        item.id === position.id ? { ...item, stopLoss, takeProfit } : item,
      ),
    };

    const latestCandle = getLatestCandleForPair(position.pair, position);
    const bracketsLabel = `${takeProfit === null ? '-' : fmtPrice(takeProfit)}/${stopLoss === null ? '-' : fmtPrice(stopLoss)}`;
    next = appendTimeline(
      next,
      buildTimelineEvent(
        latestCandle.index,
        latestCandle.timestamp,
        `${position.pair} position #${position.id} TP/SL updated to ${bracketsLabel}.`,
      ),
    );

    dispatch(setSession(next));
    closeEditor();
  }, [
    closeEditor,
    dispatch,
    editingPosition,
    getLatestCandleForPair,
    positionBracketEditor.stopLoss,
    positionBracketEditor.takeProfit,
  ]);

  const deletePositionBrackets = useCallback(async () => {
    if (!editingPosition) {
      closeEditor();
      return;
    }

    if (editingPosition.stopLoss === null && editingPosition.takeProfit === null) {
      closeEditor();
      return;
    }

    if (editingPosition.backendPositionId) {
      try {
        await updateBackendPositionBrackets(editingPosition.backendPositionId, null, null);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to remove TP/SL on backend.';
        dispatch(updateBracketEditor({ error: message }));
        return;
      }
    }

    const currentSession = sessionRef.current;
    const position = currentSession.positions.find((item) => item.id === editingPosition.id);
    if (!position) {
      closeEditor();
      return;
    }
    if (position.stopLoss === null && position.takeProfit === null) {
      closeEditor();
      return;
    }

    let next = {
      ...currentSession,
      positions: currentSession.positions.map((item) =>
        item.id === position.id ? { ...item, stopLoss: null, takeProfit: null } : item,
      ),
    };

    const latestCandle = getLatestCandleForPair(position.pair, position);
    next = appendTimeline(
      next,
      buildTimelineEvent(
        latestCandle.index,
        latestCandle.timestamp,
        `${position.pair} position #${position.id} TP/SL removed.`,
      ),
    );

    dispatch(setSession(next));
    closeEditor();
  }, [closeEditor, dispatch, editingPosition, getLatestCandleForPair]);

  return (
    <PositionBracketModal
      isOpen={positionBracketEditor.isOpen}
      title={title}
      editingPosition={editingPosition}
      positionBracketEditor={positionBracketEditor}
      positionBracketPnlPreview={positionBracketPnlPreview}
      canDelete={canDelete}
      onClose={closeEditor}
      onSave={savePositionBrackets}
      onDelete={deletePositionBrackets}
      onFieldChange={updateField}
    />
  );
}
