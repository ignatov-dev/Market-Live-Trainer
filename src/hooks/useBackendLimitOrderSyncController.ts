import { useCallback, useEffect } from 'react';
import { listLimitOrders } from '../integration/positionsApi';
import { useAppDispatch } from '../store/hooks';
import { setSession } from '../store/slices/sessionSlice';
import { resolvePairFromBackendSymbol } from '../utils/trading';
import { useWebsocket } from '../providers/WebsocketProvider';
import type { MutableRefObject } from 'react';
import type { LimitOrder } from '../integration/positionsApi';
import type { PendingOrder, Session } from '../types/domain';
import type {
  LimitOrderCanceledEvent,
  LimitOrderCreatedEvent,
  LimitOrderFilledEvent,
} from '../integration/usePositionEvents';

interface Params {
  hasBackendAuth: boolean;
  backendAuthToken: string | null;
  sessionRef: MutableRefObject<Session>;
}

function toPendingOrder(order: LimitOrder): PendingOrder | null {
  const pair = resolvePairFromBackendSymbol(order.symbol);
  const qty = Number(order.quantity);
  const limitPrice = Number(order.limitPrice);

  if (!pair || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(limitPrice) || limitPrice <= 0) {
    return null;
  }

  const stopLoss = order.stopLoss === null ? null : Number(order.stopLoss);
  const takeProfit = order.takeProfit === null ? null : Number(order.takeProfit);

  return {
    id: order.id,
    pair,
    side: order.side,
    qty,
    limitPrice,
    stopLoss: Number.isFinite(stopLoss) ? stopLoss : null,
    takeProfit: Number.isFinite(takeProfit) ? takeProfit : null,
  };
}

export function useBackendLimitOrderSyncController({
  hasBackendAuth,
  backendAuthToken,
  sessionRef,
}: Params): void {
  const dispatch = useAppDispatch();
  const {
    subscribeLimitOrderCreatedEvents,
    subscribeLimitOrderCanceledEvents,
    subscribeLimitOrderFilledEvents,
  } = useWebsocket();

  const handleLimitOrderCreated = useCallback(
    ({ order }: LimitOrderCreatedEvent) => {
      const pending = toPendingOrder(order);
      if (!pending) {
        return;
      }

      const current = sessionRef.current;
      const exists = current.pendingOrders.some((item) => String(item.id) === order.id);
      if (exists) {
        return;
      }

      dispatch(
        setSession({
          ...current,
          pendingOrders: [...current.pendingOrders, pending],
        }),
      );
    },
    [dispatch, sessionRef],
  );

  const removeOrderById = useCallback(
    (orderId: string) => {
      const current = sessionRef.current;
      const nextPending = current.pendingOrders.filter((item) => String(item.id) !== orderId);
      if (nextPending.length === current.pendingOrders.length) {
        return;
      }

      dispatch(
        setSession({
          ...current,
          pendingOrders: nextPending,
        }),
      );
    },
    [dispatch, sessionRef],
  );

  const handleLimitOrderCanceled = useCallback(
    ({ order }: LimitOrderCanceledEvent) => {
      removeOrderById(order.id);
    },
    [removeOrderById],
  );

  const handleLimitOrderFilled = useCallback(
    ({ order }: LimitOrderFilledEvent) => {
      removeOrderById(order.id);
    },
    [removeOrderById],
  );

  useEffect(() => {
    if (!hasBackendAuth) {
      return undefined;
    }

    return subscribeLimitOrderCreatedEvents(handleLimitOrderCreated);
  }, [handleLimitOrderCreated, hasBackendAuth, subscribeLimitOrderCreatedEvents]);

  useEffect(() => {
    if (!hasBackendAuth) {
      return undefined;
    }

    return subscribeLimitOrderCanceledEvents(handleLimitOrderCanceled);
  }, [handleLimitOrderCanceled, hasBackendAuth, subscribeLimitOrderCanceledEvents]);

  useEffect(() => {
    if (!hasBackendAuth) {
      return undefined;
    }

    return subscribeLimitOrderFilledEvents(handleLimitOrderFilled);
  }, [handleLimitOrderFilled, hasBackendAuth, subscribeLimitOrderFilledEvents]);

  useEffect(() => {
    if (!hasBackendAuth) {
      return;
    }

    let isCancelled = false;

    async function hydratePendingOrders() {
      try {
        const orders = await listLimitOrders('pending');
        if (isCancelled) {
          return;
        }

        const mapped = orders
          .map(toPendingOrder)
          .filter((item): item is PendingOrder => item !== null);

        const current = sessionRef.current;
        dispatch(
          setSession({
            ...current,
            pendingOrders: mapped,
          }),
        );
      } catch (error) {
        if (!isCancelled) {
          console.error('Failed to load pending limit orders', error);
        }
      }
    }

    void hydratePendingOrders();

    return () => {
      isCancelled = true;
    };
  }, [backendAuthToken, dispatch, hasBackendAuth, sessionRef]);
}
