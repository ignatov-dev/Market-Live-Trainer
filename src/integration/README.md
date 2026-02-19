# Frontend backend integration notes

Use `useBackendPositions` instead of localStorage-based position persistence.

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
  entryPrice: currentPrice,
  takeProfit: 102500,
  stopLoss: 99500,
});

await close(positionId, currentPrice);
```

### Env var

```bash
VITE_API_BASE_URL=http://localhost:8080
```

### Files

- `positionsApi.ts`: REST client
- `usePositionEvents.ts`: websocket reconnect client
- `useBackendPositions.ts`: high-level state hook
