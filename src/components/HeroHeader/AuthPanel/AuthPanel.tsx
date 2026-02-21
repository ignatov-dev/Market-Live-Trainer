import React from 'react';
import styles from './AuthPanel.module.css';

type AuthMode = 'signup' | 'signin';

interface Props {
  authMode: AuthMode;
  authNameInput: string;
  authEmailInput: string;
  authPasswordInput: string;
  authError: string | null;
  isAuthSubmitting: boolean;
  hasNeonAuthUrl: boolean;
  onModeChange: (mode: AuthMode) => void;
  onNameChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}

export default function AuthPanel({
  authMode,
  authNameInput,
  authEmailInput,
  authPasswordInput,
  authError,
  isAuthSubmitting,
  hasNeonAuthUrl,
  onModeChange,
  onNameChange,
  onEmailChange,
  onPasswordChange,
  onSubmit,
}: Props) {
  return (
    <>
      <div className={styles.header}>
        <p className={styles.title}>Authentication</p>
        <div className={styles.modeSwitch} role="tablist" aria-label="Auth mode">
          <button
            type="button"
            role="tab"
            aria-selected={authMode === 'signup'}
            className={`${styles.modeBtn}${authMode === 'signup' ? ` ${styles.modeBtnActive}` : ''}`}
            onClick={() => onModeChange('signup')}
          >
            Create account
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={authMode === 'signin'}
            className={`${styles.modeBtn}${authMode === 'signin' ? ` ${styles.modeBtnActive}` : ''}`}
            onClick={() => onModeChange('signin')}
          >
            Sign in
          </button>
        </div>
      </div>
      <form className={styles.form} onSubmit={onSubmit}>
        {authMode === 'signup' ? (
          <input
            type="text"
            placeholder="Name"
            autoComplete="name"
            value={authNameInput}
            onChange={(e) => onNameChange(e.target.value)}
          />
        ) : null}
        <input
          type="email"
          placeholder="Email"
          autoComplete="email"
          value={authEmailInput}
          onChange={(e) => onEmailChange(e.target.value)}
        />
        <input
          type="password"
          placeholder="Password"
          autoComplete={authMode === 'signup' ? 'new-password' : 'password'}
          value={authPasswordInput}
          onChange={(e) => onPasswordChange(e.target.value)}
        />
        <div className={styles.actions}>
          <button
            type="submit"
            className={styles.submitBtn}
            disabled={!hasNeonAuthUrl || isAuthSubmitting}
          >
            {isAuthSubmitting ? 'Working...' : authMode === 'signup' ? 'Create account' : 'Sign in'}
          </button>
        </div>
      </form>
      {authError ? (
        <p className={`${styles.status} ${styles.statusError}`}>{authError}</p>
      ) : (
        <p className={styles.status} />
      )}
    </>
  );
}
