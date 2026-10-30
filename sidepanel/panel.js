// ConsentFlow Debugger — Side panel
// "Show me the trace": the findings in full, the timeline, the requests and the consent
// state for the active tab in this window. Unlike the popup it stays open while the user
// clicks the page's banner, so it refreshes every 2 seconds. Each view re-renders only when
// its own data changed, and scroll, focus and expanded items are kept across refreshes.
// The selected view and expanded items are remembered per tab in chrome.storage.session.
(function () {
  'use strict';

  var F = globalThis.CFFindings;
  var R = globalThis.CFRender;
  var S = globalThis.CFUiState;
  var esc = R.esc;
  var REFRESH_MS = 2000;
  var RETRY_MS = 2500;
  var RELOAD_GRACE_MS = 1500;
  var VIEWS = ['findings', 'timeline', 'requests', 'consent'];
  var SUPPORTED_CMPS = ['Cookiebot', 'OneTrust', 'IAB TCF CMPs', 'CookieYes', 'CookieConsent', 'Osano',
    'Klaro', 'Cookie Information', 'Usercentrics', 'iubenda'];

  var ui = {
    tabId: null,
    open: {},
    view: 'findings',
    keys: {},          // view → last rendered key; unchanged views are not re-rendered
    lastVerdict: null,
    reloadUntil: 0,
    state: null
  };

  function el(id) { return document.getElementById(id); }

  // ─── Wiring ─────────────────────────────────────────────────
  el('recheckBtn').addEventListener('click', reloadAndRecheck);
  el('errorAction').addEventListener('click', reloadAndRecheck);
  el('tablist').addEventListener('click', function (event) {
    var tab = closestView(event && event.target);
    if (tab) selectView(tab.getAttribute('data-view'), true);
  });
  el('tablist').addEventListener('keydown', onTabKey);
  VIEWS.forEach(function (v) { el('view-' + v).addEventListener('click', onDisclosure); });

  // The panel follows the active tab of its window.
  chrome.tabs.onActivated.addListener(function () { fetchState(); });
  chrome.tabs.onUpdated.addListener(function (tabId, info) {
    if (tabId === ui.tabId && info && info.status === 'loading') {
      ui.reloadUntil = Date.now() + RELOAD_GRACE_MS;
      showLoading('The page is loading. Capture restarts from the beginning.');
    }
  });

  function closestView(target) {
    return target && target.closest ? target.closest('[data-view]') : null;
  }

  // WAI-ARIA APG tabs with automatic activation: arrows move and select, Home/End jump.
  function onTabKey(event) {
    var i = VIEWS.indexOf(ui.view);
    var next = null;
    if (event.key === 'ArrowRight') next = VIEWS[(i + 1) % VIEWS.length];
    else if (event.key === 'ArrowLeft') next = VIEWS[(i - 1 + VIEWS.length) % VIEWS.length];
    else if (event.key === 'Home') next = VIEWS[0];
    else if (event.key === 'End') next = VIEWS[VIEWS.length - 1];
    if (!next) return;
    if (event.preventDefault) event.preventDefault();
    selectView(next, true);
    var tab = el('tab-' + next);
    if (tab.focus) tab.focus();
  }

  function selectView(view, persist) {
    if (VIEWS.indexOf(view) === -1) return;
    ui.view = view;
    VIEWS.forEach(function (v) {
      var selected = v === view;
      el('tab-' + v).setAttribute('aria-selected', selected ? 'true' : 'false');
      el('tab-' + v).setAttribute('tabindex', selected ? '0' : '-1');
      el('view-' + v).hidden = !selected;
    });
    if (persist) save();
  }

  function onDisclosure(event) {
    var target = event && event.target;
    var button = target && target.closest ? target.closest('[data-toggle]') : null;
    if (!button) return;
    var key = button.getAttribute('data-toggle');
    ui.open = S.toggle({ open: ui.open }, key).open;
    save();
    ui.keys = {};
    if (ui.state) renderContent(ui.state, key);
  }

  function save() { S.save('panel', ui.tabId, { open: ui.open, view: ui.view }); }

  // ─── Data fetching ──────────────────────────────────────────
  function fetchState() {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      var tab = tabs && tabs[0];
      if (!tab) { showError("Can't find the active tab.", 'Select a tab with a website in this window.', false); return; }
      if (tab.id !== ui.tabId) {
        // Another tab: restore what was selected and expanded the last time it was traced.
        ui.tabId = tab.id;
        ui.keys = {};
        ui.state = null;
        setText(el('pageMeta'), '');
        S.load('panel', tab.id, VIEWS, function (saved) {
          if (tab.id !== ui.tabId) return;
          ui.open = saved.open;
          selectView(saved.view, false);
          requestState(tab.id);
        });
        return;
      }
      requestState(tab.id);
    });
  }

  function requestState(tabId) {
    chrome.tabs.sendMessage(tabId, { action: 'getState' }, function (response) {
      if (tabId !== ui.tabId) return;
      if (chrome.runtime.lastError || !response) {
        if (ui.state) return; // keep the last good trace through a missed refresh
        if (ui.mode !== 'loading') showLoading('Connecting to the page…');
        chrome.runtime.sendMessage({ action: 'ensureContentScript', tabId: tabId }, function (result) {
          if (result && result.reason === 'system-page') { showUnreadable(); return; }
          setTimeout(function () {
            chrome.tabs.sendMessage(tabId, { action: 'getState' }, function (r) {
              if (tabId !== ui.tabId) return;
              if (chrome.runtime.lastError || !r) { showUnreadable(); return; }
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
    showLoading('Reloading the page. Results appear in a few seconds.');
  }

  // ─── View states: loading → error → content ─────────────────
  function render(state) {
    if (!state || !state.ready || Date.now() < ui.reloadUntil) { showLoading(); return; }
    ui.state = state;
    renderContent(state);
  }

  function showLoading(detail) {
    ui.mode = 'loading';
    ui.state = null;
    ui.keys = {};
    setVerdict('loading', '– READING PAGE', 'Reading this page…',
      detail || 'Capture starts when the page loads. Results appear in a few seconds.');
    el('progress').hidden = false;
    el('errorAction').hidden = true;
    el('content').hidden = true;
  }

  function showUnreadable() {
    showError("Can't read this tab.",
      "Chrome pages can't be inspected. On a website, reload to capture from the start.", true);
  }

  function showError(title, detail, action) {
    ui.mode = 'error';
    ui.state = null;
    ui.keys = {};
    setVerdict('error', '– NOT CONNECTED', title, detail);
    el('progress').hidden = true;
    el('errorAction').hidden = !action;
    el('content').hidden = true;
  }

  function renderContent(state, focusKey) {
    var findings = F.buildFindings(state);
    var verdict = F.computeVerdict(state, findings);
    ui.mode = 'content';

    setVerdict(verdict.status, verdict.label, verdict.title, verdict.detail);
    el('progress').hidden = true;
    el('errorAction').hidden = true;
    el('content').hidden = false;
    setText(el('pageMeta'), (state.page && state.page.host) || '');
    setText(el('checkedAt'), 'Updated ' + R.clock(new Date()) + ' · this page load');

    var events = relevantEvents(state);
    var hits = state.networkHits || [];
    setText(el('count-findings'), String(verdict.counts.broken + verdict.counts.review));
    setText(el('count-timeline'), String(events.length));
    setText(el('count-requests'), String(hits.length));

    var active = document.activeElement;
    var activeKey = focusKey || (active && active.getAttribute ? active.getAttribute('data-toggle') : null);
    var scroller = document.scrollingElement;
    var scrollTop = scroller ? scroller.scrollTop : 0;
    var changed = false;

    changed = patch('findings', [findings, pick(ui.open, /^(ev-|nc-|passed$)/)], function () {
      return R.findingsHtml(findings, ui.open, 'pf-');
    }) || changed;
    changed = patch('timeline', [state.timeline || [], !!ui.open['tl-other']], function () {
      return timelineHtml(state);
    }) || changed;
    changed = patch('requests', [hits, !!ui.open['req-raw']], function () {
      return requestsHtml(hits);
    }) || changed;
    changed = patch('consent', [state.currentConsent || {}, state.cmp || null, !!ui.open['cmp-list']], function () {
      return consentHtml(state);
    }) || changed;
    if (!changed) return;

    if (scroller) scroller.scrollTop = scrollTop;
    if (activeKey && typeof document.querySelector === 'function') {
      var again = document.querySelector('[data-toggle="' + activeKey + '"]');
      if (again && again.focus) again.focus();
    }
  }

  // Re-render one view only when its data changed.
  function patch(view, data, html) {
    var key = JSON.stringify(data);
    if (ui.keys[view] === key) return false;
    ui.keys[view] = key;
    el('view-' + view).innerHTML = html();
    return true;
  }

  function pick(obj, re) {
    var out = {};
    Object.keys(obj).forEach(function (k) { if (re.test(k)) out[k] = obj[k]; });
    return out;
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

  // ─── Timeline ───────────────────────────────────────────────
  function relevantEvents(state) {
    return (state.timeline || []).filter(function (e) { return R.RELEVANT.indexOf(e.type) !== -1; });
  }

  function timelineHtml(state) {
    var all = state.timeline || [];
    var relevant = relevantEvents(state);
    var others = all.length - relevant.length;
    var showOthers = !!ui.open['tl-other'];
    var rows = showOthers ? all : relevant;
    if (!all.length) {
      return emptyHtml('No consent or tag events yet.', 'Events appear as the page runs. Reload to capture from the start.');
    }
    var changes = R.consentChanges(all);
    var html = '<p class="view-intro">Consent commands, Google tag config, GTM load and vendor requests, '
      + 'in ms after page start.</p>';
    if (rows.length) {
      html += '<div class="table-wrap"><table class="trace-table">'
        + '<caption class="visually-hidden">Timeline of this page load</caption>'
        + '<thead><tr><th scope="col">After start</th><th scope="col">Event and consent change</th></tr></thead><tbody>';
      rows.forEach(function (e) {
        html += '<tr><td class="t-time">' + esc(R.msLabel(e.ms)) + '</td>'
          + '<td>' + eventCell(e) + changeCell(e, changes[e.id]) + '</td></tr>';
      });
      html += '</tbody></table></div>';
    } else {
      html += '<p class="trace-empty">No consent or tag events yet. Only other dataLayer events so far.</p>';
    }
    if (others > 0) {
      html += R.disclosureButton('tl-other', 'view-timeline', showOthers,
        (showOthers ? 'Hide ' : 'Show ') + others + (others === 1 ? ' other dataLayer event' : ' other dataLayer events'));
    }
    return html;
  }

  function eventCell(e) {
    var d = e.detail || {};
    var label = '<span class="t-label">' + esc(R.EVENT_LABELS[e.type] || e.type) + '</span>';
    var extra = '';
    if (e.type === 'config') extra = d.measurementId;
    else if (e.type === 'network_hit') extra = (d.host || '') + (d.en ? ' · ' + d.en : '');
    else if (e.type === 'datalayer_event') extra = d.event;
    else if (e.type === 'consent_default' && d.wait_for_update !== undefined) extra = 'wait_for_update ' + d.wait_for_update + ' ms';
    return label + (extra ? '<span class="t-sub mono">' + esc(extra) + '</span>' : '');
  }

  function changeCell(e, changes) {
    if (!changes) return '';
    if (!changes.length) return '<p class="changes muted">No consent change</p>';
    return '<ul class="changes">' + changes.map(function (c) {
      return '<li><span class="mono key">' + esc(c.key) + '</span> '
        + (c.from && e.type === 'consent_update'
          ? R.consentValue(c.from) + ' <span aria-hidden="true">→</span><span class="visually-hidden"> to </span> '
          : '')
        + R.consentValue(c.to) + '</li>';
    }).join('') + '</ul>';
  }

  // ─── Requests ───────────────────────────────────────────────
  function requestsHtml(hits) {
    if (!hits.length) {
      return emptyHtml('No vendor requests yet.', 'Interact with the page or answer the banner.');
    }
    var showRaw = !!ui.open['req-raw'];
    var html = '<dl class="terms">'
      + '<div><dt>Carried</dt><dd>The consent the request itself sent. For Google requests that is '
      + '<code>gcs</code>, the Google consent state, and <code>gcd</code>, the Google consent detail.</dd></div>'
      + '<div><dt>On page</dt><dd>The consent on the page when the request was sent.</dd></div>'
      + '<div><dt>Sent by</dt><dd>The tag the request is judged against, from the tag ID or endpoint it carries.</dd></div>'
      + '</dl>'
      + R.disclosureButton('req-raw', 'view-requests', showRaw, showRaw ? 'Hide raw gcs and gcd values' : 'Show raw gcs and gcd values')
      + '<ol class="request-list">';
    hits.forEach(function (h) {
      var rows = R.requestConsentRows(h);
      var mismatch = rows.some(function (r) { return r.mismatch; });
      html += '<li class="req">'
        + '<p class="req-head"><span class="t-time">' + esc(R.msLabel(h.ms)) + '</span>'
        + '<span class="t-label">' + esc(h.host || '') + (h.en ? ' · ' + esc(h.en) : '') + '</span>'
        + (mismatch ? '<span class="flag"><span aria-hidden="true">×</span> mismatch</span>' : '')
        + '</p>'
        + attributionHtml(h);
      if (rows.length) {
        html += '<table class="req-table"><caption class="visually-hidden">Consent for this request</caption>'
          + '<thead><tr><th scope="col">Type</th><th scope="col">Carried</th><th scope="col">On page</th></tr></thead><tbody>';
        rows.forEach(function (r) {
          html += '<tr' + (r.mismatch ? ' class="mismatch"' : '') + '><th scope="row" class="mono">' + esc(r.key) + '</th>'
            + '<td>' + (r.carried ? R.consentValue(r.carried) : '<span class="muted">not sent</span>') + '</td>'
            + '<td>' + (r.onPage ? R.consentValue(r.onPage) : '<span class="muted">not set</span>') + '</td></tr>';
        });
        html += '</tbody></table>';
      } else {
        html += '<p class="trace-empty">No consent set on the page when sent.</p>';
      }
      if (showRaw && (h.gcs || h.gcd)) {
        html += '<p class="raw">' + (h.gcs ? 'gcs=' + esc(h.gcs) : '') + (h.gcs && h.gcd ? ' · ' : '')
          + (h.gcd ? 'gcd=' + esc(h.gcd) : '') + '</p>';
      }
      html += '</li>';
    });
    return html + '</ol>';
  }

  // Which tag the request was attributed to (#28). Loader and unattributed requests are listed
  // but change no verdict.
  function attributionHtml(h) {
    var id = h.tagId ? ' <span class="mono">' + esc(h.tagId) + '</span>' : '';
    if (h.tag && h.loader) {
      return '<p class="req-tag">Loads ' + esc(h.tag) + id + '. Not judged: loading a tag collects nothing.</p>';
    }
    if (h.tag) return '<p class="req-tag">Sent by ' + esc(h.tag) + id + '</p>';
    return '<p class="req-tag"><span class="req-none">– Not tied to a tag</span> Not judged. '
      + esc(h.unattributedReason || '') + '</p>';
  }

  // ─── Consent state ──────────────────────────────────────────
  function consentHtml(state) {
    var consent = state.currentConsent || {};
    var keys = Object.keys(consent).filter(function (k) { return k !== 'wait_for_update' && k !== 'region'; });
    keys.sort(function (a, b) { return (consent[a] === 'denied' ? 0 : 1) - (consent[b] === 'denied' ? 0 : 1); });
    var html = '';
    if (keys.length) {
      html += '<table class="trace-table consent-table"><caption class="visually-hidden">Consent on the page now</caption>'
        + '<thead><tr><th scope="col">Consent type</th><th scope="col">Now</th></tr></thead><tbody>'
        + keys.map(function (k) {
          return '<tr><th scope="row" class="mono">' + esc(k) + '</th><td>' + R.consentValue(consent[k]) + '</td></tr>';
        }).join('')
        + (consent.wait_for_update !== undefined
          ? '<tr><th scope="row" class="mono">wait_for_update</th><td class="mono">' + esc(consent.wait_for_update) + ' ms</td></tr>'
          : '')
        + '</tbody></table>';
    } else {
      html += emptyHtml('No consent state on this page.', 'The page sent no consent default or update.');
    }
    var cmp = state.cmp && state.cmp.detected ? state.cmp.name : null;
    var openList = !!ui.open['cmp-list'];
    html += '<h2 class="trace-heading">Consent banner (CMP)</h2>'
      + '<p class="trace-line-plain">' + (cmp ? esc(cmp) + ' recognized.' : 'No supported CMP recognized.') + '</p>'
      + R.disclosureButton('cmp-list', 'cmp-list', openList, openList ? 'Hide supported CMPs' : 'Show supported CMPs')
      + '<p id="cmp-list" class="trace-line-plain"' + (openList ? '' : ' hidden') + '>' + esc(SUPPORTED_CMPS.join(', ')) + '.</p>';
    return html;
  }

  function emptyHtml(title, detail) {
    return '<div class="empty"><p class="empty-title">' + esc(title) + '</p><p class="empty-detail">' + esc(detail) + '</p></div>';
  }

  // ─── Init ───────────────────────────────────────────────────
  fetchState();
  setInterval(fetchState, REFRESH_MS);
})();
