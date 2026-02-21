import { useCallback, useMemo } from 'react';
import { generateCoachReport } from '../coaching';
import { getLatestMarksByPair } from '../../CandleChart/utils/candles';
import { getMetrics } from '../../../utils/trading';
import { useAppDispatch, useAppSelector } from '../../../store/hooks';
import { setCoachReport } from '../../../store/slices/sessionSlice';
import type { CoachReport } from '../../../types/domain';

interface CoachReportController {
  coachReport: CoachReport | null;
  onGenerate: () => void;
}

export function useCoachReportController(): CoachReportController {
  const dispatch = useAppDispatch();
  const coachReport = useAppSelector((s) => s.session.coachReport);
  const session = useAppSelector((s) => s.session.session);
  const pair = useAppSelector((s) => s.chart.pair);
  const datasets = useAppSelector((s) => s.chart.datasets);

  const candles = useMemo(() => datasets[pair] ?? [], [datasets, pair]);
  const marksByPair = useMemo(() => getLatestMarksByPair(datasets), [datasets]);
  const metrics = useMemo(() => getMetrics(session, marksByPair), [marksByPair, session]);

  const onGenerate = useCallback(() => {
    const report = generateCoachReport(session, candles, metrics);
    dispatch(setCoachReport(report));
  }, [candles, dispatch, metrics, session]);

  return {
    coachReport,
    onGenerate,
  };
}
