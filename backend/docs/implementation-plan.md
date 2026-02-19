# Trading Backend Migration Plan

## 1. Architecture design

```text
React App
  -> REST (create/list/close)
  -> WS client (position events)
        |
        v
Node.js Fastify Backend
  - Position REST API
  - Realtime WS Gateway
  - Coinbase WS Listener
  - TP/SL Engine
        |
        v
PostgreSQL
  - positions (source of truth)
```

### Responsibilities

- React: UI state, rendering, user actions.
- Fastify API: validates requests and persists position lifecycle.
- Coinbase listener: receives tick events from market feed.
- TP/SL engine: closes positions even when client is offline.
- Postgres: durable state and restart recovery.
- Realtime gateway: pushes `position.closed`/`position.created` events to clients.

### Data flow

1. User creates position in React.
2. React calls `POST /api/positions`.
3. Backend stores row in Postgres and adds it to in-memory active cache.
4. Coinbase sends ticker update for symbol.
5. Engine compares tick price vs TP/SL for open positions.
6. On trigger, backend atomically closes row in DB.
7. Backend emits websocket event to connected frontend clients.
8. React updates UI immediately from event.

### TP/SL check policy

- Long:
  - Stop loss triggers if `lastPrice <= stopLoss`
  - Take profit triggers if `lastPrice >= takeProfit`
- Short:
  - Stop loss triggers if `lastPrice >= stopLoss`
  - Take profit triggers if `lastPrice <= takeProfit`
- If both can trigger in same logical window, stop loss is prioritized.

### Scaling path

- Stage 1: single backend instance + Postgres.
- Stage 2: move active cache into Redis and elect one stream-consumer worker.
- Stage 3: shard by symbol partition and run multiple workers.
- Stage 4: split API and execution engine into separate services.

### Polling vs event-driven

- Polling:
  - Simpler to reason about.
  - Higher latency and unnecessary requests.
- Event-driven (this design):
  - Near real-time and efficient.
  - Requires reconnect logic and stream health checks.

## 2. Technology choices

- Backend framework: Fastify
  - Lower overhead, typed schemas, strong performance.
- Database: PostgreSQL
  - Durable ACID semantics and safe concurrent updates.
- Coinbase client: `ws` package
  - Lightweight and battle-tested for websocket client behavior.
- Frontend realtime: WebSocket
  - Bidirectional and easy to reconnect from browser.

## 3. Database schema

See `backend/migrations/001_init_positions.sql`.

## 4. Backend implementation

Implemented in:

- `backend/src/index.ts`
- `backend/src/routes/positionsRoutes.ts`
- `backend/src/services/coinbaseTickerService.ts`
- `backend/src/services/positionEngine.ts`
- `backend/src/services/realtimeGateway.ts`
- `backend/src/repositories/positionRepository.ts`

## 5. Frontend changes

Example integration files:

- `src/integration/positionsApi.ts`
- `src/integration/usePositionEvents.ts`
- `src/integration/useBackendPositions.ts`

Migration steps:

1. Replace localStorage position reads with `useBackendPositions`.
2. On create/close actions, call hook methods that hit backend API.
3. Keep chart/tick rendering local; only position lifecycle comes from backend.
4. React to websocket `position.closed` event to refresh open/closed lists.

## 6. Deployment (free-first)

Use Docker locally with `backend/docker-compose.yml`.

For hosted deployment:

1. Deploy backend container/service.
2. Provision free Postgres.
3. Set env vars from `.env.example`.
4. Point frontend `VITE_API_BASE_URL` to deployed API.
5. Use TLS (`wss://`) in production.

## 7. Reliability strategy

- Coinbase reconnect with exponential backoff.
- Heartbeat timeout terminates stale websocket.
- Atomic close query prevents duplicate closes.
- Startup bootstrap reloads open positions from DB.
- Engine is idempotent by design (`status='open'` condition).

## 8. Future improvements

- JWT auth + user ownership enforcement.
- Redis shared cache for multi-instance engine.
- Dedicated market-data worker and task queues.
- Event sourcing for trade lifecycle audit.
- Service split (API, execution, notification).
