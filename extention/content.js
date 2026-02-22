// Forwards auth token changes from the web app to the background service worker.
// Session state sync has been removed — the extension reads all trading data
// directly from backend endpoints and WebSocket events.

function handleBridgeMessage(event) {
  if (event.source && event.source !== window) {
    return;
  }

  const data = event.data;
  if (!data || typeof data !== 'object') {
    return;
  }

  if (data.type !== 'MLT_AUTH_CHANGED') {
    return;
  }

  let token = data.token;
  if (!token) {
    const match = document.cookie.match(new RegExp('(^| )mlt_auth_token=([^;]+)'));
    token = match ? decodeURIComponent(match[2]) : null;
  }

  chrome.runtime.sendMessage(
    { type: 'AUTH_REFRESH', origin: window.location.origin, token },
    () => {
      void chrome.runtime.lastError;
    },
  );
}

function startAuthSync() {
  // Send initial auth state so background has a token as soon as the page loads
  const match = document.cookie.match(new RegExp('(^| )mlt_auth_token=([^;]+)'));
  const token = match ? decodeURIComponent(match[2]) : null;

  chrome.runtime.sendMessage(
    { type: 'AUTH_REFRESH', origin: window.location.origin, token },
    () => {
      void chrome.runtime.lastError;
    },
  );

  window.addEventListener('message', handleBridgeMessage);
}

startAuthSync();
