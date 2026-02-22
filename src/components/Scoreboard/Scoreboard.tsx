import { useMemo } from 'react';
import { motion, LayoutGroup } from 'framer-motion';
import styles from './Scoreboard.module.css';
import { useScoreboardSocket } from './useScoreboardSocket';
import { groupUsersByRank, formatNetPnl, decodeJwtUserId, ordinalRank, getScoreboardPhrase } from './utils';
import type { ScoreboardEntry } from './types';

const ROW_TRANSITION = { type: 'spring', stiffness: 380, damping: 32 } as const;

interface Props {
  authToken: string | null;
}

interface TierSectionProps {
  tier: 'gold' | 'silver' | 'bronze';
  entries: ScoreboardEntry[];
  currentUserId: string | null;
}

const TIER_META = {
  gold:   { icon: '🥇', label: 'Gold' },
  silver: { icon: '🥈', label: 'Silver' },
  bronze: { icon: '🥉', label: 'Bronze' },
} as const;

function TierSection({ tier, entries, currentUserId }: TierSectionProps) {
  if (entries.length === 0) return null;

  const { label } = TIER_META[tier];

  return (
    <div className={styles.tier}>
      {entries.map((entry) => {
        const isPositive = entry.netPnl >= 0;
        const isCurrentUser = entry.userId === currentUserId;
        return (
          <motion.div
            key={entry.userId}
            layoutId={entry.userId}
            layout
            transition={ROW_TRANSITION}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className={`${styles.row} ${styles[tier]}`}
          >
            <span className={`${styles.tierBadge} ${styles[tier]}`}>{label}</span>
            <span className={`${styles.userName}${isCurrentUser ? ` ${styles.currentUser}` : ''}`}>
              {entry.userName}{isCurrentUser && <span className={styles.youBadge}> (you)</span>}
            </span>
            <span className={`${styles.returnPct} ${isPositive ? styles.pos : styles.neg}`}>
              {formatNetPnl(entry.netPnl)}
            </span>
          </motion.div>
        );
      })}
    </div>
  );
}

export default function Scoreboard({ authToken }: Props) {
  const { entries, status } = useScoreboardSocket(authToken);

  const currentUserId = useMemo(
    () => (authToken ? decodeJwtUserId(authToken) : null),
    [authToken],
  );

  const sortedEntries = useMemo(
    () => [...entries].sort((a, b) => b.netPnl - a.netPnl),
    [entries],
  );

  const groups = useMemo(() => groupUsersByRank(entries), [entries]);

  const currentUserRank = useMemo(() => {
    if (!currentUserId) return null;
    const idx = sortedEntries.findIndex((e) => e.userId === currentUserId);
    return idx === -1 ? null : idx + 1;
  }, [sortedEntries, currentUserId]);

  // 4th row: prefer current user if they're rank 4+, otherwise show actual 4th place
  const currentUserOutsideTop3 = currentUserRank !== null && currentUserRank > 3;
  const fourthRowEntry = currentUserOutsideTop3
    ? (sortedEntries[currentUserRank! - 1] ?? null)
    : (sortedEntries[3] ?? null);
  const fourthRowRank = currentUserOutsideTop3 ? currentUserRank! : 4;
  const showFourthRow = sortedEntries.length >= 4;

  const motivationPhrase = useMemo(
    () => (currentUserId && currentUserRank !== null ? getScoreboardPhrase(currentUserRank, currentUserId) : null),
    [currentUserId, currentUserRank],
  );

  const isLoading = status === 'connecting' && entries.length === 0;
  const isEmpty = status !== 'connecting' && entries.length === 0;

  return (
    <section className="panel scoreboard-panel">
      <div className={styles.scoreboard}>
        {isLoading && (
          <div className={styles.loading}>
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className={styles.skeletonRow} />
            ))}
          </div>
        )}

        {isEmpty && (
          <p className={styles.empty}>No participants yet. Be the first!</p>
        )}

        {!isLoading && entries.length > 0 && (
          <LayoutGroup id="scoreboard-rows">
            <TierSection tier="gold" entries={groups.gold} currentUserId={currentUserId} />
            <TierSection tier="silver" entries={groups.silver} currentUserId={currentUserId} />
            <TierSection tier="bronze" entries={groups.bronze} currentUserId={currentUserId} />

            {showFourthRow && fourthRowEntry && (
              <div className={styles.tier}>
                <motion.div
                  key={fourthRowEntry.userId}
                  layoutId={fourthRowEntry.userId}
                  layout
                  transition={ROW_TRANSITION}
                  className={`${styles.row} ${styles.candidate}`}
                >
                  <span className={`${styles.tierBadge} ${styles.candidate}`}>
                    4TH
                  </span>
                  <span className={`${styles.userName}${currentUserOutsideTop3 ? ` ${styles.currentUser}` : ''}`}>
                    {fourthRowEntry.userName}{currentUserOutsideTop3 && <span className={styles.youBadge}> (you)</span>}
                  </span>
                  <span className={`${styles.returnPct} ${fourthRowEntry.netPnl >= 0 ? styles.pos : styles.neg}`}>
                    {formatNetPnl(fourthRowEntry.netPnl)}
                  </span>
                </motion.div>
              </div>
            )}
          </LayoutGroup>
        )}
        {motivationPhrase && (
          <p className={styles.motivationPhrase}>{motivationPhrase}</p>
        )}
      </div>
    </section>
  );
}
