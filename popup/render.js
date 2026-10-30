// ConsentFlow Debugger — shared rendering for the popup and the side panel
// Escaping, status tags, disclosures, the findings list, and the pure helpers the side
// panel's timeline and requests tables are built from. Every page-derived string goes
// through esc() before it reaches innerHTML, including inside attributes.
//
// Plain script, no modules: defines globalThis.CFRender.
(function (root) {
  'use strict';

  var STATUS_TAGS = {
    broken: { cls: 'broken', symbol: '×', word: 'BROKEN' },
    review: { cls: 'review', symbol: '!', word: 'REVIEW' },
    not_checked: { cls: 'not-checked', symbol: '–', word: 'NOT CHECKED' },
    verified: { cls: 'verified', symbol: '✓', word: 'VERIFIED' }
  };

  // ─── Text helpers ───────────────────────────────────────────
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

  function clock(d) {
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }

  function msLabel(n) { return '+' + Math.round(Number(n) || 0) + ' ms'; }

  // ─── Small components ───────────────────────────────────────
  function tagHtml(status) {
    var t = STATUS_TAGS[status];
    return '<p class="status-tag ' + t.cls + '"><span aria-hidden="true">' + t.symbol + '</span> ' + t.word + '</p>';
  }

  function disclosureButton(key, controls, open, label) {
    return '<button type="button" class="disclosure" data-toggle="' + esc(key) + '" aria-controls="' + esc(controls) + '"'
      + ' aria-expanded="' + (open ? 'true' : 'false') + '">' + esc(label) + '</button>';
  }

  function consentValue(v) {
    if (v === 'denied') return '<span class="cv denied"><span aria-hidden="true">×</span> denied</span>';
    if (v === 'granted') return '<span class="cv granted"><span aria-hidden="true">✓</span> granted</span>';
    return '<span class="cv">' + esc(v) + '</span>';
  }

  // ─── Findings list (popup and side panel) ───────────────────
  // open: disclosure key → true when expanded. idPrefix keeps ids unique per surface.
  function findingsHtml(findings, open, idPrefix) {
    open = open || {};
    idPrefix = idPrefix || '';
    var problems = findings.filter(function (f) { return f.status === 'broken' || f.status === 'review'; });
    var notChecked = findings.filter(function (f) { return f.status === 'not_checked'; });
    var passed = findings.filter(function (f) { return f.status === 'verified'; });
    var html = '';

    if (problems.length) {
      html += '<ol class="problems">';
      problems.forEach(function (f) { html += problemHtml(f, open, idPrefix); });
      html += '</ol>';
    }

    if (notChecked.length) {
      html += '<div class="group">'
        + '<h2 class="group-title">' + tagHtml('not_checked') + ' '
        + esc(notChecked.length + (notChecked.length === 1 ? ' check needs' : ' checks need') + ' more data') + '</h2>'
        + '<ul class="nc-list">';
      notChecked.forEach(function (f) { html += notCheckedHtml(f, open, idPrefix); });
      html += '</ul></div>';
    }

    if (passed.length) {
      var isOpen = !!open.passed;
      html += '<div class="group">'
        + disclosureButton('passed', idPrefix + 'passed-list', isOpen,
          (isOpen ? 'Hide ' : 'Show ') + passed.length + (passed.length === 1 ? ' passed check' : ' passed checks'))
        + '<ul id="' + idPrefix + 'passed-list" class="passed-list"' + (isOpen ? '' : ' hidden') + '>';
      passed.forEach(function (f) {
        html += '<li><p class="passed-title"><span class="sym verified" aria-hidden="true">✓</span>'
          + '<span class="visually-hidden">Verified: </span>' + fmt(f.title) + '</p>'
          + '<p class="passed-observed">' + fmt(f.observed) + '</p></li>';
      });
      html += '</ul></div>';
    }
    return html;
  }

  function problemHtml(f, open, idPrefix) {
    var k = keyOf(f.id);
    var evKey = 'ev-' + k;
    var isOpen = !!open[evKey];
    return '<li class="finding ' + f.status + '">'
      + '<article aria-labelledby="' + idPrefix + 't-' + k + '">'
      + tagHtml(f.status)
      + '<h2 id="' + idPrefix + 't-' + k + '" class="finding-title">' + fmt(f.title) + '</h2>'
      + '<dl class="steps">'
      + '<dt>Observed</dt><dd>' + fmt(f.observed) + '</dd>'
      + '<dt>Why</dt><dd>' + fmt(f.consequence) + '</dd>'
      + '<dt>Fix</dt><dd>' + fixHtml(f.fix) + '</dd>'
      + '<dt>Verify</dt><dd>' + fmt(f.verify) + '</dd>'
      + '</dl>'
      + disclosureButton(evKey, idPrefix + 'p-' + evKey, isOpen, isOpen ? 'Hide evidence' : 'Show evidence')
      + evidenceHtml(idPrefix + 'p-' + evKey, f.evidence, isOpen)
      + '</article></li>';
  }

  function notCheckedHtml(f, open, idPrefix) {
    var k = keyOf(f.id);
    var dKey = 'nc-' + k;
    var isOpen = !!open[dKey];
    return '<li class="nc-item">'
      + '<p class="nc-title">' + fmt(f.title) + '</p>'
      + '<p class="nc-line"><span class="nc-label">Needs</span><span>' + fmt(f.observed) + '</span></p>'
      + '<p class="nc-line"><span class="nc-label">Next</span><span>' + fmt(f.fix[0]) + '</span></p>'
      + disclosureButton(dKey, idPrefix + 'p-' + dKey, isOpen, isOpen ? 'Hide details' : 'Show details')
      + '<div id="' + idPrefix + 'p-' + dKey + '" class="nc-details"' + (isOpen ? '' : ' hidden') + '>'
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

  // ─── Trace helpers (side panel) ─────────────────────────────
  // Events that explain consent; everything else is "other dataLayer events".
  var RELEVANT = ['consent_default', 'consent_update', 'config', 'gtm_load', 'network_hit'];
  var EVENT_LABELS = {
    consent_default: 'Consent default',
    consent_update: 'Consent update',
    config: 'Google tag config',
    gtm_load: 'GTM loaded',
    network_hit: 'Vendor request',
    datalayer_event: 'dataLayer event'
  };
  var NOT_CONSENT_KEYS = ['region', 'wait_for_update'];

  // For each consent command in the timeline, what it changed. A default lists every type
  // it sets; an update lists only the types whose value differs from the state before it.
  // Returns { [eventId]: [{ key, from, to }] }.
  function consentChanges(timeline) {
    var current = {};
    var out = {};
    (timeline || []).forEach(function (e) {
      if (e.type !== 'consent_default' && e.type !== 'consent_update') return;
      var d = e.detail || {};
      var changes = [];
      Object.keys(d).forEach(function (k) {
        if (NOT_CONSENT_KEYS.indexOf(k) !== -1) return;
        if (e.type === 'consent_update' && current[k] === d[k]) return;
        changes.push({ key: k, from: k in current ? current[k] : null, to: d[k] });
        current[k] = d[k];
      });
      // Denied first, so the types that block tags lead.
      changes.sort(function (a, b) { return (a.to === 'denied' ? 0 : 1) - (b.to === 'denied' ? 0 : 1); });
      out[e.id] = changes;
    });
    return out;
  }

  // The consent a Google request carried (its own gcs/gcd) next to the consent on the page
  // when it was sent, per type. mismatch is true when both are known and they disagree.
  // gcdLetter is set when the request's gcd letter for the type is undocumented (#32): carried
  // then came from gcs, or is unknown when gcs does not cover the type.
  function requestConsentRows(hit) {
    // injected.js already normalises gcd, then gcs, to granted/denied in requestConsent.
    var own = hit.requestConsent || {};
    var unknown = hit.gcdUnknown || {};
    var at = hit.consentAtRequest || {};
    var types = ['ad_storage', 'analytics_storage', 'ad_user_data', 'ad_personalization'];
    var rows = [];
    types.forEach(function (k) {
      var carried = own[k] || null;
      var onPage = k in at ? at[k] : null;
      var letter = typeof unknown[k] === 'string' ? unknown[k] : null;
      if (!carried && !onPage && !letter) return;
      var row = { key: k, carried: carried, onPage: onPage, mismatch: !!(carried && onPage && carried !== onPage) };
      if (letter) row.gcdLetter = letter;
      rows.push(row);
    });
    return rows;
  }

  root.CFRender = {
    STATUS_TAGS: STATUS_TAGS,
    RELEVANT: RELEVANT,
    EVENT_LABELS: EVENT_LABELS,
    esc: esc,
    fmt: fmt,
    keyOf: keyOf,
    clock: clock,
    msLabel: msLabel,
    tagHtml: tagHtml,
    disclosureButton: disclosureButton,
    consentValue: consentValue,
    findingsHtml: findingsHtml,
    evidenceHtml: evidenceHtml,
    consentChanges: consentChanges,
    requestConsentRows: requestConsentRows
  };
})(globalThis);
