import styles from './PendingOrdersList.module.css';
import { fmtNumber, fmtPrice } from '../../../utils/formatters';
import type { PendingOrder } from '../../../types/domain';

interface Props {
  orders: PendingOrder[];
  onCancel: (id: number) => void;
}

export default function PendingOrdersList({ orders, onCancel }: Props) {
  return (
    <div className={styles.subpanel}>
      <h3>Pending Limit Orders</h3>
      <div className={styles.listBox}>
        {orders.length === 0 ? (
          <p className={styles.empty}>No pending orders.</p>
        ) : (
          orders.map((order) => (
            <div className={styles.listItem} key={order.id}>
              <div>
                <strong>#{order.id}</strong> [{order.pair}] {order.side === 'buy' ? 'Buy' : 'Sell'} {fmtNumber(order.qty, 3)} @ ${fmtPrice(order.limitPrice)}
                <br />
                <small>
                  SL: {order.stopLoss ? `$${fmtPrice(order.stopLoss)}` : '-'} | TP:{' '}
                  {order.takeProfit ? `$${fmtPrice(order.takeProfit)}` : '-'}
                </small>
              </div>
              <button type="button" className={styles.cancelBtn} onClick={() => onCancel(order.id)}>
                Cancel
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
