import styles from './ChartMarkerTooltip.module.css';

interface TooltipLine {
  label?: string;
  value?: string;
}

interface TooltipEntry {
  id: string;
  title: string;
  lines: Array<TooltipLine | string | null>;
}

interface TooltipData {
  id: string;
  x: number;
  y: number;
  title: string;
  entries: TooltipEntry[];
}

interface Props {
  tooltip: TooltipData | null | undefined;
}

export default function ChartMarkerTooltip({ tooltip }: Props) {
  if (!tooltip) return null;
  return (
    <div
      className={styles.tooltip}
      style={{ left: tooltip.x, top: tooltip.y }}
    >
      <p className={styles.title}>{tooltip.title}</p>
      {tooltip.entries.map((entry) => (
        <div key={`${tooltip.id}-${entry.id}`} className={styles.entry}>
          <p className={styles.entryTitle}>{entry.title}</p>
          {entry.lines.map((line, lineIndex) => {
            const hasStructuredLine = typeof line === 'object' && line !== null;
            const lineLabel = hasStructuredLine ? (line as TooltipLine).label ?? '' : '';
            const lineValue = hasStructuredLine ? (line as TooltipLine).value ?? '' : String(line ?? '');
            return (
              <p key={`${entry.id}-${lineIndex}`} className={styles.line}>
                {lineLabel ? <span className={styles.lineLabel}>{lineLabel}</span> : null}
                <span className={styles.lineValue}>{lineValue}</span>
              </p>
            );
          })}
        </div>
      ))}
    </div>
  );
}
