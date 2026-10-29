// ConsentFlow Debugger — Popup UI
// A glance: the verdict sentence, the findings with their fixes, and two actions. The
// timeline, requests and consent state live in the side panel (sidepanel/), which stays
// open while the user clicks the page's banner. Everything is rendered from
// CFFindings.computeVerdict() / buildFindings() (popup/findings.js); expanded items are
// remembered per tab in chrome.storage.session (popup/ui-state.js).
(function () {
  'use strict';

  var F = globalThis.CFFindings;
  var R = globalThis.CFRender;
  var S = globalThis.CFUiState;
  var REFRESH_MS = 4000;
  var RETRY_MS = 2500;
  var RELOAD_GRACE_MS = 1500;
  var REVIEW_URL = 'https://focosys.io/review';

  var ui = {
    open: {},          // disclosure key → true when expanded; survives refreshes and reopening
    lastKey: null,     // last rendered content; unchanged content is not re-rendered
    lastVerdict: null, // last verdict text, so the live region only speaks on change
    tabId: null,
    loaded: false,     // stored UI state has been read for this tab
    reloadUntil: 0     // ignore replies from the old page right after a reload
  };

  var ERRORS = {
    noTab: {
      title: 'No page to inspect.',
      detail: 'Open a website in this window, then reopen ConsentFlow.',
      action: false
    },
    systemPage: {
      title: "Chrome pages can't be inspected.",
      detail: 'Open a website, then reopen ConsentFlow.',
      action: false
    },
    noResponse: {
      title: "Can't read this page yet.",
      detail: 'The page loaded before ConsentFlow could start. Reload it to capture from the start.',
      action: true
    }
  };

  function el(id) { return document.getElementById(id); }

  // ─── Wiring ─────────────────────────────────────────────────
  el('openTraceBtn').addEventListener('click', openTrace);
  el('recheckBtn').addEventListener('click', reloadAndRecheck);
  el('errorAction').addEventListener('click', reloadAndRecheck);
  el('reviewCtaButton').addEventListener('click', function () {
    chrome.tabs.create({ url: REVIEW_URL });
  });
  el('findings').addEventListener('click', onDisclosure);

  function onDisclosure(event) {
    var target = event && event.target;
    var button = target && target.closest ? target.closest('[data-toggle]') : null;
    if (!button) return;
    var key = button.getAttribute('data-toggle');
    ui.open = S.toggle({ open: ui.open }, key).open;
    S.save('popup', ui.tabId, { open: ui.open });
    ui.lastKey = null;
    if (ui.state) renderContent(ui.state, key);
  }

  // Open the side panel for this tab. sidePanel.open() needs Chrome 116+ and a user
  // gesture; on older versions the panel is still listed in Chrome's side panel menu.
  function openTrace() {
    var sp = chrome.sidePanel;
    if (!sp || typeof sp.open !== 'function' || ui.tabId === null) { showTraceHint(); return; }
    try {
      var done = sp.open({ tabId: ui.tabId });
      if (done && typeof done.then === 'function') {
        done.then(function () { if (typeof globalThis.close === 'function') globalThis.close(); }, showTraceHint);
      }
    } catch (e) {
      showTraceHint();
    }
  }

  function showTraceHint() {
    setText(el('traceHint'), "Open ConsentFlow from Chrome's side panel menu to see the full trace.");
    el('traceHint').hidden = false;
  }

  // ─── Data fetching ──────────────────────────────────────────
  function fetchState() {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      var tab = tabs && tabs[0];
      if (!tab) { showError('noTab'); return; }
      ui.tabId = tab.id;
      setHost(tab.url);
      if (!ui.loaded) {
        // Restore what was expanded the last time the popup was open on this tab.
        S.load('popup', tab.id, null, function (saved) {
          ui.open = saved.open;
          ui.loaded = true;
          requestState(tab);
        });
        return;
      }
      requestState(tab);
    });
  }

  function requestState(tab) {
    chrome.tabs.sendMessage(tab.id, { action: 'getState' }, function (response) {
      if (chrome.runtime.lastError || !response) {
        // Content script not in the tab yet: ask the background to inject it, then retry.
        if (ui.view !== 'content') showLoading('Connecting to the page…');
        chrome.runtime.sendMessage({ action: 'ensureContentScript', tabId: tab.id }, function (result) {
          if (result && result.reason === 'system-page') { showError('systemPage'); return; }
          setTimeout(function () {
            chrome.tabs.sendMessage(tab.id, { action: 'getState' }, function (r) {
              if (chrome.runtime.lastError || !r) { showError('noResponse'); return; }
              render(r);
            });
          }, RETRY_MS);
        });
        return;
      }
      render(response);
    });
  }

  function reloadAndRecheck() {
    if (ui.tabId === null) { fetchState(); return; }
    chrome.tabs.reload(ui.tabId);
    ui.reloadUntil = Date.now() + RELOAD_GRACE_MS;
    ui.lastKey = null;
    showLoading('Reloading the page. Results appear in a few seconds.');
  }

  function setHost(url) {
    var host = '';
    try { host = url ? new URL(url).hostname : ''; } catch (e) { host = ''; }
    setText(el('pageMeta'), host);
  }

  // ─── View states: loading → error → content ─────────────────
  function render(state) {
    if (!state || !state.ready || Date.now() < ui.reloadUntil) {
      showLoading();
      return;
    }
    ui.state = state;
    renderContent(state);
  }

  function showLoading(detail) {
    ui.view = 'loading';
    ui.lastKey = null;
    setVerdict('loading', '– READING PAGE', 'Reading this page…',
      detail || 'Capture starts when the page loads. Results appear in a few seconds.');
    el('progress').hidden = false;
    el('errorAction').hidden = true;
    hideContent();
  }

  function showError(kind) {
    var e = ERRORS[kind];
    ui.view = 'error';
    ui.lastKey = null;
    setVerdict('error', '– NOT CONNECTED', e.title, e.detail);
    el('progress').hidden = true;
    el('errorAction').hidden = !e.action;
    hideContent();
  }

  function hideContent() {
    el('findings').hidden = true;
    el('actions').hidden = true;
    el('reviewCta').hidden = true;
  }

  function renderContent(state, focusKey) {
    var findings = F.buildFindings(state);
    var verdict = F.computeVerdict(state, findings);
    ui.view = 'content';

    setVerdict(verdict.status, verdict.label, verdict.title, verdict.detail);
    el('progress').hidden = true;
    el('errorAction').hidden = true;
    setText(el('checkedAt'), 'Checked ' + R.clock(new Date()) + ' · this page load');
    el('actions').hidden = false;
    el('reviewCta').hidden = !verdict.showReviewCta;

    var key = JSON.stringify([findings, ui.open]);
    if (key === ui.lastKey) return; // nothing changed: keep scroll, focus and DOM as they are
    ui.lastKey = key;

    var active = document.activeElement;
    var activeKey = focusKey || (active && active.getAttribute ? active.getAttribute('data-toggle') : null);
    var scroller = document.scrollingElement;
    var scrollTop = scroller ? scroller.scrollTop : 0;

    el('findings').innerHTML = R.findingsHtml(findings, ui.open);
    el('findings').hidden = false;

    if (scroller) scroller.scrollTop = scrollTop;
    if (activeKey && typeof document.querySelector === 'function') {
      var again = document.querySelector('[data-toggle="' + activeKey + '"]');
      if (again && again.focus) again.focus();
    }
  }

  function setVerdict(state, label, title, detail) {
    var text = label + '|' + title + '|' + detail;
    if (text === ui.lastVerdict) return; // the live region only speaks when the verdict changes
    ui.lastVerdict = text;
    el('verdict').setAttribute('data-state', state);
    el('verdictLabel').className = 'status-tag ' + (R.STATUS_TAGS[state] ? R.STATUS_TAGS[state].cls : state);
    setText(el('verdictLabel'), label);
    setText(el('verdictTitle'), title);
    setText(el('verdictDetail'), detail);
  }

  function setText(node, text) {
    if (node.textContent !== text) node.textContent = text;
  }

  // ─── Init ───────────────────────────────────────────────────
  fetchState();
  setInterval(fetchState, REFRESH_MS);
})();
