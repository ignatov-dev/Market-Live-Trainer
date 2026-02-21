import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type {
  BackendPosition,
  BackendPnlByPositionId,
  BackendPnlEntry,
  BackendTradingAccount,
} from '../../types/domain';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface BackendState {
  backendClosedPositions: BackendPosition[];
  backendAccount: BackendTradingAccount | null;
  backendPnlByPositionId: BackendPnlByPositionId;
  backendSyncRevision: number;
  isBackendHydrated: boolean;
  isLoadingBackendClosedPositions: boolean;
  isLoadingBackendAccount: boolean;
  backendClosedPositionsError: string;
  backendAccountError: string;
}

const initialState: BackendState = {
  backendClosedPositions: [],
  backendAccount: null,
  backendPnlByPositionId: {},
  backendSyncRevision: 0,
  isBackendHydrated: false,
  isLoadingBackendClosedPositions: false,
  isLoadingBackendAccount: false,
  backendClosedPositionsError: '',
  backendAccountError: '',
};

// ---------------------------------------------------------------------------
// Slice
// ---------------------------------------------------------------------------

const backendSlice = createSlice({
  name: 'backend',
  initialState,
  reducers: {
    setBackendClosedPositions(state, action: PayloadAction<BackendPosition[]>) {
      state.backendClosedPositions = action.payload;
    },
    setBackendAccount(state, action: PayloadAction<BackendTradingAccount | null>) {
      state.backendAccount = action.payload;
    },
    setBackendPnlEntry(
      state,
      action: PayloadAction<{ positionId: string; entry: BackendPnlEntry }>,
    ) {
      state.backendPnlByPositionId = {
        ...state.backendPnlByPositionId,
        [action.payload.positionId]: action.payload.entry,
      };
    },
    setBackendPnlByPositionId(state, action: PayloadAction<BackendPnlByPositionId>) {
      state.backendPnlByPositionId = action.payload;
    },
    setBackendHydrated(state, action: PayloadAction<boolean>) {
      state.isBackendHydrated = action.payload;
    },
    incrementSyncRevision(state) {
      state.backendSyncRevision += 1;
    },
    setLoadingClosedPositions(state, action: PayloadAction<boolean>) {
      state.isLoadingBackendClosedPositions = action.payload;
    },
    setLoadingBackendAccount(state, action: PayloadAction<boolean>) {
      state.isLoadingBackendAccount = action.payload;
    },
    setBackendError(state, action: PayloadAction<string>) {
      state.backendClosedPositionsError = action.payload;
    },
    setBackendAccountError(state, action: PayloadAction<string>) {
      state.backendAccountError = action.payload;
    },
    resetBackend(state) {
      state.backendClosedPositions = [];
      state.backendAccount = null;
      state.backendPnlByPositionId = {};
      state.backendSyncRevision = 0;
      state.isBackendHydrated = false;
      state.isLoadingBackendClosedPositions = false;
      state.isLoadingBackendAccount = false;
      state.backendClosedPositionsError = '';
      state.backendAccountError = '';
    },
  },
});

export const {
  setBackendClosedPositions,
  setBackendAccount,
  setBackendPnlEntry,
  setBackendPnlByPositionId,
  setBackendHydrated,
  incrementSyncRevision,
  setLoadingClosedPositions,
  setLoadingBackendAccount,
  setBackendError,
  setBackendAccountError,
  resetBackend,
} = backendSlice.actions;

export default backendSlice.reducer;
