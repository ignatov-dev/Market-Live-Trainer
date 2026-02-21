import { createContext, useCallback, useContext, useEffect, useMemo } from 'react';
import type { FormEvent, ReactNode } from 'react';
import {
  getAuthJwtToken,
  getAuthSessionEmail,
  signInWithEmail,
  signOutAuth,
  signUpWithEmail,
} from '../integration/neonAuth';
import { setBackendAuthToken } from '../integration/positionsApi';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import {
  setAuthError,
  setAuthMode as setAuthModeAction,
  setAuthNameInput as setAuthNameInputAction,
  setAuthEmailInput as setAuthEmailInputAction,
  setAuthPasswordInput as setAuthPasswordInputAction,
  setAuthSessionEmail,
  setAuthSubmitting,
  setAuthToken,
} from '../store/slices/authSlice';
import type { AuthMode } from '../store/slices/authSlice';
import {
  incrementSyncRevision,
  setBackendHydrated,
  resetBackend,
} from '../store/slices/backendSlice';

const NEON_AUTH_URL = (import.meta.env.VITE_NEON_AUTH_URL ?? '').trim();

// Cookie name the extension will read
const AUTH_COOKIE_NAME = 'mlt_auth_token';

function writeAuthCookie(token: string | null) {
  if (typeof token === 'string' && token.length > 0) {
    // max-age=3600 matches a typical 1-hour JWT lifetime.
    // SameSite=Strict is fine — the extension reads via cookies API, not HTTP.
    // Do NOT set Secure on localhost (breaks on plain HTTP).
    const isSecure = window.location.protocol === 'https:';
    document.cookie = `${AUTH_COOKIE_NAME}=${encodeURIComponent(
      token,
    )}; path=/; SameSite=Strict; max-age=3600${isSecure ? '; Secure' : ''}`;
  } else {
    // Clear the cookie by setting max-age=0
    document.cookie = `${AUTH_COOKIE_NAME}=; path=/; SameSite=Strict; max-age=0`;
  }

  // Notify extension content script to trigger an immediate background refresh
  window.postMessage({ type: 'MLT_AUTH_CHANGED', token }, '*');
}

interface AuthContextValue {
  backendAuthToken: string | null;
  hasBackendAuth: boolean;
  hasNeonAuthUrl: boolean;
  authMode: AuthMode;
  authNameInput: string;
  authEmailInput: string;
  authPasswordInput: string;
  authSessionEmail: string;
  authError: string;
  isAuthSubmitting: boolean;
  setAuthMode: (mode: AuthMode) => void;
  setAuthNameInput: (value: string) => void;
  setAuthEmailInput: (value: string) => void;
  setAuthPasswordInput: (value: string) => void;
  handleAuthSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  handleAuthSignOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const dispatch = useAppDispatch();
  const backendAuthToken = useAppSelector((s) => s.auth.backendAuthToken);
  const authMode = useAppSelector((s) => s.auth.authMode);
  const authNameInput = useAppSelector((s) => s.auth.authNameInput);
  const authEmailInput = useAppSelector((s) => s.auth.authEmailInput);
  const authPasswordInput = useAppSelector((s) => s.auth.authPasswordInput);
  const authSessionEmail = useAppSelector((s) => s.auth.authSessionEmail);
  const authError = useAppSelector((s) => s.auth.authError);
  const isAuthSubmitting = useAppSelector((s) => s.auth.isAuthSubmitting);

  const hasNeonAuthUrl = NEON_AUTH_URL.length > 0;
  const hasBackendAuth =
    typeof backendAuthToken === 'string' && backendAuthToken.trim().length > 0;

  const applyBackendAuthToken = useCallback(
    (token: string | null) => {
      const normalizedToken = typeof token === 'string' ? token.trim() : '';
      const finalToken = normalizedToken.length > 0 ? normalizedToken : null;
      setBackendAuthToken(finalToken);
      writeAuthCookie(finalToken);
      dispatch(setAuthToken(finalToken));
      dispatch(setBackendHydrated(false));
      dispatch(incrementSyncRevision());
    },
    [dispatch],
  );

  useEffect(() => {
    if (hasBackendAuth || !hasNeonAuthUrl) {
      return undefined;
    }

    let isCancelled = false;

    async function restoreSessionToken() {
      try {
        const token = await getAuthJwtToken();
        if (isCancelled || typeof token !== 'string' || token.length === 0) {
          return;
        }

        applyBackendAuthToken(token);
        const email = await getAuthSessionEmail();
        if (!isCancelled && typeof email === 'string') {
          dispatch(setAuthSessionEmail(email));
        }
        if (!isCancelled) {
          dispatch(setAuthError(''));
        }
      } catch {
        // No active Neon auth session. Keep unauthenticated state.
      }
    }

    void restoreSessionToken();

    return () => {
      isCancelled = true;
    };
  }, [applyBackendAuthToken, dispatch, hasBackendAuth, hasNeonAuthUrl]);

  useEffect(() => {
    if (!hasBackendAuth) {
      dispatch(setAuthSessionEmail(''));
      return undefined;
    }

    let isCancelled = false;

    async function loadAuthSessionIdentity() {
      try {
        const email = await getAuthSessionEmail();
        if (!isCancelled && typeof email === 'string') {
          dispatch(setAuthSessionEmail(email));
        }
      } catch {
        // Ignore identity lookup errors.
      }
    }

    void loadAuthSessionIdentity();

    // Periodically check and refresh the JWT to prevent 1-hour expiry issues in long-lived sessions
    const refreshTimer = window.setInterval(async () => {
      try {
        const token = await getAuthJwtToken();
        if (!isCancelled && typeof token === 'string' && token.length > 0 && token !== backendAuthToken) {
          applyBackendAuthToken(token);
        }
      } catch {
        // Ignore refresh errors.
      }
    }, 5 * 60 * 1000); // 5 minutes

    return () => {
      isCancelled = true;
      window.clearInterval(refreshTimer);
    };
  }, [backendAuthToken, dispatch, hasBackendAuth, applyBackendAuthToken]);

  const setAuthMode = useCallback(
    (mode: AuthMode) => {
      dispatch(setAuthModeAction(mode));
    },
    [dispatch],
  );

  const setAuthNameInput = useCallback(
    (value: string) => {
      dispatch(setAuthNameInputAction(value));
    },
    [dispatch],
  );

  const setAuthEmailInput = useCallback(
    (value: string) => {
      dispatch(setAuthEmailInputAction(value));
    },
    [dispatch],
  );

  const setAuthPasswordInput = useCallback(
    (value: string) => {
      dispatch(setAuthPasswordInputAction(value));
    },
    [dispatch],
  );

  const handleAuthSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (isAuthSubmitting) {
        return;
      }

      if (!hasNeonAuthUrl) {
        dispatch(
          setAuthError('Set VITE_NEON_AUTH_URL in .env.local to enable account signup/signin.'),
        );
        return;
      }

      const email = authEmailInput.trim().toLowerCase();
      const password = authPasswordInput;
      const name = authNameInput.trim();

      if (!email || !password) {
        dispatch(setAuthError('Email and password are required.'));
        return;
      }

      dispatch(setAuthError(''));
      dispatch(setAuthSubmitting(true));

      try {
        if (authMode === 'signup') {
          await signUpWithEmail(email, password, name || email.split('@')[0] || '');
        } else {
          await signInWithEmail(email, password);
        }

        const token = await getAuthJwtToken();
        if (!token) {
          return;
        }

        applyBackendAuthToken(token);
        const sessionEmail = await getAuthSessionEmail();
        dispatch(setAuthSessionEmail(sessionEmail ?? email));
        dispatch(setAuthPasswordInputAction(''));
      } catch (error) {
        dispatch(setAuthError(error instanceof Error ? error.message : 'Authentication failed.'));
      } finally {
        dispatch(setAuthSubmitting(false));
      }
    },
    [
      applyBackendAuthToken,
      authEmailInput,
      authMode,
      authNameInput,
      authPasswordInput,
      dispatch,
      hasNeonAuthUrl,
      isAuthSubmitting,
    ],
  );

  const handleAuthSignOut = useCallback(async () => {
    dispatch(setAuthError(''));

    try {
      await signOutAuth();
    } catch {
      // If session-based signout fails, still clear in-app token.
    }

    writeAuthCookie(null);
    applyBackendAuthToken(null);
    dispatch(resetBackend());
    dispatch(setAuthSessionEmail(''));
  }, [applyBackendAuthToken, dispatch]);

  const value = useMemo<AuthContextValue>(
    () => ({
      backendAuthToken,
      hasBackendAuth,
      hasNeonAuthUrl,
      authMode,
      authNameInput,
      authEmailInput,
      authPasswordInput,
      authSessionEmail,
      authError,
      isAuthSubmitting,
      setAuthMode,
      setAuthNameInput,
      setAuthEmailInput,
      setAuthPasswordInput,
      handleAuthSubmit,
      handleAuthSignOut,
    }),
    [
      authEmailInput,
      authError,
      authMode,
      authNameInput,
      authPasswordInput,
      authSessionEmail,
      backendAuthToken,
      handleAuthSignOut,
      handleAuthSubmit,
      hasBackendAuth,
      hasNeonAuthUrl,
      isAuthSubmitting,
      setAuthEmailInput,
      setAuthMode,
      setAuthNameInput,
      setAuthPasswordInput,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider.');
  }
  return context;
}
