# Market Live Snapshot Extension

Folder: `extention`

## Architecture

`App page -> content.js -> background.js (source of truth) --port--> popup.js`

- `content.js` forwards auth token changes (`MLT_AUTH_CHANGED`) to the background service worker. No session state is synced.
- `background.js` is the only source of truth and keeps all state **in-memory only** (no `chrome.storage` persistence).
- `background.js` connects to backend REST endpoints and WebSocket channels (`/ws`, `/ws/positions`, `/ws/account`, `/ws/market`) as the sole data sources.
- `background.js` streams live prices via the backend market WebSocket and falls back to Coinbase REST on the alarm interval.
- `popup.js` is UI-only: connects to background via a long-lived port (`chrome.runtime.connect`) and renders state updates pushed by the background.

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
