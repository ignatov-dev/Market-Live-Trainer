# Frontend backend integration notes

Use `useBackendPositions` for backend-based position persistence.

```tsx
const userId = 'demo-user';
const {
  openPositions,
  closedPositions,
  create,
  close,
  loading,
  error,
} = useBackendPositions({ userId });

await create({
  symbol: 'BTC-USD',
  side: 'long',
  quantity: 0.1,
  entryPrice: currentPrice,
  takeProfit: 102500,
  stopLoss: 99500,
});

await close(positionId, currentPrice);
```

### Env vars

```bash
VITE_BACKEND_PROXY_TARGET=https://your-render-service.onrender.com
VITE_BACKEND_USER_ID=demo-user
```

`VITE_API_BASE_URL` is optional. If omitted, the app uses same-origin paths (`/api`, `/ws`) and relies on Vite proxy in local dev.

### Files

- `positionsApi.ts`: REST client
- `usePositionEvents.ts`: websocket reconnect client
- `useBackendPositions.ts`: high-level state hook
