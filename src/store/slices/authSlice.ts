import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { getBackendAuthToken } from '../../integration/positionsApi';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export type AuthMode = 'signup' | 'signin';

export interface AuthState {
  backendAuthToken: string | null;
  authMode: AuthMode;
  authNameInput: string;
  authEmailInput: string;
  authPasswordInput: string;
  authSessionEmail: string;
  authError: string;
  isAuthSubmitting: boolean;
}

const initialState: AuthState = {
  backendAuthToken: getBackendAuthToken(),
  authMode: 'signup',
  authNameInput: '',
  authEmailInput: '',
  authPasswordInput: '',
  authSessionEmail: '',
  authError: '',
  isAuthSubmitting: false,
};

// ---------------------------------------------------------------------------
// Slice
// ---------------------------------------------------------------------------

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setAuthToken(state, action: PayloadAction<string | null>) {
      state.backendAuthToken = action.payload;
    },
    setAuthMode(state, action: PayloadAction<AuthMode>) {
      state.authMode = action.payload;
      state.authError = '';
    },
    setAuthNameInput(state, action: PayloadAction<string>) {
      state.authNameInput = action.payload;
    },
    setAuthEmailInput(state, action: PayloadAction<string>) {
      state.authEmailInput = action.payload;
    },
    setAuthPasswordInput(state, action: PayloadAction<string>) {
      state.authPasswordInput = action.payload;
    },
    setAuthSessionEmail(state, action: PayloadAction<string>) {
      state.authSessionEmail = action.payload;
    },
    setAuthError(state, action: PayloadAction<string>) {
      state.authError = action.payload;
    },
    setAuthSubmitting(state, action: PayloadAction<boolean>) {
      state.isAuthSubmitting = action.payload;
    },
    clearAuth(state) {
      state.backendAuthToken = null;
      state.authSessionEmail = '';
      state.authError = '';
      state.authNameInput = '';
      state.authEmailInput = '';
      state.authPasswordInput = '';
    },
  },
});

export const {
  setAuthToken,
  setAuthMode,
  setAuthNameInput,
  setAuthEmailInput,
  setAuthPasswordInput,
  setAuthSessionEmail,
  setAuthError,
  setAuthSubmitting,
  clearAuth,
} = authSlice.actions;

export default authSlice.reducer;
