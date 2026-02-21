import styles from './TimelinePanel.module.css';
import { candleLabel } from '../../utils/formatters';
import { useAppSelector } from '../../store/hooks';

export default function TimelinePanel() {
  const timeline = useAppSelector((s) => s.session.session.timeline);
  return (
    <section className="panel timeline-panel">
      <div className="panel-head">
        <h2>Session Timeline</h2>
      </div>
      <div className={styles.timeline}>
        {timeline.length === 0 ? (
          <p className={styles.empty}>No timeline events yet.</p>
        ) : (
          [...timeline].reverse().map((item) => (
            <div key={item.id} className={styles.item}>
              <span className={styles.time}>{candleLabel(item.timestamp)}</span>
              {item.text}
            </div>
          ))
        )}
      </div>
    </section>
  );
}
