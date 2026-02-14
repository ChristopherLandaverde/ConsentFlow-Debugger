// ConsentFlow Debugger — Content Script (Bridge)
// Runs at document_start in the content script isolated world.
// Injects the page-context engine, relays data between page and popup.
(function () {
  'use strict';
  if (window.__cfContentLoaded) return;
  window.__cfContentLoaded = true;

  // ─── Inject page-context script synchronously ─────────────────
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('injected.js');
  script.onload = function () { script.remove(); };
  (document.head || document.documentElement).appendChild(script);

  // ─── State cache (populated by messages from injected.js) ─────
  let cachedState = null;
  let pendingRequests = {};

  // Listen for messages from the injected page-context script
  window.addEventListener('message', function (event) {
    if (!event.data || event.data.source !== 'cf-debug-injected') return;

    if (event.data.type === 'full-state') {
      cachedState = event.data.payload;
      // Resolve any pending request
      const reqId = event.data.requestId;
      if (reqId && pendingRequests[reqId]) {
        pendingRequests[reqId](cachedState);
        delete pendingRequests[reqId];
      }
    }

    if (event.data.type === 'ready') {
      // Request initial state
      requestFreshState();
    }

    if (event.data.type === 'event') {
      // Update cache incrementally if we have one
      if (cachedState && event.data.payload) {
        cachedState.timeline = cachedState.timeline || [];
        cachedState.timeline.push(event.data.payload);
        if (cachedState.timeline.length > 300) {
          cachedState.timeline = cachedState.timeline.slice(-300);
        }
      }
    }
  });

  function requestFreshState() {
    return new Promise(function (resolve) {
      const reqId = 'req_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
      pendingRequests[reqId] = resolve;
      window.postMessage({
        source: 'cf-debug-content',
        type: 'get-state',
        requestId: reqId
      }, '*');
      // Timeout after 3s
      setTimeout(function () {
        if (pendingRequests[reqId]) {
          pendingRequests[reqId](cachedState);
          delete pendingRequests[reqId];
        }
      }, 3000);
    });
  }

  // ─── Handle messages from popup / background ──────────────────
  chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    if (!request || !request.action) return;

    if (request.action === 'ping') {
      sendResponse({ ok: true });
      return;
    }

    if (request.action === 'getState') {
      // Return cached state or request fresh
      if (cachedState && cachedState.ready) {
        // Still request a fresh one in the background for next time
        requestFreshState();
        sendResponse(cachedState);
      } else {
        requestFreshState().then(function (state) {
          sendResponse(state || { ready: false });
        });
        return true; // keep channel open for async
      }
    }
  });

  // Request initial state after a delay to let injected.js initialize
  setTimeout(requestFreshState, 2000);
})();
