# Market Live Trainer (Vite + React)

Standalone MVP for a 1-week internal hackathon.

## What it does

- Live market view for `BTC/USDT`, `ETH/USDT`, and `SOL/USDT`.
- Chart includes x-axis date/time ticks for the exact visible candle window.
- Data source: `Coinbase API` only.
- Timeframe selector:
  - `1 Minute`
  - `15 Minutes`
  - `1 Hour`
  - `1 Day`
  - `1 Week`
- Paper trading with:
  - Market orders
  - Limit orders
  - Optional stop-loss / take-profit
  - Manual position close
  - Backend-backed position lifecycle via API (`/api/positions`)
- Tracks session analytics:
  - Net PnL, win rate, profit factor, max drawdown, avg R, avg hold time
  - Equity curve
- Generates a rule-based "AI Coach" report with:
  - Top mistakes
  - Suggested improvements
  - Session score

## Run locally

```bash
cd /Users/evgeniy.ignatov/Desktop/xbo/project/Market-Live-Trainer
pnpm install
pnpm run dev
```

Open the local URL printed by Vite.

## Local frontend + remote API (Render/Neon)

If you want to run only React locally and send all position API/WebSocket traffic to your deployed backend:

1. Create `/Users/evgeniy.ignatov/Desktop/xbo/project/Market-Live-Trainer/.env.local`:

```bash
VITE_BACKEND_PROXY_TARGET=https://your-render-service.onrender.com
VITE_NEON_AUTH_URL=https://your-neon-auth-host/auth
VITE_BACKEND_AUTH_TOKEN=
```

`VITE_BACKEND_AUTH_TOKEN` can stay empty if you sign in via the in-app auth form.

2. Start frontend only:

```bash
pnpm run dev
```

Vite proxies `/api`, `/ws`, and `/health` to `VITE_BACKEND_PROXY_TARGET`.  
Positions will be stored in the database configured by that backend (for example Neon).

## Build

```bash
npm run build
npm run preview
```

## Tech

- React 18
- Vite 5
- Canvas chart rendering (no chart library)
- Node.js TypeScript backend available in `backend/` for persistent positions and server-side TP/SL auto-close

## Notes

- Coinbase mode fetches candles from the public endpoint:
  - `https://api.exchange.coinbase.com/products/{PRODUCT}/candles`
- Coinbase candles are fetched in multiple paginated requests (default: up to 20 batches).
- Timeframes `1m`, `15m`, `1h`, `1d` use direct Coinbase candle granularities.
- Timeframe `1w` is aggregated from Coinbase daily candles in-app.
- App connects to Coinbase WebSocket feed (`wss://ws-feed.exchange.coinbase.com`) and updates/extends the active candle in real time.
- If the API call fails (network/CORS/rate limits), the app shows a fetch error and keeps current data.
- Trade execution is intentionally simplified for MVP speed.
- If both SL and TP are touched in the same candle, SL is filled first (conservative assumption).

## Backend migration (new)

Server-side production-style architecture is added under `backend/`:

- REST API for positions
- PostgreSQL persistence
- Coinbase websocket ticker listener
- TP/SL auto-close engine that runs even when browser is closed
- Realtime websocket notifications for frontend updates

See:

- `backend/README.md`
- `backend/docs/implementation-plan.md`

## 7-Day Execution Plan

1. Day 1: Scope lock, app shell, Coinbase live data integration.
2. Day 2: Live chart engine and candlestick rendering.
3. Day 3: Paper trading engine (market/limit, SL/TP, manual close).
4. Day 4: Metrics (PnL, win rate, drawdown, profit factor, equity curve).
5. Day 5: Rule-based AI coach report and tuning.
6. Day 6: UI polish, responsiveness, bug fixes, edge-case testing.
7. Day 7: Demo script, 2-3 minute video recording, repo cleanup.
