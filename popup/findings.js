// ConsentFlow Debugger — findings and verdict model
// Turns the state injected.js reports into findings (observed → consequence → fix → verify,
// plus evidence) and one verdict. Every summary in the popup is rendered from
// computeVerdict(), so no two status elements can disagree.
//
// Plain script, no modules: defines globalThis.CFFindings. Copy uses `backticks` for code;
// the popup renders those as <code> after escaping.
(function (root) {
  'use strict';

  var STATUS_ORDER = { broken: 0, review: 1, not_checked: 2, verified: 3 };

  var VERDICT_LABELS = {
    broken: '× BROKEN',
    review: '! REVIEW',
    incomplete: '– INCOMPLETE',
    verified: '✓ VERIFIED'
  };

  var VENDOR_LABELS = {
    google: 'Google',
    facebook: 'Meta',
    linkedin: 'LinkedIn',
    tiktok: 'TikTok',
    hotjar: 'Hotjar',
    clarity: 'Microsoft Clarity',
    pinterest: 'Pinterest',
    snapchat: 'Snapchat'
  };

  // Checks that wait on something the user can do on the page. Other needs (no config
  // call, no supported CMP) may never arrive, so they don't ask for more data.
  var ACTIONABLE_NEEDS = ['consent_update', 'google_request', 'vendor_request'];

  // What each kind of missing data means, and what unlocks the check.
  var NEEDS = {
    consent_default: {
      reason: 'Needs a consent default, and this page has none.',
      consequence: 'This check depends on the consent default, so it could not run.',
      fix: ['Add a consent default (see the first problem above), then reload the page.'],
      verify: 'This check runs once a consent default is captured.',
      evidence: { label: 'Consent default', value: 'none captured' }
    },
    config_call: {
      reason: "No `gtag('config')` call seen on this page load.",
      consequence: 'The order of consent default and Google tag cannot be judged without one.',
      fix: ['If the site loads GA4 with gtag.js, reload the page and reopen ConsentFlow.'],
      verify: "GTM-only setups don't send `config`, so this check may stay unchecked there.",
      evidence: { label: 'Config calls', value: '0 captured' }
    },
    cmp: {
      reason: 'No supported CMP recognized on this page.',
      consequence: '`wait_for_update` only matters when a CMP restores a saved choice.',
      fix: ['If the site uses another CMP, add `wait_for_update: 500` to the consent default by hand.'],
      verify: 'This check runs when one of the 10 supported CMPs is recognized.',
      evidence: { label: 'CMP', value: 'none recognized' }
    },
    consent_update: {
      reason: 'No consent update yet.',
      consequence: "It's unknown whether the banner passes the visitor's choice to Google tags.",
      fix: ['Accept or reject the cookie banner, then reopen ConsentFlow.'],
      verify: 'A consent update should appear within a second of the click.',
      evidence: { label: 'Consent updates', value: '0 captured' }
    },
    google_request: {
      reason: 'No Google request with a consent signal yet.',
      consequence: 'What consent Google was told cannot be compared with the page yet.',
      fix: ['Browse the page or reload it, then reopen ConsentFlow.'],
      verify: 'Requests to google-analytics.com or doubleclick.net appear with their `gcs` value.',
      evidence: { label: 'Google requests with gcs', value: '0 captured' }
    }
  };

  // ─── Small text helpers ──────────────────────────────────────
  function ms(n) { return '+' + Math.round(n) + ' ms'; }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }
  function code(s) { return '`' + s + '`'; }
  function joinList(items) {
    if (items.length <= 1) return items.join('');
    return items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1];
  }
  function codeList(items) { return joinList(items.map(code)); }

  // ─── Rule copy ───────────────────────────────────────────────
  // Each entry: function (rule, state) → finding fields for the rule's current status.
  var RULES = {
    'consent-default-exists': function (r, state) {
      var d = r.data || {};
      if (r.status === 'pass') {
        return {
          title: 'Consent default is set',
          observed: 'Consent default set at ' + ms(d.defaultMs) + ' with ' + plural((d.types || []).length, 'consent type') + '.',
          consequence: 'Google tags start from the values you declared, not from implied consent.',
          fix: ['Nothing to change.'],
          verify: 'After container or CMP changes, reload and confirm this check still passes.',
          evidence: [
            { label: 'Set at', value: ms(d.defaultMs) },
            { label: 'Types', value: (d.types || []).join(', ') || 'none' }
          ],
          firstMs: d.defaultMs
        };
      }
      var unguarded = (state.tagImpact || []).filter(function (t) { return t.verdict === 'no_consent_mode'; });
      var names = unguarded.map(function (t) { return t.name; });
      return {
        title: 'No consent default on this page',
        observed: 'No `consent` `default` command on this page load.' +
          (names.length ? ' Tags running without it: ' + joinList(names) + '.' : ''),
        consequence: 'Google tags treat every consent type as granted, so they collect before the visitor chooses.',
        fix: [
          "Add `gtag('consent', 'default', {…})` above the Google tag, with every type set to `denied`.",
          "Or turn on your CMP's Google Consent Mode setting, which sets the default for you."
        ],
        verify: 'Reload. This check should pass, with the default before any Google request.',
        evidence: [
          { label: 'Consent default', value: 'none captured' },
          { label: 'Tags detected', value: names.length ? names.join(', ') : 'none' }
        ],
        firstMs: null,
        rank: -1
      };
    },

    'consent-default-before-config': function (r) {
      var d = r.data || {};
      if (r.status === 'not_checked') return null;
      if (r.status === 'pass') {
        return {
          title: 'Consent default comes before the Google tag',
          observed: 'Consent default at ' + ms(d.defaultMs) + '; first `config` (' + d.configId + ') at ' + ms(d.configMs) + '.',
          consequence: 'Google tags read your defaults before they send anything.',
          fix: ['Nothing to change.'],
          verify: 'Reload after container changes; the default should stay ahead of `config`.',
          evidence: [
            { label: 'Consent default', value: ms(d.defaultMs) },
            { label: 'First config', value: d.configId + ' at ' + ms(d.configMs) }
          ],
          firstMs: d.configMs
        };
      }
      var withDefault = d.hasDefault;
      return {
        title: 'Google tag configured before the consent default',
        observed: withDefault
          ? '`config` for ' + d.configId + ' ran at ' + ms(d.configMs) + '; the consent default ran at ' + ms(d.defaultMs) + '.'
          : '`config` for ' + d.configId + ' ran at ' + ms(d.configMs) + ', and no consent default followed.',
        consequence: withDefault
          ? 'Requests in that ' + d.lateMs + ' ms gap assume consent is granted.'
          : 'Every request from this tag assumes consent is granted.',
        fix: [
          'Move the consent default above the Google tag snippet in the page source.',
          'In GTM, fire the consent default on the Consent Initialization – All Pages trigger.'
        ],
        verify: 'Reload. The consent default should come before `config` in the timeline.',
        evidence: [
          { label: 'First config', value: d.configId + ' at ' + ms(d.configMs) },
          { label: 'Consent default', value: withDefault ? ms(d.defaultMs) : 'none captured' }
        ].concat(withDefault ? [{ label: 'Gap', value: d.lateMs + ' ms' }] : []),
        firstMs: d.configMs
      };
    },

    'v2-types-present': function (r) {
      var d = r.data || {};
      if (r.status === 'not_checked') return null;
      if (r.status === 'pass') {
        return {
          title: 'Consent default includes the Consent Mode v2 types',
          observed: '`ad_user_data` and `ad_personalization` are both declared in the default.',
          consequence: 'Google Ads receives the v2 signals it needs for EEA traffic.',
          fix: ['Nothing to change.'],
          verify: 'Reload after CMP updates; both types should stay in the default.',
          evidence: [{ label: 'v2 types', value: 'ad_user_data, ad_personalization' }],
          firstMs: null
        };
      }
      var missing = d.missing || [];
      return {
        title: 'Consent default is missing Consent Mode v2 types',
        observed: 'The consent default does not declare ' + codeList(missing) + '.',
        consequence: 'Google Ads may drop conversion and audience data for EEA visitors.',
        fix: [
          'Add ' + joinList(missing.map(function (t) { return code(t + ": 'denied'"); })) + ' to the consent default.',
          'If a CMP sets the default, turn on its Consent Mode v2 option instead.'
        ],
        verify: 'Reload. This check should pass, listing both types in the default.',
        evidence: [{ label: 'Missing', value: missing.join(', ') }],
        firstMs: null
      };
    },

    'wait-for-update': function (r) {
      var d = r.data || {};
      if (r.status === 'not_checked') return null;
      if (r.status === 'pass') {
        return {
          title: 'wait_for_update is set',
          observed: '`wait_for_update` is ' + d.waitForUpdate + ' ms, and ' + d.cmp + ' is on the page.',
          consequence: 'Google tags wait up to ' + d.waitForUpdate + ' ms for ' + d.cmp + ' before using defaults.',
          fix: ['Nothing to change.'],
          verify: 'Reload after CMP changes; the default should still carry `wait_for_update`.',
          evidence: [
            { label: 'wait_for_update', value: d.waitForUpdate + ' ms' },
            { label: 'CMP', value: d.cmp }
          ],
          firstMs: null
        };
      }
      return {
        title: 'wait_for_update is missing with ' + d.cmp,
        observed: d.cmp + ' is on the page, and the consent default has no `wait_for_update`.',
        consequence: 'Tags may fire on default consent before ' + d.cmp + " restores a returning visitor's choice.",
        fix: ['Add `wait_for_update: 500` to the consent default, or enable it in ' + d.cmp + "'s Consent Mode settings."],
        verify: 'Reload. The consent default should show `wait_for_update` with a value in ms.',
        evidence: [
          { label: 'CMP', value: d.cmp },
          { label: 'wait_for_update', value: 'not set' }
        ],
        firstMs: null
      };
    },

    'consent-update-received': function (r) {
      var d = r.data || {};
      if (r.status === 'not_checked') return null;
      return {
        title: 'Banner choice reached Consent Mode',
        observed: plural(d.count, 'consent update') + ' captured; the last at ' + ms(d.lastMs) + '.',
        consequence: "Tags switch from the defaults to the visitor's choice.",
        fix: ['Nothing to change.'],
        verify: 'Change the choice in the banner; a new consent update should appear.',
        evidence: [
          { label: 'Updates', value: String(d.count) },
          { label: 'Last at', value: ms(d.lastMs) }
        ],
        firstMs: d.lastMs
      };
    },

    'gcs-consistency': function (r) {
      var d = r.data || {};
      if (r.status === 'not_checked') return null;
      if (r.status === 'pass') {
        return {
          title: 'Google requests match the consent on the page',
          observed: plural(d.checked, 'Google request') + ' checked; each `gcs` value matched consent when sent.',
          consequence: 'Google receives the same consent the visitor gave on the page.',
          fix: ['Nothing to change.'],
          verify: 'Choose in the banner and reopen ConsentFlow; this check should still pass.',
          evidence: [{ label: 'Requests checked', value: String(d.checked) }],
          firstMs: null
        };
      }
      var issues = d.issues || [];
      var first = issues[0] || {};
      var overclaims = issues.some(function (i) { return i.actual === 'granted' && i.expected === 'denied'; });
      return {
        title: 'Google requests carried different consent than the page',
        observed: plural(issues.length, 'mismatch', 'mismatches') + '. First: ' + first.host + ' at ' + ms(first.ms) +
          ' sent ' + code(first.type) + ' ' + first.actual + '; the page had ' + first.expected + '.',
        consequence: overclaims
          ? 'Google may treat data from visitors who declined as consented.'
          : 'Google may discard data from visitors who consented.',
        fix: [
          "Trigger Google tags on the CMP's consent event, so the update lands before they send.",
          'Remove any second gtag.js snippet that loads outside GTM and sets its own consent.'
        ],
        verify: 'Reload, choose in the banner, and reopen ConsentFlow. This check should pass.',
        evidence: issues.slice(0, 4).map(function (i) {
          return { label: ms(i.ms) + ' ' + i.host, value: i.type + ': sent ' + i.actual + ', page ' + i.expected };
        }),
        firstMs: first.ms
      };
    },

    'no-duplicate-defaults': function (r) {
      var d = r.data || {};
      if (r.status === 'not_checked') return null;
      if (r.status === 'pass') {
        return {
          title: 'One consent default',
          observed: 'Exactly one `consent` `default` command on this page load.',
          consequence: 'The values you maintain are the values Google uses.',
          fix: ['Nothing to change.'],
          verify: 'Reload after adding a CMP or template; this check should still count 1.',
          evidence: [{ label: 'Consent defaults', value: '1' }],
          firstMs: null
        };
      }
      return {
        title: d.count + ' consent defaults on this page',
        observed: d.count + ' `consent` `default` commands; only the first, at ' + ms(d.firstMs) + ', takes effect.',
        consequence: 'Later defaults are ignored, so the values you edit may not be the ones in use.',
        fix: ['Keep one consent default: remove the copy in the page source or in GTM, whichever you don\'t maintain.'],
        verify: 'Reload. This check should count 1 consent default.',
        evidence: [
          { label: 'Consent defaults', value: String(d.count) },
          { label: 'First at', value: ms(d.firstMs) }
        ],
        firstMs: d.firstMs
      };
    },

    'default-before-update': function (r) {
      var d = r.data || {};
      if (r.status === 'not_checked') return null;
      if (r.status === 'pass') {
        return {
          title: 'Consent default comes before the banner choice',
          observed: 'Default at ' + ms(d.defaultMs) + '; first update at ' + ms(d.updateMs) + '.',
          consequence: "The visitor's choice is applied on top of the defaults, as intended.",
          fix: ['Nothing to change.'],
          verify: 'Reload and choose again; the default should stay first.',
          evidence: [
            { label: 'Consent default', value: ms(d.defaultMs) },
            { label: 'First update', value: ms(d.updateMs) }
          ],
          firstMs: d.updateMs
        };
      }
      if (!d.hasDefault) {
        return {
          title: 'Consent update with no default',
          observed: plural(d.updateCount, 'consent update') + ', the first at ' + ms(d.updateMs) + '; no default was ever set.',
          consequence: 'Until that update, every consent type was treated as granted.',
          fix: ['Add a consent default with every type `denied`, loaded before the CMP script.'],
          verify: 'Reload and choose in the banner. The default should come first in the timeline.',
          evidence: [
            { label: 'First update', value: ms(d.updateMs) },
            { label: 'Consent default', value: 'none captured' }
          ],
          firstMs: d.updateMs
        };
      }
      return {
        title: 'Consent update arrived before the default',
        observed: 'Update at ' + ms(d.updateMs) + '; default at ' + ms(d.defaultMs) + ', ' + d.earlyMs + ' ms later.',
        consequence: 'The late default can overwrite the choice the visitor already made.',
        fix: [
          'Load the consent default before the CMP: inline above the CMP tag, or GTM Consent Initialization.'
        ],
        verify: 'Reload and choose in the banner. The default should come first in the timeline.',
        evidence: [
          { label: 'First update', value: ms(d.updateMs) },
          { label: 'Consent default', value: ms(d.defaultMs) }
        ],
        firstMs: d.updateMs
      };
    }
  };

  function notCheckedCopy(rule) {
    var n = NEEDS[rule.needs] || {
      reason: 'Not enough data on this page load.',
      consequence: 'This check could not run.',
      fix: ['Reload the page and reopen ConsentFlow.'],
      verify: 'This check runs once the data it needs is captured.',
      evidence: { label: 'Data', value: 'not captured' }
    };
    return {
      title: NOT_CHECKED_TITLES[rule.id] || rule.name,
      observed: n.reason,
      consequence: NOT_CHECKED_CONSEQUENCES[rule.id] || n.consequence,
      fix: n.fix.slice(),
      verify: n.verify,
      evidence: [n.evidence],
      reason: n.reason,
      needs: rule.needs,
      firstMs: null
    };
  }

  // Where two checks wait on the same data, say what each one can't judge yet.
  var NOT_CHECKED_CONSEQUENCES = {
    'default-before-update': 'Whether the default lands before the choice cannot be judged yet.'
  };

  // Titles for checks that did not run: the question the check answers.
  var NOT_CHECKED_TITLES = {
    'consent-default-before-config': 'Consent default before the Google tag',
    'v2-types-present': 'Consent Mode v2 types in the default',
    'wait-for-update': 'wait_for_update with a CMP',
    'consent-update-received': 'Banner choice reaching Consent Mode',
    'gcs-consistency': 'Consent in Google requests matches the page',
    'no-duplicate-defaults': 'One consent default',
    'default-before-update': 'Consent default before the banner choice'
  };

  function ruleFinding(rule, state) {
    var status = { pass: 'verified', fail: 'broken', warn: 'review', not_checked: 'not_checked' }[rule.status] || 'not_checked';
    var builder = RULES[rule.id];
    var copy = status === 'not_checked' ? notCheckedCopy(rule) : (builder ? builder(rule, state) : null);
    if (!copy) copy = notCheckedCopy(rule);
    copy.id = rule.id;
    copy.kind = 'rule';
    copy.status = status;
    copy.certainty = 'observed';
    return copy;
  }

  // ─── Tag copy ────────────────────────────────────────────────
  var CONSEQUENCE_BY_TYPE = {
    advertising: 'Conversions and audiences from visitors who declined may be recorded.',
    analytics: 'Visits from people who declined may be measured and stored.',
    tag_manager: 'Tags in this container may collect data from visitors who declined.'
  };

  function tagCopy(t, state) {
    var types = t.consentTypes || [];
    var vendor = VENDOR_LABELS[t.vendor] || t.vendor || 'the vendor';
    var host = (t.hosts && t.hosts[0]) || vendor;
    var needs = { label: 'Needs consent', value: types.join(', ') || 'none' };
    var base = { id: 'tag:' + t.name, kind: 'tag', tag: t.name, certainty: 'observed', firstMs: null };
    var copy;

    if (t.verdict === 'violation') {
      var denied = t.deniedTypes && t.deniedTypes.length ? t.deniedTypes : types;
      var isGoogle = t.vendor === 'google';
      copy = {
        status: 'broken',
        title: t.name + ' sent ' + plural(t.preConsentCount, 'request') + ' while ' + joinList(denied) + ' was denied',
        observed: t.preConsentCount + ' of ' + plural(t.requestCount, 'request') + ' to ' + vendor + ' went out while ' +
          codeList(denied) + ' was denied, first at ' + ms(t.firstPreConsentMs) + '.' +
          (isGoogle ? ' Under advanced Consent Mode these may be cookieless pings.' : ''),
        consequence: CONSEQUENCE_BY_TYPE[t.type] || CONSEQUENCE_BY_TYPE.advertising,
        fix: isGoogle
          ? ['For basic Consent Mode, add `Require additional consent` for ' + codeList(types) + ' on the tag in GTM.',
             'For advanced Consent Mode, confirm each request sends `gcs=G100` while consent is denied.']
          : ['In GTM, open the ' + t.name + ' tag and add `Require additional consent` for ' + codeList(types) + '.',
             "Or fire it on your CMP's consent-granted event instead of All Pages."],
        verify: 'Reject the banner and reload. No requests to ' + host + ' should appear before you accept.',
        evidence: [
          { label: 'Requests while denied', value: t.preConsentCount + ' of ' + t.requestCount },
          { label: 'First at', value: ms(t.firstPreConsentMs) },
          { label: 'Sent to', value: (t.hosts || []).join(', ') || vendor },
          needs
        ],
        firstMs: t.firstPreConsentMs
      };
    } else if (t.verdict === 'no_consent_mode') {
      copy = {
        status: 'broken',
        title: t.name + ' runs without consent controls',
        observed: 'The page has no consent default, so ' + t.name + ' is not gated by Consent Mode.',
        consequence: CONSEQUENCE_BY_TYPE[t.type] || CONSEQUENCE_BY_TYPE.advertising,
        fix: ['Add a consent default, then require ' + codeList(types) + ' on the ' + t.name + ' tag in GTM.'],
        verify: 'Reject the banner and reload. ' + t.name + ' should send nothing until you accept.',
        evidence: [{ label: 'Consent default', value: 'none captured' }, needs],
        rank: 0
      };
    } else if (t.verdict === 'blocked') {
      copy = {
        status: 'verified',
        title: t.name + ' held back while ' + joinList(types) + ' is denied',
        observed: codeList(types) + ' is denied, and no requests to ' + vendor + ' went out.',
        consequence: 'Nothing from this tag is collected without consent.',
        fix: ['Nothing to change.'],
        verify: 'Accept the banner; ' + t.name + ' requests should then appear.',
        evidence: [{ label: 'Requests while denied', value: '0' }, needs]
      };
    } else if (t.verdict === 'firing') {
      copy = {
        status: 'verified',
        title: t.name + ' sent requests only with consent',
        observed: plural(t.requestCount, 'request') + ' to ' + vendor + ', none while ' + codeList(types) + ' was denied.',
        consequence: 'This tag respects the choice the visitor made.',
        fix: ['Nothing to change.'],
        verify: 'Reject the banner and reload; ' + t.name + ' should then send nothing.',
        evidence: [
          { label: 'Requests', value: String(t.requestCount) },
          { label: 'While denied', value: '0' },
          needs
        ]
      };
    } else {
      // idle: consent not denied and nothing sent yet
      copy = {
        status: 'not_checked',
        title: t.name + ' requests',
        observed: 'No requests to ' + vendor + ' captured yet. Image pixels are not captured.',
        consequence: 'Whether ' + t.name + ' respects consent cannot be judged yet.',
        fix: ['Browse the page or accept the banner, then reopen ConsentFlow.'],
        verify: 'Requests to ' + vendor + ' appear here once the tag fires.',
        evidence: [{ label: 'Requests', value: '0 captured' }, needs],
        reason: 'No ' + t.name + ' requests yet.',
        needs: 'vendor_request'
      };
    }
    for (var k in base) if (!(k in copy)) copy[k] = base[k];
    return copy;
  }

  // ─── Findings ────────────────────────────────────────────────
  function buildFindings(state) {
    state = state || {};
    var out = [];
    (state.validation || []).forEach(function (rule) { out.push(ruleFinding(rule, state)); });
    // Tags without Consent Mode are reported inside the missing-default finding.
    (state.tagImpact || []).forEach(function (t) {
      if (t.verdict === 'no_consent_mode') return;
      out.push(tagCopy(t, state));
    });
    out.forEach(function (f, i) {
      f._i = i;
      // Among checks that did not run, the ones the user can unlock come first.
      if (f.status === 'not_checked') f.rank = ACTIONABLE_NEEDS.indexOf(f.needs) === -1 ? 1 : 0;
    });
    out.sort(function (a, b) {
      var s = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
      if (s) return s;
      var r = (a.rank || 0) - (b.rank || 0);
      if (r) return r;
      var am = a.firstMs === null || a.firstMs === undefined ? Infinity : a.firstMs;
      var bm = b.firstMs === null || b.firstMs === undefined ? Infinity : b.firstMs;
      if (am !== bm) return am - bm;
      return a._i - b._i;
    });
    out.forEach(function (f) { delete f._i; delete f.rank; });
    return out;
  }

  // ─── Verdict ─────────────────────────────────────────────────
  function computeVerdict(state, findings) {
    findings = findings || buildFindings(state);
    var counts = { broken: 0, review: 0, notChecked: 0, verified: 0, total: findings.length };
    findings.forEach(function (f) {
      if (f.status === 'broken') counts.broken++;
      else if (f.status === 'review') counts.review++;
      else if (f.status === 'not_checked') counts.notChecked++;
      else counts.verified++;
    });

    var noDefault = (state && state.validation || []).some(function (r) {
      return r.id === 'consent-default-exists' && r.status === 'fail';
    });
    var actionable = null;
    ACTIONABLE_NEEDS.some(function (need) {
      var f = findings.filter(function (x) { return x.status === 'not_checked' && x.needs === need; })[0];
      if (f) actionable = f;
      return !!f;
    });

    function also(parts) {
      parts = parts.filter(Boolean);
      return parts.length ? 'Also ' + joinList(parts) + '.' : 'Observed on this page load.';
    }
    var reviewPart = counts.review ? counts.review + ' to review' : '';
    var ncPart = counts.notChecked ? plural(counts.notChecked, 'check') + ' not run yet' : '';

    var status, title, detail;
    if (counts.broken) {
      status = 'broken';
      if (noDefault) {
        title = 'This page has no Consent Mode.';
        detail = 'Tags run as if every visitor consented. ' + also([
          counts.broken > 1 ? plural(counts.broken - 1, 'other problem') : '', reviewPart, ncPart
        ]);
      } else {
        title = plural(counts.broken, 'consent problem') + ' on this page.';
        detail = also([reviewPart, ncPart]);
      }
    } else if (counts.review) {
      status = 'review';
      title = plural(counts.review, 'consent setting') + ' to review on this page.';
      detail = counts.notChecked ? 'Nothing is broken. ' + plural(counts.notChecked, 'check') + ' not run yet.'
        : 'Nothing is broken on this page load.';
    } else if (counts.notChecked) {
      status = 'incomplete';
      var ran = counts.total - counts.notChecked;
      if (actionable) {
        title = 'Not enough data yet.';
        detail = ran + ' of ' + counts.total + ' checks ran and passed. ' + actionable.fix[0];
      } else {
        title = 'No problems in the checks that ran.';
        detail = ran + ' of ' + counts.total + ' checks passed. ' + counts.notChecked + " couldn't run on this page.";
      }
    } else {
      status = 'verified';
      title = 'Consent is wired correctly on this page.';
      detail = 'All ' + counts.total + ' checks passed on this page load.';
    }

    return {
      status: status,
      label: VERDICT_LABELS[status],
      title: title,
      detail: detail,
      counts: counts,
      showReviewCta: status === 'broken' || status === 'review'
    };
  }

  root.CFFindings = {
    buildFindings: buildFindings,
    computeVerdict: computeVerdict,
    tagCopy: tagCopy,
    STATUS_ORDER: STATUS_ORDER
  };
})(globalThis);
