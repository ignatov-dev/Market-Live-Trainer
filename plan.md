# Plan: Share Auth Session Between React App and Extension

## Goal

Extension background service worker authenticates with the same JWT the React app
uses, fetches positions/account from backend REST endpoints, and keeps them live via
a backend WebSocket — independently of whether the app tab is open.

---

## Overview of Changes

```
React App                          Extension
──────────────────────────────     ──────────────────────────────────────────
AuthProvider.tsx                   manifest.json
  └─ writes cookie on login    →     ├─ cookies permission
  └─ clears cookie on logout         └─ host_permissions for app + backend

                                   background.js
                                     ├─ readAuthCookie()  ← chrome.cookies API
                                     ├─ fetchBackendPositions()  Bearer token
                                     ├─ fetchBackendAccount()    Bearer token
                                     ├─ startBackendSocket()     wss://?token=
                                     └─ writes to chrome.storage.local

                                   popup.js
                                     └─ renders backend positions + account
```

---

## Step 1 — React App: Write JWT to a Cookie

**File:** `src/providers/AuthProvider.tsx`

After `applyBackendAuthToken(token)` is called (both on login and on session restore),
write the token to a browser cookie. When sign-out clears the token, also clear the
cookie.

Add a helper alongside the `applyBackendAuthToken` callback:

```ts
// Cookie name the extension will read
const AUTH_COOKIE_NAME = 'mlt_auth_token';

function writeAuthCookie(token: string | null) {
  if (typeof token === 'string' && token.length > 0) {
    // max-age=3600 matches a typical 1-hour JWT lifetime.
    // SameSite=Strict is fine — the extension reads via cookies API, not HTTP.
    // Do NOT set Secure on localhost (breaks on plain HTTP).
    document.cookie = `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}; path=/; SameSite=Strict; max-age=3600`;
  } else {
    // Clear the cookie by setting max-age=0
    document.cookie = `${AUTH_COOKIE_NAME}=; path=/; SameSite=Strict; max-age=0`;
  }
}
```

Call `writeAuthCookie(token)` inside `applyBackendAuthToken` right after
`setBackendAuthToken(finalToken)`.

Call `writeAuthCookie(null)` inside `handleAuthSignOut` before `applyBackendAuthToken(null)`.

**Token refresh:** Neon Auth JWTs expire (~1 hour). If the app refreshes its token
(e.g. `getAuthJwtToken()` is called again), it will call `applyBackendAuthToken` again,
which will overwrite the cookie with the fresh token. The extension picks up the new
cookie on its next read. No extra code needed.

---

## Step 2 — Extension Manifest: Permissions

**File:** `extention/manifest.json`

Add `"cookies"` to permissions. Add host permissions for the app origin (localhost
for dev, production domain for prod) AND for the backend API origin so the background
can make fetch calls and read cookies for that domain.

```json
{
  "permissions": ["storage", "alarms", "cookies"],
  "host_permissions": [
    "http://localhost:*/*",
    "http://127.0.0.1:*/*",
    "https://localhost:*/*",
    "https://api.exchange.coinbase.com/*",
    "https://ws-feed.exchange.coinbase.com/*"
  ]
}
```

> If backend runs on a different origin than the app (e.g. `http://localhost:4000`),
> add that origin explicitly. `chrome.cookies.get` requires a host_permission for the
> domain of the cookie URL you query.

---

## Step 3 — Background: Read the Auth Cookie

**File:** `extention/background.js`

Add a constant for the cookie name and a URL that matches where the app runs:

```js
const AUTH_COOKIE_NAME = 'mlt_auth_token';
const AUTH_COOKIE_URL = 'http://localhost:5173'; // adjust for production
const BACKEND_BASE_URL = 'http://localhost:8080'; // adjust to match VITE_API_BASE_URL
```

Add a helper that reads the cookie via the `chrome.cookies` API:

```js
async function readAuthCookie() {
  try {
    const cookie = await chrome.cookies.get({ url: AUTH_COOKIE_URL, name: AUTH_COOKIE_NAME });
    if (!cookie || typeof cookie.value !== 'string' || cookie.value.length === 0) {
      return null;
    }
    return decodeURIComponent(cookie.value);
  } catch {
    return null;
  }
}
```

Store the resolved token in a module-level variable alongside other state so it does
not need to be re-read on every request:

```js
let backendAuthToken = null; // populated by refreshAuthToken()

async function refreshAuthToken() {
  backendAuthToken = await readAuthCookie();
  return backendAuthToken;
}
```

Call `refreshAuthToken()` inside `bootstrap()` and whenever the extension receives
a message that the app session changed (see Step 6).

---

## Step 4 — Background: Fetch Backend Positions and Account

**File:** `extention/background.js`

Add fetch helpers that mirror `positionsApi.ts` but in plain JS:

```js
async function backendFetch(path) {
  if (!backendAuthToken) {
    return null;
  }

  try {
    const response = await fetch(`${BACKEND_BASE_URL}${path}`, {
      headers: {
        Authorization: `Bearer ${backendAuthToken}`,
        Accept: 'application/json',
      },
    });

    if (response.status === 401) {
      // Token expired — clear it so popup shows "login required"
      backendAuthToken = null;
      await writeState((state) => ({ ...state, backendAuth: false }));
      return null;
    }

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch {
    return null;
  }
}

async function fetchBackendPositions() {
  const data = await backendFetch('/api/positions?status=open');
  return Array.isArray(data?.data) ? data.data : null;
}

async function fetchBackendAccount() {
  const data = await backendFetch('/api/account');
  return data?.data ?? null;
}
```

Create a combined refresh function:

```js
async function refreshBackendData() {
  if (!backendAuthToken) {
    await refreshAuthToken();
  }
  if (!backendAuthToken) {
    return; // still no token — user not logged in
  }

  const [positions, account] = await Promise.all([
    fetchBackendPositions(),
    fetchBackendAccount(),
  ]);

  if (positions !== null || account !== null) {
    await writeState((state) => ({
      ...state,
      backendPositions: positions ?? state.backendPositions ?? [],
      backendAccount: account ?? state.backendAccount ?? null,
      backendAuth: true,
      lastBackendSyncAt: Date.now(),
    }));
  }
}
```

Call `refreshBackendData()` in `bootstrap()` and from the alarm handler alongside
`refreshMarksViaRest()`.

---

## Step 5 — Background: Backend WebSocket

**File:** `extention/background.js`

The backend WebSocket endpoints (from `positionsApi.ts`) are:
- `wss://<backend>/ws/positions?token=<jwt>` — real-time position updates
- `wss://<backend>/ws/account?token=<jwt>` — real-time account/balance updates

Add a second WebSocket alongside the existing Coinbase one. Use the same
session-ID + exponential backoff reconnect pattern that already exists:

```js
let backendWs = null;
let backendWsSessionId = 0;
let backendWsReconnectTimer = null;
let backendWsReconnectAttempts = 0;

function buildBackendWsUrl(path) {
  const base = BACKEND_BASE_URL
    .replace(/^http:/, 'ws:')
    .replace(/^https:/, 'wss:');
  return `${base}${path}?token=${encodeURIComponent(backendAuthToken)}`;
}

function stopBackendSocket() {
  backendWsSessionId += 1;
  if (backendWsReconnectTimer !== null) {
    clearTimeout(backendWsReconnectTimer);
    backendWsReconnectTimer = null;
  }
  if (backendWs) {
    try {
      backendWs.onopen = null;
      backendWs.onmessage = null;
      backendWs.onerror = null;
      backendWs.onclose = null;
      backendWs.close();
    } catch { /* ignore */ }
    backendWs = null;
  }
  backendWsReconnectAttempts = 0;
}

function startBackendSocket() {
  if (!backendAuthToken) return;
  if (backendWs && (backendWs.readyState === WebSocket.OPEN || backendWs.readyState === WebSocket.CONNECTING)) return;

  const localSessionId = ++backendWsSessionId;
  // Subscribe to positions WebSocket (receives open/close/update events)
  const socket = new WebSocket(buildBackendWsUrl('/ws/positions'));
  backendWs = socket;

  socket.onopen = () => {
    if (localSessionId !== backendWsSessionId) return;
    backendWsReconnectAttempts = 0;
  };

  socket.onmessage = (event) => {
    if (localSessionId !== backendWsSessionId) return;
    try {
      const msg = JSON.parse(event.data);
      // Backend emits { type: 'position_update'|'position_close', data: Position }
      // or { type: 'snapshot', data: Position[] }
      // Re-fetch REST on any event to stay consistent with backend truth.
      void refreshBackendData();
    } catch { /* ignore malformed */ }
  };

  socket.onerror = () => {
    if (localSessionId !== backendWsSessionId) return;
    try { socket.close(); } catch { /* ignore */ }
  };

  socket.onclose = () => {
    if (localSessionId !== backendWsSessionId) return;
    if (backendWs === socket) backendWs = null;

    if (!backendAuthToken) return; // don't reconnect if logged out

    backendWsReconnectAttempts += 1;
    const delay = Math.min(30000, 1000 * 2 ** Math.max(0, backendWsReconnectAttempts - 1));
    backendWsReconnectTimer = setTimeout(() => {
      backendWsReconnectTimer = null;
      startBackendSocket();
    }, delay);
  };
}
```

> Alternatively, subscribe to `/ws/account` in a second socket or combine both in
> one `/ws` multiplex connection if the backend supports it. Check `realtimeGateway.ts`
> to see what events each endpoint emits and adapt the message handler accordingly.

---

## Step 6 — Background: Wire Into Existing Message Handling

**File:** `extention/background.js`

Add a new message type `AUTH_REFRESH` that the content script (or popup) can send
to trigger a cookie re-read and socket restart. Also refresh on every `APP_SESSION_SYNC`
since that means the app is active:

In the `chrome.runtime.onMessage` handler, inside the `APP_SESSION_SYNC` branch,
add after `await updateSessionState(payload)`:

```js
// Re-read token in case app just logged in or refreshed JWT
await refreshAuthToken();
startBackendSocket();
void refreshBackendData();
```

Add a new branch:

```js
if (type === 'AUTH_REFRESH') {
  await refreshAuthToken();
  if (backendAuthToken) {
    startBackendSocket();
    await refreshBackendData();
    sendResponse({ ok: true });
  } else {
    stopBackendSocket();
    sendResponse({ ok: false, error: 'No auth cookie found.' });
  }
  return;
}
```

Update `bootstrap()`:

```js
async function bootstrap() {
  await applyBadgeStyle();
  await initializeStateFromStorage();
  await touchState();
  await ensureAlarm();
  startCoinbaseSocket();

  // NEW: initialize backend auth and connection
  await refreshAuthToken();
  if (backendAuthToken) {
    startBackendSocket();
    void refreshBackendData();
  }
}
```

---

## Step 7 — Background: State Schema Update

**File:** `extention/background.js`

Update `defaultState()` to include backend fields:

```js
function defaultState() {
  return {
    version: 4,                   // bump version when schema changes
    // existing fields...
    initialBalance: 10000,
    sessionBalance: 10000,
    feeRate: 0.0004,
    positions: [],
    marksByPair: {},
    equity: 10000,
    sessionReturnPct: 0,
    status: 'idle',
    lastAppSyncAt: null,
    lastPriceSyncAt: null,
    updatedAt: Date.now(),
    // new fields
    backendAuth: false,           // true when a valid token was found
    backendPositions: [],         // Position[] from /api/positions?status=open
    backendAccount: null,         // TradingAccount from /api/account
    lastBackendSyncAt: null,
  };
}
```

Also update `STORAGE_KEY` to `'market-live-state-v4'` so stale v3 state doesn't
bleed into the new schema.

---

## Step 8 — Popup: Render Backend Data

**File:** `extention/popup.js`

The popup already reacts to `chrome.storage.onChanged`. Add rendering for the new
backend fields:

- If `backendAuth === false`: show a notice "Sign in at Market Live Trainer to see
  live backend data."
- If `backendPositions` is populated: render them (they have richer data than the
  app-bridge positions — `id`, `takeProfit`, `stopLoss`, `closePnl`, etc.)
- If `backendAccount` is set: show `cashBalance` and `initialBalance`.

These can replace or supplement the existing position cards rendered from the Coinbase
bridge data.

---

## Step 9 — Content Script: Trigger Auth Refresh on App Load

**File:** `extention/content.js`

When the content script first runs (app page loaded), send `AUTH_REFRESH` to the
background so it picks up a fresh cookie immediately, without waiting for the next
alarm tick:

```js
// At the end of startSync(), after the first sendState():
chrome.runtime.sendMessage({ type: 'AUTH_REFRESH' }, () => {
  // Ignore response — background handles it
  void chrome.runtime.lastError;
});
```

---

## Security Notes

- The cookie is **non-HttpOnly** (set by client-side JS) so it's readable by any
  script on the same origin. This is the same risk level as storing the token in
  `localStorage`. Acceptable for a dev/training tool. For production hardening, have
  the backend set an HttpOnly `Set-Cookie` header on login response instead — the
  `chrome.cookies` API can read HttpOnly cookies even though page JS cannot.

- Set `Secure` on the cookie when deployed to HTTPS:
  ```ts
  const isSecure = location.protocol === 'https:';
  document.cookie = `${AUTH_COOKIE_NAME}=${...}; path=/; SameSite=Strict; max-age=3600${isSecure ? '; Secure' : ''}`;
  ```

- The extension only needs `host_permissions` for origins it actually reads cookies
  from or fetches. Keep this list minimal.

---

## Files Changed Summary

| File | Change |
|---|---|
| `src/providers/AuthProvider.tsx` | Write/clear `mlt_auth_token` cookie in `applyBackendAuthToken` and `handleAuthSignOut` |
| `extention/manifest.json` | Add `cookies` permission, add localhost to `host_permissions` |
| `extention/background.js` | `readAuthCookie`, `refreshAuthToken`, `backendFetch`, `fetchBackendPositions`, `fetchBackendAccount`, `refreshBackendData`, `startBackendSocket`, `stopBackendSocket`, new state fields, updated `bootstrap` and message handler |
| `extention/popup.js` | Render `backendAuth`, `backendPositions`, `backendAccount` |
| `extention/content.js` | Send `AUTH_REFRESH` on startup |
