import { useEffect, useMemo } from 'react';
import styles from './OpenPositionsList.module.css';
import { getLatestMarksByPair } from '../../CandleChart/utils/candles';
import { getPositionMarkPrice, getDirectionMultiplier } from '../../../utils/trading';
import { FEE_RATE } from '../../../constants/trading';
import { useAppDispatch, useAppSelector } from '../../../store/hooks';
import { closeBracketEditor, openBracketEditor } from '../../../store/slices/sessionSlice';
import PositionBracketEditor from '../../PositionBracketEditor/PositionBracketEditor';
import { useOpenPositionsController } from '../hooks/useOpenPositionsController';
import { fmtPrice, fmtNumber, fmtSigned, getPairBaseSymbol } from '../../../utils/formatters';

export default function OpenPositionsList() {
  const dispatch = useAppDispatch();
  const positions = useAppSelector((s) => s.session.session.positions);
  const datasets = useAppSelector((s) => s.chart.datasets);
  const backendPnlByPositionId = useAppSelector((s) => s.backend.backendPnlByPositionId);
  const positionBracketEditor = useAppSelector((s) => s.session.positionBracketEditor);
  const marksByPair = useMemo(() => getLatestMarksByPair(datasets), [datasets]);
  const { closePositionNow } = useOpenPositionsController();
  const hasPositions = positions.length > 0;

  useEffect(() => {
    if (!hasPositions && positionBracketEditor.isOpen) {
      dispatch(closeBracketEditor());
    }
  }, [dispatch, hasPositions, positionBracketEditor.isOpen]);

  const handleOpenBracketEditor = (positionId: number) => {
    const position = positions.find((item) => item.id === positionId);
    if (!position) return;
    dispatch(
      openBracketEditor({
        positionId: position.id,
        stopLoss: position.stopLoss === null ? '' : String(position.stopLoss),
        takeProfit: position.takeProfit === null ? '' : String(position.takeProfit),
      }),
    );
  };

  if (!hasPositions) return null;

  return (
    <div className={styles.subpanel}>
      <div className={styles.tableWrap}>
        <table aria-label="Open positions" className={styles.table}>
          <colgroup>
            <col className={styles.colSide} />
            <col className={styles.colQty} />
            <col className={styles.colEntry} />
            <col className={styles.colMark} />
            <col className={styles.colPnl} />
            <col className={styles.colTp} />
            <col className={styles.colSl} />
            <col className={styles.colAction} />
          </colgroup>
          <thead>
            <tr>
              <th>Side</th>
              <th>Quantity</th>
              <th>Entry</th>
              <th>Mark</th>
              <th>PnL (fees)</th>
              <th>TP</th>
              <th>SL</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((position) => {
              const backendPositionId = typeof position.backendPositionId === 'string' && position.backendPositionId.length > 0
                ? position.backendPositionId : null;
              const backendSnapshot = backendPositionId ? backendPnlByPositionId[backendPositionId] : null;
              const fallbackMarkPrice = getPositionMarkPrice(position, marksByPair, position.entryPrice) ?? position.entryPrice;
              const markPrice = Number.isFinite(Number(backendSnapshot?.markPrice))
                ? Number(backendSnapshot!.markPrice) : fallbackMarkPrice;
              const estimatedCloseFee = markPrice * position.qty * FEE_RATE;
              const openFee = position.entryPrice * position.qty * FEE_RATE;
              const fallbackUnrealizedNetEstimated =
                (markPrice - position.entryPrice) * position.qty * getDirectionMultiplier(position.side) - estimatedCloseFee;
              const unrealizedNetEstimated = Number.isFinite(Number(backendSnapshot?.unrealizedNetPnl))
                ? Number(backendSnapshot!.unrealizedNetPnl) : fallbackUnrealizedNetEstimated;
              const fallbackTotalNetEstimated = unrealizedNetEstimated - openFee;
              const totalNetEstimated = Number.isFinite(Number(backendSnapshot?.unrealizedTotalNetPnl))
                ? Number(backendSnapshot!.unrealizedTotalNetPnl)
                : fallbackTotalNetEstimated;
              const qtyLabel = `${fmtNumber(position.qty, 3)} ${getPairBaseSymbol(position.pair)}`;

              return (
                <tr key={position.id}>
                  <td className={position.side === 'long' ? styles.long : styles.short}>{position.side}</td>
                  <td>{qtyLabel}</td>
                  <td>${fmtPrice(position.entryPrice)}</td>
                  <td>${fmtPrice(markPrice)}</td>
                  <td className={totalNetEstimated >= 0 ? styles.pos : styles.neg}>
                    {fmtSigned(totalNetEstimated)}
                  </td>
                  <td>
                    <button
                      type="button"
                      className={styles.bracketBtn}
                      onClick={() => handleOpenBracketEditor(position.id)}
                      aria-label={`Configure brackets for position ${position.id}`}
                    >
                      {position.takeProfit !== null ? `$${fmtPrice(position.takeProfit)}` : '-'}
                    </button>
                  </td>
                  <td>
                    <button
                      type="button"
                      className={styles.bracketBtn}
                      onClick={() => handleOpenBracketEditor(position.id)}
                      aria-label={`Configure brackets for position ${position.id}`}
                    >
                      {position.stopLoss !== null ? `$${fmtPrice(position.stopLoss)}` : '-'}
                    </button>
                  </td>
                  <td>
                    <button
                      type="button"
                      className={styles.closeBtn}
                      onClick={() => closePositionNow(position.id)}
                    >
                      Close
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <PositionBracketEditor />
    </div>
  );
}
