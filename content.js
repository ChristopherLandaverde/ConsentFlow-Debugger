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
  let lastBadgeKey = null;

  // ─── Toolbar badge ────────────────────────────────────────────
  // A new page starts with no badge; background.js clears the previous page's count.
  sendToBackground({ action: 'pageStart' });

  // Send the rule and tag results (not the captured timeline or requests) to background.js
  // when they change, so it can set the badge from the same verdict the popup shows.
  function reportToBackground(state) {
    if (!state || !state.ready) return;
    const summary = {
      ready: true,
      validation: state.validation || [],
      tagImpact: state.tagImpact || []
    };
    const key = JSON.stringify([
      summary.validation.map(function (r) { return [r.id, r.status]; }),
      summary.tagImpact.map(function (t) { return [t.name, t.verdict]; })
    ]);
    if (key === lastBadgeKey) return;
    lastBadgeKey = key;
    sendToBackground({ action: 'pageState', state: summary });
  }

  function sendToBackground(message) {
    try {
      chrome.runtime.sendMessage(message, function () { void chrome.runtime.lastError; });
    } catch { /* extension reloaded: nothing to update */ }
  }

  // The page's own name for the side panel, which has no tab URL without extra permissions.
  function withPage(state) {
    const out = Object.assign({}, state);
    out.page = { host: location.hostname };
    return out;
  }

  // Listen for messages from the injected page-context script
  window.addEventListener('message', function (event) {
    if (!event.data || event.data.source !== 'cf-debug-injected') return;

    if (event.data.type === 'full-state') {
      cachedState = event.data.payload;
      reportToBackground(cachedState);
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
      // Always answer with a fresh read: the cache can be seconds old and miss the page's
      // latest consent commands (#22). requestFreshState falls back to the cache after 3 s.
      requestFreshState().then(function (state) {
        sendResponse(state ? withPage(state) : { ready: false });
      });
      return true; // keep channel open for async
    }
  });

  // Request initial state after a delay to let injected.js initialize, then keep the badge
  // current while the tab is visible (injected.js re-runs its rules every 3 s).
  setTimeout(requestFreshState, 2000);
  setInterval(function () {
    if (document.visibilityState === 'visible') requestFreshState();
  }, 3000);
})();
