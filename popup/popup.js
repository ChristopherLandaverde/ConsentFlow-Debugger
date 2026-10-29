// ConsentFlow Debugger — Popup UI
// A glance: the verdict sentence, the findings with their fixes, then passes and the
// captured data behind labelled disclosures. Everything is rendered from
// CFFindings.computeVerdict() / buildFindings() (popup/findings.js).
(function () {
  'use strict';

  var F = globalThis.CFFindings;
  var REFRESH_MS = 4000;
  var RETRY_MS = 2500;
  var RELOAD_GRACE_MS = 1500;
  var REVIEW_URL = 'https://focosys.io/review';

  var ui = {
    open: {},          // disclosure key → true when expanded; survives every refresh
    lastKey: null,     // last rendered content; unchanged content is not re-rendered
    lastVerdict: null, // last verdict text, so the live region only speaks on change
    tabId: null,
    reloadUntil: 0     // ignore replies from the old page right after a reload
  };

  var STATUS_TAGS = {
    broken: { cls: 'broken', symbol: '×', word: 'BROKEN' },
    review: { cls: 'review', symbol: '!', word: 'REVIEW' },
    not_checked: { cls: 'not-checked', symbol: '–', word: 'NOT CHECKED' },
    verified: { cls: 'verified', symbol: '✓', word: 'VERIFIED' }
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
  el('recheckBtn').addEventListener('click', reloadAndRecheck);
  el('errorAction').addEventListener('click', reloadAndRecheck);
  el('reviewCtaButton').addEventListener('click', function () {
    chrome.tabs.create({ url: REVIEW_URL });
  });
  el('findings').addEventListener('click', onDisclosure);
  el('trace').addEventListener('click', onDisclosure);

  function onDisclosure(event) {
    var target = event && event.target;
    var button = target && target.closest ? target.closest('[data-toggle]') : null;
    if (!button) return;
    var key = button.getAttribute('data-toggle');
    ui.open[key] = !ui.open[key];
    ui.lastKey = null;
    if (ui.state) renderContent(ui.state, key);
  }

  // ─── Data fetching ──────────────────────────────────────────
  function fetchState() {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      var tab = tabs && tabs[0];
      if (!tab) { showError('noTab'); return; }
      ui.tabId = tab.id;
      setHost(tab.url);

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
    el('trace').hidden = true;
    el('reviewCta').hidden = true;
  }

  function renderContent(state, focusKey) {
    var findings = F.buildFindings(state);
    var verdict = F.computeVerdict(state, findings);
    ui.view = 'content';

    setVerdict(verdict.status, verdict.label, verdict.title, verdict.detail);
    el('progress').hidden = true;
    el('errorAction').hidden = true;
    setText(el('checkedAt'), 'Checked ' + clock(new Date()) + ' · this page load');
    el('actions').hidden = false;
    el('reviewCta').hidden = !verdict.showReviewCta;

    var key = JSON.stringify([findings, traceSummary(state), ui.open]);
    if (key === ui.lastKey) return; // nothing changed: keep scroll, focus and DOM as they are
    ui.lastKey = key;

    var active = document.activeElement;
    var activeKey = focusKey || (active && active.getAttribute ? active.getAttribute('data-toggle') : null);
    var scroller = document.scrollingElement;
    var scrollTop = scroller ? scroller.scrollTop : 0;

    el('findings').innerHTML = findingsHtml(findings);
    el('findings').hidden = false;
    el('trace').innerHTML = traceHtml(state);
    el('trace').hidden = false;

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
    el('verdictLabel').className = 'status-tag ' + (STATUS_TAGS[state] ? STATUS_TAGS[state].cls : state);
    setText(el('verdictLabel'), label);
    setText(el('verdictTitle'), title);
    setText(el('verdictDetail'), detail);
  }

  // ─── Findings ───────────────────────────────────────────────
  function findingsHtml(findings) {
    var problems = findings.filter(function (f) { return f.status === 'broken' || f.status === 'review'; });
    var notChecked = findings.filter(function (f) { return f.status === 'not_checked'; });
    var passed = findings.filter(function (f) { return f.status === 'verified'; });
    var html = '';

    if (problems.length) {
      html += '<ol class="problems">';
      problems.forEach(function (f) { html += problemHtml(f); });
      html += '</ol>';
    }

    if (notChecked.length) {
      html += '<div class="group">'
        + '<h2 class="group-title">' + tagHtml('not_checked') + ' '
        + esc(notChecked.length + (notChecked.length === 1 ? ' check needs' : ' checks need') + ' more data') + '</h2>'
        + '<ul class="nc-list">';
      notChecked.forEach(function (f) { html += notCheckedHtml(f); });
      html += '</ul></div>';
    }

    if (passed.length) {
      var open = !!ui.open.passed;
      html += '<div class="group">'
        + disclosureButton('passed', 'passed-list', open,
          (open ? 'Hide ' : 'Show ') + passed.length + (passed.length === 1 ? ' passed check' : ' passed checks'))
        + '<ul id="passed-list" class="passed-list"' + (open ? '' : ' hidden') + '>';
      passed.forEach(function (f) {
        html += '<li><p class="passed-title"><span class="sym verified" aria-hidden="true">✓</span>'
          + '<span class="visually-hidden">Verified: </span>' + fmt(f.title) + '</p>'
          + '<p class="passed-observed">' + fmt(f.observed) + '</p></li>';
      });
      html += '</ul></div>';
    }
    return html;
  }

  function problemHtml(f) {
    var k = keyOf(f.id);
    var evKey = 'ev-' + k;
    var open = !!ui.open[evKey];
    return '<li class="finding ' + f.status + '">'
      + '<article aria-labelledby="t-' + k + '">'
      + tagHtml(f.status)
      + '<h2 id="t-' + k + '" class="finding-title">' + fmt(f.title) + '</h2>'
      + '<dl class="steps">'
      + '<dt>Observed</dt><dd>' + fmt(f.observed) + '</dd>'
      + '<dt>Why</dt><dd>' + fmt(f.consequence) + '</dd>'
      + '<dt>Fix</dt><dd>' + fixHtml(f.fix) + '</dd>'
      + '<dt>Verify</dt><dd>' + fmt(f.verify) + '</dd>'
      + '</dl>'
      + disclosureButton(evKey, 'p-' + evKey, open, open ? 'Hide evidence' : 'Show evidence')
      + evidenceHtml('p-' + evKey, f.evidence, open)
      + '</article></li>';
  }

  function notCheckedHtml(f) {
    var k = keyOf(f.id);
    var dKey = 'nc-' + k;
    var open = !!ui.open[dKey];
    return '<li class="nc-item">'
      + '<p class="nc-title">' + fmt(f.title) + '</p>'
      + '<p class="nc-line"><span class="nc-label">Needs</span><span>' + fmt(f.observed) + '</span></p>'
      + '<p class="nc-line"><span class="nc-label">Next</span><span>' + fmt(f.fix[0]) + '</span></p>'
      + disclosureButton(dKey, 'p-' + dKey, open, open ? 'Hide details' : 'Show details')
      + '<div id="p-' + dKey + '" class="nc-details"' + (open ? '' : ' hidden') + '>'
      + '<dl class="steps">'
      + '<dt>Why</dt><dd>' + fmt(f.consequence) + '</dd>'
      + '<dt>Then</dt><dd>' + fmt(f.verify) + '</dd>'
      + '</dl>'
      + evidenceHtml(null, f.evidence, true)
      + '</div></li>';
  }

  function fixHtml(steps) {
    if (steps.length === 1) return fmt(steps[0]);
    return '<ol class="fix-steps">' + steps.map(function (s) { return '<li>' + fmt(s) + '</li>'; }).join('') + '</ol>';
  }

  function evidenceHtml(id, rows, open) {
    return '<dl' + (id ? ' id="' + id + '"' : '') + ' class="evidence"' + (open ? '' : ' hidden') + '>'
      + rows.map(function (r) {
        return '<div class="ev-row"><dt>' + esc(r.label) + '</dt><dd>' + esc(r.value) + '</dd></div>';
      }).join('')
      + '</dl>';
  }

  function tagHtml(status) {
    var t = STATUS_TAGS[status];
    return '<p class="status-tag ' + t.cls + '"><span aria-hidden="true">' + t.symbol + '</span> ' + t.word + '</p>';
  }

  function disclosureButton(key, controls, open, label) {
    return '<button type="button" class="disclosure" data-toggle="' + key + '" aria-controls="' + controls + '"'
      + ' aria-expanded="' + (open ? 'true' : 'false') + '">' + esc(label) + '</button>';
  }

  // ─── Captured data (until the side panel ships) ─────────────
  var RELEVANT = ['consent_default', 'consent_update', 'config', 'gtm_load', 'network_hit'];
  var EVENT_LABELS = {
    consent_default: 'Consent default',
    consent_update: 'Consent update',
    config: 'Google tag config',
    gtm_load: 'GTM loaded',
    network_hit: 'Request'
  };

  function traceSummary(state) {
    return [
      (state.timeline || []).length,
      (state.networkHits || []).length,
      state.currentConsent || {},
      state.cmp ? state.cmp.name : null
    ];
  }

  function traceHtml(state) {
    var events = (state.timeline || []).filter(function (e) { return RELEVANT.indexOf(e.type) !== -1; });
    var hits = state.networkHits || [];
    var open = !!ui.open.trace;
    var label = (open ? 'Hide' : 'Show') + ' captured data: ' + events.length + ' events, ' + hits.length
      + (hits.length === 1 ? ' request' : ' requests');
    var html = disclosureButton('trace', 'trace-body', open, label)
      + '<div id="trace-body" class="trace-body"' + (open ? '' : ' hidden') + '>';
    if (!open) return html + '</div>';

    // Consent state now, denied first
    var consent = state.currentConsent || {};
    var keys = Object.keys(consent).filter(function (k) { return k !== 'wait_for_update' && k !== 'region'; });
    keys.sort(function (a, b) { return (consent[a] === 'denied' ? 0 : 1) - (consent[b] === 'denied' ? 0 : 1); });
    html += '<h2 class="trace-heading">Consent now</h2>';
    html += keys.length
      ? '<dl class="kv">' + keys.map(function (k) {
        return '<div class="ev-row"><dt>' + esc(k) + '</dt><dd>' + consentValue(consent[k]) + '</dd></div>';
      }).join('') + '</dl>'
      : '<p class="trace-empty">No consent state set on this page.</p>';
    html += '<p class="trace-line"><span class="nc-label">CMP</span>'
      + '<span>' + esc(state.cmp && state.cmp.detected ? state.cmp.name : 'No supported CMP recognized') + '</span></p>';

    // Timeline
    html += '<h2 class="trace-heading">Timeline</h2>';
    if (!events.length) {
      html += '<p class="trace-empty">No consent or tag events captured yet.</p>';
    } else {
      html += '<ol class="timeline">';
      events.slice(-40).forEach(function (e) {
        html += '<li><span class="t-time">+' + esc(Math.round(Number(e.ms) || 0)) + ' ms</span>'
          + '<span class="t-label">' + esc(EVENT_LABELS[e.type] || e.type) + '</span>'
          + eventDetail(e) + '</li>';
      });
      html += '</ol>';
      var others = (state.timeline || []).length - events.length;
      if (others > 0) html += '<p class="trace-empty">Plus ' + esc(others) + ' other dataLayer events.</p>';
    }

    // Requests
    html += '<h2 class="trace-heading">Requests</h2>';
    if (!hits.length) {
      html += '<p class="trace-empty">No vendor requests yet. Browse the page, then reopen ConsentFlow.</p>';
    } else {
      html += '<ol class="requests">';
      hits.slice(-30).forEach(function (h) {
        html += '<li><span class="t-time">+' + esc(Math.round(Number(h.ms) || 0)) + ' ms</span>'
          + '<span class="t-label">' + esc(h.host || '') + (h.en ? ' · ' + esc(h.en) : '') + '</span>'
          + requestConsent(h) + '</li>';
      });
      html += '</ol>';
    }
    return html + '</div>';
  }

  function eventDetail(e) {
    var d = e.detail || {};
    if (e.type === 'consent_default' || e.type === 'consent_update') {
      var keys = Object.keys(d).filter(function (k) { return k !== 'region'; });
      return '<dl class="kv t-detail">' + keys.map(function (k) {
        return '<div class="ev-row"><dt>' + esc(k) + '</dt><dd>'
          + (k === 'wait_for_update' ? esc(d[k] + ' ms') : consentValue(d[k])) + '</dd></div>';
      }).join('') + '</dl>';
    }
    if (e.type === 'config') return '<span class="t-detail mono">' + esc(d.measurementId || '') + '</span>';
    if (e.type === 'network_hit') return '<span class="t-detail mono">' + esc(d.host || '') + '</span>';
    return '';
  }

  // What consent the request carried (its own gcs) next to what the page had when it was sent.
  function requestConsent(h) {
    var gcs = h.decoded && h.decoded.gcs && !h.decoded.gcs.error ? h.decoded.gcs : null;
    var at = h.consentAtRequest || {};
    var types = ['analytics_storage', 'ad_storage'].filter(function (k) { return (gcs && gcs[k]) || k in at; });
    if (!types.length) return '<p class="t-detail trace-empty">No consent set when sent.</p>';
    var html = '<div class="t-detail req-grid" role="table" aria-label="Consent for this request">'
      + '<div class="req-row" role="row"><span role="columnheader">Type</span><span role="columnheader">Carried</span><span role="columnheader">On page</span></div>';
    types.forEach(function (k) {
      html += '<div class="req-row" role="row"><span role="cell" class="mono">' + esc(k) + '</span>'
        + '<span role="cell">' + (gcs && gcs[k] ? consentValue(gcs[k]) : '–') + '</span>'
        + '<span role="cell">' + (k in at ? consentValue(at[k]) : 'not set') + '</span></div>';
    });
    if (gcs) html += '<p class="raw">gcs ' + esc(gcs.raw) + '</p>';
    return html + '</div>';
  }

  function consentValue(v) {
    if (v === 'denied') return '<span class="cv denied"><span aria-hidden="true">×</span> denied</span>';
    if (v === 'granted') return '<span class="cv granted"><span aria-hidden="true">✓</span> granted</span>';
    return esc(v);
  }

  // ─── Helpers ────────────────────────────────────────────────
  function esc(value) {
    return String(value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // Escape, then render `code` spans as <code>.
  function fmt(text) {
    return esc(text).replace(/`([^`]+)`/g, '<code>$1</code>');
  }

  function keyOf(id) { return String(id).replace(/[^A-Za-z0-9_-]/g, '_'); }

  function setText(node, text) {
    if (node.textContent !== text) node.textContent = text;
  }

  function clock(d) {
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }

  // ─── Init ───────────────────────────────────────────────────
  fetchState();
  setInterval(fetchState, REFRESH_MS);
})();
