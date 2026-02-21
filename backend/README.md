# Backend Service (TypeScript)

Production-style backend for the market replay app.

## Features

- REST API for positions
- PostgreSQL persistence
- Coinbase websocket ticker listener
- TP/SL auto-close engine that runs server-side
- JWT-authenticated REST + websocket access
- Realtime websocket updates to frontend (`/ws?token=...`)
- Reconnect and heartbeat handling for upstream Coinbase stream
- Idempotent close logic (`UPDATE ... WHERE status='open'`)
- Restart recovery by reloading open positions from DB at boot

## Project structure

```text
backend/
  src/
    config.ts
    db.ts
    index.ts
    migrate.ts
    types/domain.ts
    repositories/positionRepository.ts
    routes/positionsRoutes.ts
    services/coinbaseTickerService.ts
    services/positionEngine.ts
    services/realtimeGateway.ts
  migrations/
    001_init_positions.sql
  Dockerfile
  docker-compose.yml
  .env.example
```

## Local run (without Docker)

```bash
cd backend
cp .env.example .env
npm install
npm run migrate
npm run dev
```

## Local run (with Docker)

```bash
cd backend
docker compose up --build
```

## API

All `/api/*` routes require:

```text
Authorization: Bearer <access-token>
```

### `POST /api/positions`

```json
{
  "symbol": "BTC-USD",
  "side": "long",
  "quantity": 0.1,
  "entryPrice": 100000,
  "takeProfit": 102500,
  "stopLoss": 99500
}
```

### `GET /api/positions?status=open`

### `GET /api/positions/closed`

### `POST /api/positions/:id/close`

```json
{
  "closePrice": 101800,
  "reason": "manual"
}
```

### Websocket realtime updates

Connect to:

```text
ws://localhost:8080/ws?token=<access-token>
```

Event payload:

```json
{
  "type": "position.closed",
  "source": "engine",
  "position": {
    "id": "...",
    "status": "closed",
    "closePrice": 102500,
    "closeReason": "take_profit"
  }
}
```
