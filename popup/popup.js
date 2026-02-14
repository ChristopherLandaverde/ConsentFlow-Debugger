// ConsentFlow Debugger — Popup UI
(function () {
  'use strict';

  let currentState = null;
  let refreshTimer = null;

  // ─── Tab Switching ──────────────────────────────────────────
  document.querySelectorAll('.tab').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.tab').forEach(function (b) { b.classList.remove('active'); });
      document.querySelectorAll('.panel').forEach(function (p) { p.classList.remove('active'); });
      btn.classList.add('active');
      var panel = document.getElementById(btn.dataset.tab + '-tab');
      if (panel) panel.classList.add('active');
    });
  });

  document.getElementById('refreshBtn').addEventListener('click', fetchState);

  // ─── Data Fetching ──────────────────────────────────────────
  function fetchState() {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (!tabs[0]) {
        showError('No active tab');
        return;
      }
      var tabId = tabs[0].id;

      // Try sending to content script directly
      chrome.tabs.sendMessage(tabId, { action: 'getState' }, function (response) {
        if (chrome.runtime.lastError || !response) {
          // Content script not ready — try injecting via background
          chrome.runtime.sendMessage({ action: 'ensureContentScript', tabId: tabId }, function () {
            setTimeout(function () {
              chrome.tabs.sendMessage(tabId, { action: 'getState' }, function (r) {
                if (r) { render(r); }
                else { showError('Content script not responding. Try refreshing the page.'); }
              });
            }, 2500);
          });
          return;
        }
        render(response);
      });
    });
  }

  function showError(msg) {
    document.getElementById('headerStatus').textContent = msg;
    document.getElementById('headerStatus').className = 'header-status error';
  }

  // ─── Render Everything ──────────────────────────────────────
  function render(state) {
    if (!state) { showError('No data received'); return; }
    currentState = state;

    if (!state.ready) {
      document.getElementById('headerStatus').textContent = 'Analyzing page...';
      document.getElementById('headerStatus').className = 'header-status loading';
      return;
    }

    renderHeader(state);
    renderScorecard(state);
    renderTimeline(state);
    renderRules(state);
    renderNetwork(state);
    renderState(state);
  }

  // ─── Header ─────────────────────────────────────────────────
  function renderHeader(state) {
    var el = document.getElementById('headerStatus');
    var fails = (state.validation || []).filter(function (r) { return r.status === 'fail'; }).length;
    var warns = (state.validation || []).filter(function (r) { return r.status === 'warn'; }).length;

    if (fails > 0) {
      el.textContent = fails + ' issue' + (fails > 1 ? 's' : '') + ' found';
      el.className = 'header-status error';
    } else if (warns > 0) {
      el.textContent = warns + ' warning' + (warns > 1 ? 's' : '');
      el.className = 'header-status warn';
    } else {
      el.textContent = 'No issues detected';
      el.className = 'header-status ok';
    }
  }

  // ─── Scorecard ──────────────────────────────────────────────
  function renderScorecard(state) {
    var rules = state.validation || [];
    var fails = rules.filter(function (r) { return r.status === 'fail'; }).length;
    var passes = rules.filter(function (r) { return r.status === 'pass'; }).length;

    setScore('scoreRules', passes + '/' + rules.length, fails > 0 ? 'bad' : 'good');
    setScore('scoreTags', String((state.tags || []).length), '');
    setScore('scoreHits', String((state.networkHits || []).length), '');
    setScore('scoreCMP', state.cmp && state.cmp.detected ? state.cmp.name : 'None',
      state.cmp && state.cmp.detected ? 'good' : '');
  }

  function setScore(id, value, cls) {
    var el = document.getElementById(id);
    el.querySelector('.score-num').textContent = value;
    el.className = 'score-item' + (cls ? ' ' + cls : '');
  }

  // ─── Timeline ───────────────────────────────────────────────
  function renderTimeline(state) {
    var container = document.getElementById('timeline');
    var events = state.timeline || [];

    if (events.length === 0) {
      container.innerHTML = '<div class="empty">No consent flow events captured yet.</div>';
      return;
    }

    // Show only the most relevant events (consent, config, gtm_load, network_hit)
    var relevant = events.filter(function (e) {
      return ['consent_default', 'consent_update', 'config', 'gtm_load', 'network_hit'].indexOf(e.type) !== -1;
    });

    // If no relevant events, show all
    if (relevant.length === 0) relevant = events.slice(0, 50);

    var html = '';
    relevant.forEach(function (evt) {
      var cls = typeClass(evt.type);
      var label = typeLabel(evt.type);
      var detail = formatDetail(evt);
      html += '<div class="tl-event ' + cls + '">'
        + '<div class="tl-dot"></div>'
        + '<div class="tl-body">'
        + '<div class="tl-head">'
        + '<span class="tl-label">' + esc(label) + '</span>'
        + '<span class="tl-time">' + evt.ms + 'ms</span>'
        + '</div>'
        + '<div class="tl-detail">' + esc(detail) + '</div>'
        + '</div>'
        + '</div>';
    });

    // Show datalayer_event count at the bottom
    var otherCount = events.length - relevant.length;
    if (otherCount > 0) {
      html += '<div class="tl-summary">' + otherCount + ' other dataLayer events (expand in DevTools)</div>';
    }

    container.innerHTML = html;
  }

  function typeClass(type) {
    var map = {
      consent_default: 'consent', consent_update: 'consent',
      config: 'config', gtm_load: 'gtm',
      network_hit: 'network', datalayer_event: 'event'
    };
    return map[type] || 'event';
  }

  function typeLabel(type) {
    var map = {
      consent_default: 'CONSENT DEFAULT',
      consent_update: 'CONSENT UPDATE',
      config: 'CONFIG',
      gtm_load: 'GTM LOADED',
      network_hit: 'NETWORK HIT',
      datalayer_event: 'EVENT'
    };
    return map[type] || type;
  }

  function formatDetail(evt) {
    if (!evt.detail) return '';
    if (evt.type === 'consent_default' || evt.type === 'consent_update') {
      return Object.keys(evt.detail).map(function (k) {
        return k + ': ' + evt.detail[k];
      }).join(', ');
    }
    if (evt.type === 'config') {
      return evt.detail.measurementId || '';
    }
    if (evt.type === 'network_hit') {
      var d = evt.detail;
      var parts = [d.host];
      if (d.gcs) parts.push('GCS=' + d.gcs);
      if (d.en) parts.push('event=' + d.en);
      return parts.join(' | ');
    }
    if (evt.type === 'datalayer_event') {
      return evt.detail.event || '';
    }
    return JSON.stringify(evt.detail).substring(0, 120);
  }

  // ─── Rules ──────────────────────────────────────────────────
  function renderRules(state) {
    var container = document.getElementById('rulesList');
    var rules = state.validation || [];

    if (rules.length === 0) {
      container.innerHTML = '<div class="empty">No validation data yet.</div>';
      return;
    }

    // Sort: fails first, then warns, then info, then pass
    var order = { fail: 0, warn: 1, info: 2, pass: 3 };
    rules.sort(function (a, b) { return (order[a.status] || 4) - (order[b.status] || 4); });

    var html = '';
    rules.forEach(function (rule) {
      var icon = statusIcon(rule.status);
      html += '<div class="rule-card ' + rule.status + '">'
        + '<div class="rule-header">'
        + '<span class="rule-icon">' + icon + '</span>'
        + '<span class="rule-name">' + esc(rule.name) + '</span>'
        + '<span class="rule-badge ' + rule.status + '">' + rule.status.toUpperCase() + '</span>'
        + '</div>'
        + '<div class="rule-desc">' + esc(rule.description) + '</div>'
        + '<div class="rule-detail">' + esc(rule.detail) + '</div>'
        + '</div>';
    });

    container.innerHTML = html;
  }

  function statusIcon(status) {
    var map = { pass: 'PASS', fail: 'FAIL', warn: 'WARN', info: 'INFO' };
    return map[status] || '?';
  }

  // ─── Network ────────────────────────────────────────────────
  function renderNetwork(state) {
    var container = document.getElementById('networkList');
    var hits = state.networkHits || [];

    if (hits.length === 0) {
      container.innerHTML = '<div class="empty">No Google analytics requests captured yet. Interact with the page or wait for tags to fire.</div>';
      return;
    }

    var html = '';
    hits.forEach(function (hit) {
      html += '<div class="net-card">'
        + '<div class="net-header">'
        + '<span class="net-method">' + esc(hit.method) + '</span>'
        + '<span class="net-host">' + esc(hit.host) + '</span>'
        + '<span class="net-time">' + Math.round(hit.ms) + 'ms</span>'
        + '</div>';

      if (hit.en) {
        html += '<div class="net-row"><span class="net-key">Event</span><span class="net-val">' + esc(hit.en) + '</span></div>';
      }
      if (hit.tid) {
        html += '<div class="net-row"><span class="net-key">Tracking ID</span><span class="net-val">' + esc(hit.tid) + '</span></div>';
      }

      // Decoded GCS
      if (hit.decoded && hit.decoded.gcs && !hit.decoded.gcs.error) {
        var gcs = hit.decoded.gcs;
        html += '<div class="net-section">GCS (Consent State in Request)</div>';
        html += '<div class="net-row"><span class="net-key">analytics_storage</span><span class="net-val ' + gcs.analytics_storage + '">' + gcs.analytics_storage + '</span></div>';
        html += '<div class="net-row"><span class="net-key">ad_storage</span><span class="net-val ' + gcs.ad_storage + '">' + gcs.ad_storage + '</span></div>';
        html += '<div class="net-row gcs-raw"><span class="net-key">raw</span><span class="net-val mono">' + esc(gcs.raw) + '</span></div>';
      }

      // Decoded GCD
      if (hit.decoded && hit.decoded.gcd && !hit.decoded.gcd.error) {
        var gcd = hit.decoded.gcd;
        html += '<div class="net-section">GCD (Consent Detail)</div>';
        var gcdKeys = Object.keys(gcd).filter(function (k) { return k !== 'raw'; });
        gcdKeys.forEach(function (k) {
          html += '<div class="net-row"><span class="net-key">' + esc(k) + '</span><span class="net-val">' + esc(gcd[k]) + '</span></div>';
        });
        html += '<div class="net-row gcs-raw"><span class="net-key">raw</span><span class="net-val mono">' + esc(gcd.raw) + '</span></div>';
      }

      // NPA
      if (hit.decoded && hit.decoded.npa) {
        html += '<div class="net-row"><span class="net-key">NPA</span><span class="net-val">' + esc(hit.decoded.npa) + '</span></div>';
      }

      html += '</div>';
    });

    container.innerHTML = html;
  }

  // ─── State ──────────────────────────────────────────────────
  function renderState(state) {
    // Current consent
    var grid = document.getElementById('consentGrid');
    var consent = state.currentConsent || {};
    var keys = Object.keys(consent).filter(function (k) { return k !== 'wait_for_update' && k !== 'region'; });

    if (keys.length === 0) {
      grid.innerHTML = '<div class="empty">No consent state detected. Consent Mode may not be implemented on this page.</div>';
    } else {
      var html = '';
      keys.forEach(function (k) {
        var val = consent[k];
        html += '<div class="cs-row ' + val + '">'
          + '<span class="cs-key">' + esc(k) + '</span>'
          + '<span class="cs-val">' + esc(val) + '</span>'
          + '</div>';
      });
      grid.innerHTML = html;
    }

    // CMP
    var cmpEl = document.getElementById('cmpInfo');
    if (state.cmp && state.cmp.detected) {
      cmpEl.textContent = state.cmp.name;
      cmpEl.className = 'cmp-info detected';
    } else {
      cmpEl.textContent = 'No CMP detected on this page.';
      cmpEl.className = 'cmp-info';
    }

    // Tags
    var tagsList = document.getElementById('tagsList');
    var tags = state.tags || [];
    if (tags.length === 0) {
      tagsList.innerHTML = '<div class="empty">No tracking tags detected.</div>';
    } else {
      var thtml = '';
      tags.forEach(function (tag) {
        var consentNeeded = (tag.consentTypes || []).join(', ');
        var allGranted = (tag.consentTypes || []).every(function (ct) {
          return consent[ct] === 'granted';
        });
        thtml += '<div class="tag-card ' + (allGranted ? 'allowed' : 'blocked') + '">'
          + '<div class="tag-name">' + esc(tag.name) + '</div>'
          + '<div class="tag-meta">'
          + '<span class="tag-type">' + esc(tag.type) + '</span>'
          + '<span class="tag-consent">Needs: ' + esc(consentNeeded || 'none') + '</span>'
          + '<span class="tag-status">' + (allGranted ? 'ALLOWED' : 'BLOCKED') + '</span>'
          + '</div>'
          + '</div>';
      });
      tagsList.innerHTML = thtml;
    }
  }

  // ─── Helpers ────────────────────────────────────────────────
  function esc(str) {
    if (typeof str !== 'string') str = String(str);
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ─── Init ───────────────────────────────────────────────────
  fetchState();
  refreshTimer = setInterval(fetchState, 4000);
})();
