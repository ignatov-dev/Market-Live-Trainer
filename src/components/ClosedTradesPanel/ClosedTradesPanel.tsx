import { useMemo } from 'react';
import styles from './ClosedTradesPanel.module.css';
import { fmtPrice, fmtNumber, fmtSigned, getPairBaseSymbol } from '../../utils/formatters';
import { resolvePairFromBackendSymbol } from '../../utils/trading';
import { useAppSelector } from '../../store/hooks';

export default function ClosedTradesPanel() {
  const positions = useAppSelector((s) => s.backend.backendClosedPositions);
  const isLoading = useAppSelector((s) => s.backend.isLoadingBackendClosedPositions);
  const error = useAppSelector((s) => s.backend.backendClosedPositionsError);
  const closedTrades = useAppSelector((s) => s.session.session.closedTrades);
  const localClosedTradesByBackendId = useMemo(() => {
    const map = new Map<string, (typeof closedTrades)[number]>();
    for (const trade of closedTrades) {
      if (typeof trade.backendPositionId === 'string' && trade.backendPositionId.length > 0) {
        map.set(trade.backendPositionId, trade);
      }
    }
    return map;
  }, [closedTrades]);

  return (
    <section className="panel logs-panel">
      <div className="panel-head">
        <h2>Closed Trades</h2>
      </div>
      <div className={styles.tableWrap}>
        {isLoading && positions.length === 0 ? (
          <p className={styles.empty}>Loading closed trades...</p>
        ) : error ? (
          <p className={styles.empty}>Closed trades unavailable ({error}).</p>
        ) : positions.length === 0 ? (
          <p className={styles.empty}>No closed trades yet.</p>
        ) : (
          <table className={styles.table}>
            <colgroup>
              <col className={styles.colSide} />
              <col className={styles.colQty} />
              <col className={styles.colEntry} />
              <col className={styles.colExit} />
              <col className={styles.colPnl} />
              <col className={styles.colReason} />
              <col className={styles.colBalBefore} />
              <col className={styles.colBalAfter} />
            </colgroup>
            <thead>
              <tr>
                <th>Side</th><th>Quantity</th><th>Entry</th><th>Exit</th><th>PnL</th><th>Reason</th><th>Bal. Before</th><th>Bal. After</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((position) => {
                const localTrade = localClosedTradesByBackendId.get(position.id) ?? null;
                const backendPairId = resolvePairFromBackendSymbol(position.symbol) ?? position.symbol.replace('-', '');
                const qtyLabel = localTrade
                  ? `${fmtNumber(localTrade.qty, 3)} ${getPairBaseSymbol(localTrade.pair)}`
                  : `${fmtNumber(position.quantity, 3)} ${getPairBaseSymbol(backendPairId)}`;
                const pnl =
                  typeof position.closePnl === 'number' && Number.isFinite(position.closePnl)
                    ? position.closePnl
                    : (localTrade?.pnl ?? null);
                const reason = position.closeReason
                  ? String(position.closeReason).replace(/_/g, '-')
                  : localTrade?.reason ?? '-';
                const balBefore = position.balanceBefore;
                const balAfter = position.balanceAfter;
                return (
                  <tr key={position.id}>
                    <td className={position.side === 'long' ? styles.long : styles.short}>{position.side}</td>
                    <td>{qtyLabel}</td>
                    <td>${fmtPrice(position.entryPrice)}</td>
                    <td>{position.closePrice === null ? '-' : `$${fmtPrice(position.closePrice)}`}</td>
                    <td className={pnl === null ? '' : pnl >= 0 ? styles.pos : styles.neg}>
                      {pnl === null ? '-' : fmtSigned(pnl)}
                    </td>
                    <td>{reason}</td>
                    <td>{balBefore === null ? '-' : `$${fmtPrice(balBefore)}`}</td>
                    <td>{balAfter === null ? '-' : `$${fmtPrice(balAfter)}`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
