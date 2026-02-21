import styles from './PatternNotifications.module.css';
import { candleLabel } from '../../utils/formatters';
import { ENABLE_PATTERN_NOTIFICATIONS } from '../../constants/trading';
import type { PatternNotification } from '../../types/domain';

interface Props {
  notifications: PatternNotification[];
  onDismiss: (id: string) => void;
}

export default function PatternNotifications({ notifications, onDismiss }: Props) {
  if (!ENABLE_PATTERN_NOTIFICATIONS || notifications.length === 0) return null;
  return (
    <div className={styles.container} aria-live="polite" aria-atomic="false">
      {notifications.map((item) => (
        <article key={item.id} className={styles.toast}>
          <div className={styles.toastHead}>
            <strong>{item.pattern}</strong>
          </div>
          <p className={styles.toastTime}>{candleLabel(item.candleTs)}</p>
          <p className={styles.toastText}>{item.description}</p>
          <button type="button" className={styles.toastClose} onClick={() => onDismiss(item.id)}>
            Dismiss
          </button>
        </article>
      ))}
    </div>
  );
}
