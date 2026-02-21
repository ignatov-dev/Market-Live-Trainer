import styles from './CoachPanel.module.css';
import { useCoachReportController } from './hooks/useCoachReportController';

export default function CoachPanel() {
  const { coachReport, onGenerate } = useCoachReportController();

  return (
    <section className="panel coach-panel">
      <div className="panel-head">
        <h2>AI Coach Report</h2>
        <button type="button" className="btn secondary" onClick={onGenerate}>
          Generate
        </button>
      </div>
      <div className={styles.report}>
        {coachReport ? (
          <>
            <h3>{coachReport.headline}</h3>
            <p><strong>Session Score:</strong> {coachReport.score}/100</p>
            <p>{coachReport.summary}</p>
            <h4>Top Mistakes</h4>
            <ul>
              {coachReport.mistakes.map((mistake) => <li key={mistake}>{mistake}</li>)}
            </ul>
            <h4>Recommended Improvements</h4>
            <ul>
              {coachReport.improvements.map((improvement) => <li key={improvement}>{improvement}</li>)}
            </ul>
          </>
        ) : (
          <p className={styles.empty}>Generate the report after a few trades to get coaching insights.</p>
        )}
      </div>
    </section>
  );
}
