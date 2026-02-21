import styles from './MetricCard.module.css';

interface Props {
  label: string;
  value: string;
  isPositive?: boolean | null;
}

export default function MetricCard({ label, value, isPositive = null }: Props) {
  const valueClass = isPositive === null
    ? styles.value
    : isPositive ? `${styles.value} ${styles.pos}` : `${styles.value} ${styles.neg}`;

  return (
    <div className={styles.metric}>
      <p className={styles.label}>{label}</p>
      <p className={valueClass}>{value}</p>
    </div>
  );
}
