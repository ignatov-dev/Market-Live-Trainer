import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  closePosition,
  createPosition,
  listPositions,
  type CreatePositionPayload,
  type Position,
} from './positionsApi';
import { usePositionEvents } from './usePositionEvents';

interface UseBackendPositionsArgs {
  userId: string;
}

export function useBackendPositions({ userId }: UseBackendPositionsArgs) {
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listPositions(userId);
      setPositions(data);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load positions');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  usePositionEvents({
    userId,
    onClosed: ({ position: closed }) => {
      setPositions((prev) => prev.map((item) => (item.id === closed.id ? closed : item)));
    },
  });

  const openPositions = useMemo(() => positions.filter((item) => item.status === 'open'), [positions]);
  const closedPositions = useMemo(() => positions.filter((item) => item.status === 'closed'), [positions]);

  const create = useCallback(
    async (payload: Omit<CreatePositionPayload, 'userId'>) => {
      const created = await createPosition({ ...payload, userId });
      setPositions((prev) => [created, ...prev]);
      return created;
    },
    [userId],
  );

  const close = useCallback(
    async (positionId: string, closePrice: number) => {
      const closed = await closePosition(userId, positionId, closePrice);
      setPositions((prev) => prev.map((item) => (item.id === closed.id ? closed : item)));
      return closed;
    },
    [userId],
  );

  return {
    loading,
    error,
    positions,
    openPositions,
    closedPositions,
    reload,
    create,
    close,
  };
}
