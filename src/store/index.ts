import { configureStore } from '@reduxjs/toolkit';
import sessionReducer from './slices/sessionSlice';
import chartReducer from './slices/chartSlice';
import authReducer from './slices/authSlice';
import backendReducer from './slices/backendSlice';

export const store = configureStore({
  reducer: {
    session: sessionReducer,
    chart: chartReducer,
    auth: authReducer,
    backend: backendReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
