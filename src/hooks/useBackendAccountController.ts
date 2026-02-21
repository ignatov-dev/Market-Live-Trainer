import { useEffect } from 'react';
import { getTradingAccount } from '../integration/positionsApi';
import { useAppDispatch } from '../store/hooks';
import {
  setBackendAccount,
  setBackendAccountError,
  setLoadingBackendAccount,
} from '../store/slices/backendSlice';
import { useWebsocket } from '../providers/WebsocketProvider';
import type { AccountBalanceEvent } from '../integration/useAccountEvents';

interface Params {
  backendAuthToken: string | null;
  hasBackendAuth: boolean;
}

export function useBackendAccountController({
  backendAuthToken,
  hasBackendAuth,
}: Params): void {
  const dispatch = useAppDispatch();
  const { subscribeAccountEvents } = useWebsocket();

  useEffect(() => {
    if (!hasBackendAuth) {
      dispatch(setBackendAccount(null));
      dispatch(setBackendAccountError(''));
      dispatch(setLoadingBackendAccount(false));
    }
  }, [dispatch, hasBackendAuth]);

  useEffect(() => {
    if (!hasBackendAuth) {
      return;
    }

    let isCancelled = false;

    async function loadAccount() {
      dispatch(setLoadingBackendAccount(true));
      try {
        const account = await getTradingAccount();
        if (isCancelled) {
          return;
        }

        dispatch(setBackendAccount(account));
        dispatch(setBackendAccountError(''));
      } catch (error) {
        if (!isCancelled) {
          dispatch(
            setBackendAccountError(
              error instanceof Error ? error.message : 'Failed to load account.',
            ),
          );
        }
      } finally {
        if (!isCancelled) {
          dispatch(setLoadingBackendAccount(false));
        }
      }
    }

    void loadAccount();

    return () => {
      isCancelled = true;
    };
  }, [backendAuthToken, dispatch, hasBackendAuth]);

  useEffect(
    () =>
      subscribeAccountEvents((event: AccountBalanceEvent) => {
        dispatch(setBackendAccount(event.account));
        dispatch(setBackendAccountError(''));
      }),
    [dispatch, subscribeAccountEvents],
  );
}
