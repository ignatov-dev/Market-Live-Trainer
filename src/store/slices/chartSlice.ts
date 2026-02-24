import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { SmaConfig, SmaPeriod } from '../../constants/indicators';
import { DEFAULT_SMA_CONFIG, SMA_PERIODS } from '../../constants/indicators';
import type { Datasets, NewsByPair, ChartMarkerTooltip, Candle } from '../../types/domain';

const SMA_CONFIG_STORAGE_KEY = 'market-live-trainer:sma-config';

const canUseStorage = (): boolean =>
  typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

const readSmaConfigFromStorage = (): SmaConfig => {
  if (!canUseStorage()) {
    return DEFAULT_SMA_CONFIG;
  }
  try {
    const raw = window.localStorage.getItem(SMA_CONFIG_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_SMA_CONFIG;
    }
    const parsed = JSON.parse(raw) as Partial<Record<SmaPeriod, unknown>>;
    const normalized = SMA_PERIODS.reduce((acc, period) => {
      acc[period] =
        typeof parsed?.[period] === 'boolean' ? (parsed[period] as boolean) : DEFAULT_SMA_CONFIG[period];
      return acc;
    }, {} as SmaConfig);
    return normalized;
  } catch {
    return DEFAULT_SMA_CONFIG;
  }
};

const persistSmaConfig = (config: SmaConfig): void => {
  if (!canUseStorage()) {
    return;
  }
  try {
    window.localStorage.setItem(SMA_CONFIG_STORAGE_KEY, JSON.stringify(config));
  } catch {
    // Ignore persistence errors so chart behavior is never blocked by storage issues.
  }
};

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface ChartState {
  pair: string;
  timeframeId: string;
  datasets: Datasets;
  newsByPair: NewsByPair;
  datasetRevision: number;
  isLoadingData: boolean;
  isLoadingNews: boolean;
  newsStatus: string;
  chartViewSize: number;
  chartEndIndex: number | null;
  chartMarkerTooltip: ChartMarkerTooltip | null;
  resizeToken: number;
  smaConfig: SmaConfig;
}

const initialState: ChartState = {
  pair: 'BTCUSDT',
  timeframeId: '15m',
  datasets: {},
  newsByPair: {},
  datasetRevision: 0,
  isLoadingData: false,
  isLoadingNews: false,
  newsStatus: '',
  chartViewSize: 92,
  chartEndIndex: null,
  chartMarkerTooltip: null,
  resizeToken: 0,
  smaConfig: readSmaConfigFromStorage(),
};

// ---------------------------------------------------------------------------
// Slice
// ---------------------------------------------------------------------------

const chartSlice = createSlice({
  name: 'chart',
  initialState,
  reducers: {
    setPair(state, action: PayloadAction<string>) {
      state.pair = action.payload;
      // Reset chart position when switching pairs
      state.chartEndIndex = null;
      state.chartMarkerTooltip = null;
    },
    setTimeframeId(state, action: PayloadAction<string>) {
      state.timeframeId = action.payload;
      state.chartEndIndex = null;
      state.chartMarkerTooltip = null;
    },
    setDatasets(state, action: PayloadAction<Datasets>) {
      state.datasets = action.payload;
      state.datasetRevision += 1;
    },
    mergePairCandles(
      state,
      action: PayloadAction<{ pairId: string; candles: Candle[] }>,
    ) {
      state.datasets = { ...state.datasets, [action.payload.pairId]: action.payload.candles };
      state.datasetRevision += 1;
    },
    setNewsByPair(state, action: PayloadAction<NewsByPair>) {
      state.newsByPair = action.payload;
    },
    mergePairNews(
      state,
      action: PayloadAction<{ pairId: string; items: NewsByPair[string] }>,
    ) {
      state.newsByPair = { ...state.newsByPair, [action.payload.pairId]: action.payload.items };
    },
    setLoadingData(state, action: PayloadAction<boolean>) {
      state.isLoadingData = action.payload;
    },
    setLoadingNews(state, action: PayloadAction<boolean>) {
      state.isLoadingNews = action.payload;
    },
    setNewsStatus(state, action: PayloadAction<string>) {
      state.newsStatus = action.payload;
    },
    setChartViewSize(state, action: PayloadAction<number>) {
      state.chartViewSize = action.payload;
    },
    setChartEndIndex(state, action: PayloadAction<number | null>) {
      state.chartEndIndex = action.payload;
    },
    setChartMarkerTooltip(state, action: PayloadAction<ChartMarkerTooltip | null>) {
      state.chartMarkerTooltip = action.payload;
    },
    toggleSmaPeriod(state, action: PayloadAction<SmaPeriod>) {
      const period = action.payload;
      state.smaConfig = {
        ...state.smaConfig,
        [period]: !state.smaConfig[period],
      };
      persistSmaConfig(state.smaConfig);
    },
    triggerResize(state) {
      state.resizeToken += 1;
    },
  },
});

export const {
  setPair,
  setTimeframeId,
  setDatasets,
  mergePairCandles,
  setNewsByPair,
  mergePairNews,
  setLoadingData,
  setLoadingNews,
  setNewsStatus,
  setChartViewSize,
  setChartEndIndex,
  setChartMarkerTooltip,
  toggleSmaPeriod,
  triggerResize,
} = chartSlice.actions;

export default chartSlice.reducer;
