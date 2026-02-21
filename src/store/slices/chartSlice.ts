import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { Datasets, NewsByPair, ChartMarkerTooltip, Candle } from '../../types/domain';

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
  triggerResize,
} = chartSlice.actions;

export default chartSlice.reducer;
