import { useAppSelector } from '../../store/hooks';
import OpenPositionsList from '../ChartPanel/OpenPositionsList/OpenPositionsList';

export default function OpenPositionsPanel() {
  const positions = useAppSelector((s) => s.session.session.positions);

  return (
    <section className="panel positions-panel">
      <div className="panel-head">
        <h2>Open Positions</h2>
      </div>
      <OpenPositionsList />
      {positions.length === 0 && (
        <p className="positions-panel-empty">No open positions</p>
      )}
    </section>
  );
}
