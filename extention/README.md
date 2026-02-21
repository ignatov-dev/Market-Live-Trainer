# Market Live Snapshot Extension

Folder: `extention`

## Architecture

`App page -> content.js -> background.js (source of truth) -> chrome.storage.local -> popup.js`

- `content.js` listens for app bridge messages (`MARKET_LIVE_SESSION_SYNC`) and syncs snapshots to extension background.
- `background.js` is the only source of truth and persists global state in `chrome.storage.local` key `market-live-state-v4`.
- `background.js` streams live prices via Coinbase WebSocket and uses REST polling as fallback.
- `background.js` also shares auth session with the app (via cookie) and connects to backend REST/WS for live account data.
- `popup.js` is UI-only: reads storage on open and updates from storage change events.

## Session model

- One shared account/session balance (10k baseline) for all pairs.
- Open positions include `pair` and are rendered as a unified list in popup.
- Equity and session return are computed globally across all open positions.

## Current content script matches

```json
[
  "http://localhost:*/*",
  "http://127.0.0.1:*/*",
  "https://localhost:*/*",
  "https://127.0.0.1:*/*"
]
```

If your app runs on another domain, add it in `manifest.json` `content_scripts.matches`.

## Load in Chrome

1. Open `chrome://extensions`.
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select this folder: `extention`.
5. Click `Reload` after any file changes.
