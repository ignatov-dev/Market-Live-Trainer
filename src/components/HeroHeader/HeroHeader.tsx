import React, { useMemo } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import styles from './HeroHeader.module.css';
import AuthPanel from './AuthPanel/AuthPanel';
import SessionSummary from './SessionSummary/SessionSummary';
import NewsTicker from './NewsTicker/NewsTicker';
import type { SessionMetrics, Session, NewsItem } from '../../types/domain';

type AuthMode = 'signup' | 'signin';

interface Props {
  hasBackendAuth: boolean;
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
  onAuthSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  metrics: SessionMetrics;
  session: Session;
  newsItems: NewsItem[];
  pairLabel: string;
  authSessionEmail?: string | null;
  onSignOut: () => void;
}

export default function HeroHeader({
  hasBackendAuth,
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
  onAuthSubmit,
  metrics,
  session,
  newsItems,
  pairLabel,
  authSessionEmail,
  onSignOut,
}: Props) {
  const { scrollY } = useScroll();
  const heroFadeOpacity = useTransform(scrollY, [0, 100, 160], [1, 0.6, 0]);
  const tickerTitles = useMemo(() => {
    const fallback = `No fresh ${pairLabel} headlines right now.`;
    if (!Array.isArray(newsItems) || newsItems.length === 0) {
      return [fallback];
    }

    const uniqueTitles = [
      ...new Set(
        newsItems
          .map((item) => item.title)
          .filter((title): title is string => typeof title === 'string'),
      ),
    ]
      .map((title) => title.trim())
      .filter((title) => title.length > 0);

    return uniqueTitles.length > 0 ? uniqueTitles : [fallback];
  }, [newsItems, pairLabel]);
  const tickerItems = useMemo(() => [...tickerTitles, ...tickerTitles], [tickerTitles]);

  return (
    <header className={styles.hero}>
      <motion.div style={{ opacity: heroFadeOpacity }}>
        <p className={styles.eyebrow}>Claude Code Challenge MVP</p>
        <h1>Market Live Trainer</h1>
        <p className={styles.subhead}>
          Live Coinbase candles with timeframe switching, paper trading, and a rule-driven AI coach report.
        </p>
      </motion.div>

      <motion.div className={styles.sessionSummary} style={{ opacity: heroFadeOpacity }}>
        {!hasBackendAuth ? (
          <AuthPanel
            authMode={authMode}
            authNameInput={authNameInput}
            authEmailInput={authEmailInput}
            authPasswordInput={authPasswordInput}
            authError={authError}
            isAuthSubmitting={isAuthSubmitting}
            hasNeonAuthUrl={hasNeonAuthUrl}
            onModeChange={onModeChange}
            onNameChange={onNameChange}
            onEmailChange={onEmailChange}
            onPasswordChange={onPasswordChange}
            onSubmit={onAuthSubmit}
          />
        ) : (
          <SessionSummary
            metrics={metrics}
            session={session}
            authSessionEmail={authSessionEmail}
            onSignOut={onSignOut}
          />
        )}
      </motion.div>

      <NewsTicker items={tickerItems} style={{ opacity: heroFadeOpacity }} />
    </header>
  );
}
