import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  closePosition,
  createPosition,
  getBackendAuthToken,
  listPositions,
  type CreatePositionPayload,
  type Position,
} from './positionsApi';
import { usePositionEvents } from './usePositionEvents';

export function useBackendPositions() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listPositions();
      setPositions(data);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load positions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  usePositionEvents({
    authToken: getBackendAuthToken(),
    onClosed: ({ position: closed }) => {
      setPositions((prev) => prev.map((item) => (item.id === closed.id ? closed : item)));
    },
  });

  const openPositions = useMemo(() => positions.filter((item) => item.status === 'open'), [positions]);
  const closedPositions = useMemo(() => positions.filter((item) => item.status === 'closed'), [positions]);

  const create = useCallback(
    async (payload: CreatePositionPayload) => {
      const created = await createPosition(payload);
      setPositions((prev) => [created, ...prev]);
      return created;
    },
    [],
  );

  const close = useCallback(
    async (positionId: string, closePrice: number) => {
      const closed = await closePosition(positionId, closePrice);
      setPositions((prev) => prev.map((item) => (item.id === closed.id ? closed : item)));
      return closed;
    },
    [],
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
