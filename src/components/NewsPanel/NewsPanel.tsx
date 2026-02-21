import styles from './NewsPanel.module.css';
import { newsTimestampLabel } from '../../utils/formatters';
import { useAppSelector } from '../../store/hooks';
import type { NewsItem } from '../../types/domain';

interface NewsItemExtended extends NewsItem {
  proofImageLink?: string;
}

export default function NewsPanel() {
  const pair = useAppSelector((s) => s.chart.pair);
  const newsItems = useAppSelector(
    (s) => (s.chart.newsByPair[pair] ?? []) as NewsItemExtended[],
  );
  const newsStatus = useAppSelector((s) => s.chart.newsStatus);
  const isLoading = useAppSelector((s) => s.chart.isLoadingNews);
  const statusClass = newsStatus.toLowerCase().includes('failed') ? styles.statusWarning : styles.status;
  return (
    <section className="panel news-panel">
      <div className="panel-head">
        <h2>Pair News</h2>
      </div>
      <p className={statusClass}>
        {isLoading ? 'Fetching pair events...' : newsStatus}
      </p>
      <div className={styles.feed}>
        {isLoading && newsItems.length === 0 ? (
          <p className={styles.empty}>Loading coin-specific events...</p>
        ) : newsItems.length === 0 ? (
          <p className={styles.empty}>No recent events for this pair.</p>
        ) : (
          newsItems.map((item) => (
            <article className={styles.newsItem} key={item.id}>
              {item.proofImageLink ? (
                <div className={styles.imageWrap}>
                  <img
                    className={styles.image}
                    src={item.proofImageLink}
                    alt={item.title}
                    loading="lazy"
                    decoding="async"
                    referrerPolicy="no-referrer"
                  />
                </div>
              ) : null}
              <h3>{item.title}</h3>
              <p className={styles.meta}>{newsTimestampLabel(item.timestamp)}</p>
              <p className={styles.summary}>{item.summary}</p>
              {item.link ? (
                <a className={styles.link} href={item.link} target="_blank" rel="noreferrer">
                  Open source
                </a>
              ) : null}
            </article>
          ))
        )}
      </div>
    </section>
  );
}
