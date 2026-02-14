// ConsentFlow Debugger - Core Consent Interception Engine
// Runs in PAGE context (not isolated world) to access dataLayer, gtag, etc.
// Injected at document_start BEFORE GTM loads.
(function () {
  'use strict';
  if (window.__cfDebug) return;

  // ─── Core State ───────────────────────────────────────────────
  const state = {
    timeline: [],            // every dataLayer push, in order
    consentDefaults: null,   // the consent('default', ...) command
    consentUpdates: [],      // all consent('update', ...) commands
    currentConsent: {},      // merged consent state
    networkHits: [],         // Google requests with decoded GCS/GCD
    configCalls: [],         // gtag('config', ...) calls
    cmp: null,               // detected CMP
    tags: [],                // detected tracking tags
    validation: [],          // rule results
    t0: performance.now(),
    ready: false
  };
  window.__cfDebug = state;

  let eventId = 0;
  function ts() { return performance.now() - state.t0; }

  function addEvent(type, detail, source) {
    const evt = {
      id: eventId++,
      type: type,
      detail: safeClone(detail),
      source: source || 'unknown',
      ms: Math.round(ts() * 100) / 100,
      wall: Date.now()
    };
    state.timeline.push(evt);
    notify('event', evt);
    return evt;
  }

  function safeClone(obj) {
    try { return JSON.parse(JSON.stringify(obj)); }
    catch { return String(obj); }
  }

  function notify(type, payload) {
    try {
      window.postMessage({
        source: 'cf-debug-injected', type: type, payload: payload
      }, '*');
    } catch { /* swallow */ }
  }

  // ─── dataLayer Interception ───────────────────────────────────
  // We must intercept .push AND survive GTM replacing .push later.
  function interceptDataLayer() {
    if (!window.dataLayer) window.dataLayer = [];
    const dl = window.dataLayer;

    // Record anything already in the array (inline consent defaults)
    for (let i = 0; i < dl.length; i++) {
      processDataLayerEntry(dl[i], 'dataLayer.existing');
    }

    // Wrap push and make it resilient to GTM overwriting it
    let realPush = dl.push.bind(dl);
    const wrappedPush = function () {
      for (let i = 0; i < arguments.length; i++) {
        processDataLayerEntry(arguments[i], 'dataLayer.push');
      }
      return realPush.apply(dl, arguments);
    };
    dl.push = wrappedPush;

    // When GTM replaces .push with its own CommandProcessor, intercept that too
    try {
      let currentPushFn = wrappedPush;
      Object.defineProperty(dl, 'push', {
        get: function () { return currentPushFn; },
        set: function (newPush) {
          // GTM is replacing push — wrap GTM's new push with our interceptor
          realPush = newPush;
          currentPushFn = function () {
            for (let i = 0; i < arguments.length; i++) {
              processDataLayerEntry(arguments[i], 'dataLayer.push');
            }
            return realPush.apply(dl, arguments);
          };
        },
        configurable: true,
        enumerable: true
      });
    } catch (e) {
      // defineProperty may fail on some environments; push interception still works
    }
  }

  function processDataLayerEntry(entry, source) {
    if (!entry || typeof entry !== 'object') return;

    // Detect consent commands — both array and arguments-object formats
    const cmd = extractConsentCommand(entry);
    if (cmd) {
      handleConsentCommand(cmd.action, cmd.settings, source);
      return;
    }

    // Detect config calls: gtag('config', 'G-XXXXX', {...})
    const cfg = extractConfigCall(entry);
    if (cfg) {
      state.configCalls.push({ id: cfg.id, ms: ts(), wall: Date.now() });
      addEvent('config', { measurementId: cfg.id }, source);
      return;
    }

    // Detect gtm.js (GTM loaded)
    if (entry.event === 'gtm.js') {
      addEvent('gtm_load', { event: 'gtm.js' }, source);
      return;
    }

    // Detect any event with an 'event' key
    if (entry.event) {
      addEvent('datalayer_event', { event: entry.event }, source);
    }
  }

  function extractConsentCommand(entry) {
    // Array format: ['consent', 'default', {settings}]
    if (Array.isArray(entry) && entry[0] === 'consent') {
      return { action: entry[1], settings: entry[2] || {} };
    }
    // Arguments-object / GTM-internal format: {0: 'consent', 1: 'default', 2: {settings}}
    if (entry['0'] === 'consent' && (entry['1'] === 'default' || entry['1'] === 'update')) {
      return { action: entry['1'], settings: entry['2'] || {} };
    }
    return null;
  }

  function extractConfigCall(entry) {
    // Array format: ['config', 'G-XXXXX']
    if (Array.isArray(entry) && entry[0] === 'config' && typeof entry[1] === 'string') {
      return { id: entry[1] };
    }
    // Arguments-object format
    if (entry['0'] === 'config' && typeof entry['1'] === 'string') {
      return { id: entry['1'] };
    }
    return null;
  }

  function handleConsentCommand(action, settings, source) {
    const record = {
      settings: safeClone(settings),
      ms: ts(),
      wall: Date.now()
    };

    if (action === 'default') {
      if (!state.consentDefaults) {
        state.consentDefaults = record;
      }
      // Apply defaults (don't overwrite later updates)
      for (const key in settings) {
        if (key === 'wait_for_update') continue;
        if (!(key in state.currentConsent)) {
          state.currentConsent[key] = settings[key];
        }
      }
      addEvent('consent_default', settings, source);
    } else if (action === 'update') {
      state.consentUpdates.push(record);
      Object.assign(state.currentConsent, settings);
      addEvent('consent_update', settings, source);
    }
  }

  // ─── gtag Function Trap ───────────────────────────────────────
  // Define gtag early so consent defaults are captured even if written as
  // gtag('consent', 'default', ...) before GTM's own gtag initialization.
  function interceptGtag() {
    if (typeof window.gtag === 'function') {
      // gtag already exists — wrap it
      const original = window.gtag;
      window.gtag = function () {
        captureGtagCall(arguments);
        return original.apply(this, arguments);
      };
    } else {
      // gtag doesn't exist yet — create a trap that records calls
      // When GTM creates the real gtag, it replays through dataLayer,
      // which we already intercept. But direct gtag() calls before
      // GTM loads need to be captured.
      window.gtag = function () {
        captureGtagCall(arguments);
        window.dataLayer.push(arguments);
      };
    }

    // Guard against gtag being replaced later
    try {
      let currentGtag = window.gtag;
      Object.defineProperty(window, 'gtag', {
        get: function () { return currentGtag; },
        set: function (fn) {
          if (typeof fn === 'function') {
            const captured = fn;
            currentGtag = function () {
              captureGtagCall(arguments);
              return captured.apply(this, arguments);
            };
          }
        },
        configurable: true
      });
    } catch (e) { /* non-critical */ }
  }

  function captureGtagCall(args) {
    if (args[0] === 'consent') {
      // Already handled via dataLayer interception in most cases,
      // but capture here for direct gtag('consent',...) calls
      // that bypass dataLayer
    }
    if (args[0] === 'config') {
      const id = args[1];
      if (typeof id === 'string' && !state.configCalls.some(c => c.id === id)) {
        state.configCalls.push({ id: id, ms: ts(), wall: Date.now() });
        addEvent('config', { measurementId: id }, 'gtag');
      }
    }
  }

  // ─── Network Request Interception ─────────────────────────────
  // Capture requests to Google analytics endpoints and decode consent params.
  const GOOGLE_DOMAINS = [
    'google-analytics.com', 'analytics.google.com',
    'googletagmanager.com', 'googlesyndication.com',
    'googleadservices.com', 'doubleclick.net',
    'google.com/pagead'
  ];

  function isGoogleAnalyticsUrl(urlStr) {
    try {
      const url = new URL(urlStr, window.location.origin);
      return GOOGLE_DOMAINS.some(d => url.hostname.includes(d) || url.pathname.includes(d));
    } catch { return false; }
  }

  function captureNetworkHit(urlStr, method) {
    if (!isGoogleAnalyticsUrl(urlStr)) return;
    try {
      const url = new URL(urlStr, window.location.origin);
      const params = url.searchParams;
      const hit = {
        url: url.pathname,
        host: url.hostname,
        method: method,
        ms: ts(),
        wall: Date.now(),
        gcs: params.get('gcs'),
        gcd: params.get('gcd'),
        npa: params.get('npa'),
        tid: params.get('tid') || params.get('id'),
        en: params.get('en'),   // event name in GA4
        decoded: {}
      };

      if (hit.gcs) hit.decoded.gcs = decodeGCS(hit.gcs);
      if (hit.gcd) hit.decoded.gcd = decodeGCD(hit.gcd);
      if (hit.npa) hit.decoded.npa = hit.npa === '1' ? 'non-personalized (ad_personalization denied)' : 'personalized';

      state.networkHits.push(hit);
      addEvent('network_hit', hit, 'network');
    } catch { /* swallow malformed URLs */ }
  }

  function interceptNetwork() {
    // sendBeacon
    if (navigator.sendBeacon) {
      const original = navigator.sendBeacon.bind(navigator);
      navigator.sendBeacon = function (url, data) {
        captureNetworkHit(String(url), 'beacon');
        return original(url, data);
      };
    }

    // fetch
    const originalFetch = window.fetch;
    if (originalFetch) {
      window.fetch = function (input, init) {
        const url = input instanceof Request ? input.url : String(input);
        captureNetworkHit(url, 'fetch');
        return originalFetch.apply(this, arguments);
      };
    }

    // XMLHttpRequest
    const originalXHROpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
      captureNetworkHit(String(url), 'xhr');
      return originalXHROpen.apply(this, arguments);
    };
  }

  // ─── GCS / GCD Decoders ───────────────────────────────────────
  function decodeGCS(gcs) {
    // Format: G1<analytics><ads> where 1=granted, 0=denied
    // Example: G111 = both granted, G100 = both denied
    if (!gcs || !gcs.startsWith('G1')) return { raw: gcs, error: 'unexpected format' };
    const chars = gcs.substring(2);
    return {
      raw: gcs,
      analytics_storage: chars[0] === '1' ? 'granted' : 'denied',
      ad_storage: chars[1] === '1' ? 'granted' : 'denied'
    };
  }

  function decodeGCD(gcd) {
    // Format: "1<seg1><seg2><seg3><seg4>5<seg5>"
    // Each segment is 2 chars: <source_digit><state_char>
    // Source: 1=default, 3=update, 5=not set
    // State: l=unset, p=denied(default), t=granted(default),
    //        e=granted(updated), q=denied(updated)
    if (!gcd || gcd.length < 2) return { raw: gcd, error: 'too short' };

    const stateMap = {
      'l': 'unset', 'p': 'denied (default)', 't': 'granted (default)',
      'e': 'granted (updated)', 'q': 'denied (updated)'
    };

    // Extract 2-char segments after the version prefix
    const segments = [];
    const body = gcd.substring(1); // skip version char
    for (let i = 0; i < body.length; i += 2) {
      if (i + 1 < body.length) {
        segments.push({ source: body[i], state: body[i + 1] });
      }
    }

    const labels = ['ad_storage', 'analytics_storage', 'ad_user_data', 'ad_personalization'];
    const decoded = { raw: gcd };
    segments.forEach(function (seg, idx) {
      const label = labels[idx] || ('unknown_' + idx);
      decoded[label] = stateMap[seg.state] || ('unknown:' + seg.state);
    });
    return decoded;
  }

  // ─── CMP Detection ────────────────────────────────────────────
  function detectCMP() {
    if (window.Cookiebot) return { name: 'Cookiebot', detected: true };
    if (window.OneTrust) return { name: 'OneTrust', detected: true };
    if (window.__tcfapi) return { name: 'IAB TCF CMP', detected: true };
    if (window.CookieYes) return { name: 'CookieYes', detected: true };
    if (window.cc) return { name: 'CookieConsent', detected: true };
    if (window.Osano) return { name: 'Osano', detected: true };
    if (window.klaro) return { name: 'Klaro', detected: true };
    if (window.CookieInformation) return { name: 'Cookie Information', detected: true };

    // Check script tags
    const scripts = document.querySelectorAll('script[src]');
    for (let i = 0; i < scripts.length; i++) {
      const src = scripts[i].src.toLowerCase();
      if (src.includes('cookiebot.com')) return { name: 'Cookiebot (script)', detected: true };
      if (src.includes('onetrust.com') || src.includes('cookielaw.org')) return { name: 'OneTrust (script)', detected: true };
      if (src.includes('cookieyes.com')) return { name: 'CookieYes (script)', detected: true };
      if (src.includes('osano.com')) return { name: 'Osano (script)', detected: true };
      if (src.includes('usercentrics.eu')) return { name: 'Usercentrics (script)', detected: true };
      if (src.includes('iubenda.com')) return { name: 'iubenda (script)', detected: true };
    }

    return { name: 'None', detected: false };
  }

  // ─── Tag Detection ────────────────────────────────────────────
  function detectTags() {
    const found = [];
    function check(name, type, consentTypes, test) {
      try {
        if (test()) found.push({ name: name, type: type, consentTypes: consentTypes });
      } catch { /* ignore */ }
    }

    check('Google Analytics 4', 'analytics', ['analytics_storage'], function () {
      return !!document.querySelector('script[src*="gtag/js"]') ||
        !!document.querySelector('script[src*="googletagmanager.com/gtag"]');
    });
    check('Google Tag Manager', 'tag_manager', ['analytics_storage', 'ad_storage'], function () {
      return !!window.google_tag_manager ||
        !!document.querySelector('script[src*="googletagmanager.com/gtm.js"]');
    });
    check('Google Ads', 'advertising', ['ad_storage', 'ad_user_data', 'ad_personalization'], function () {
      return !!document.querySelector('script[src*="googleadservices.com"]') ||
        !!document.querySelector('script[src*="googlesyndication.com"]');
    });
    check('Facebook Pixel', 'advertising', ['ad_storage'], function () {
      return !!window.fbq || !!document.querySelector('script[src*="connect.facebook.net"]');
    });
    check('LinkedIn Insight', 'advertising', ['ad_storage'], function () {
      return !!window._linkedin_data_partner_ids ||
        !!document.querySelector('script[src*="snap.licdn.com"]');
    });
    check('TikTok Pixel', 'advertising', ['ad_storage'], function () {
      return !!window.ttq || !!document.querySelector('script[src*="analytics.tiktok.com"]');
    });
    check('Hotjar', 'analytics', ['analytics_storage'], function () {
      return !!window.hj || !!document.querySelector('script[src*="hotjar.com"]');
    });
    check('Microsoft Clarity', 'analytics', ['analytics_storage'], function () {
      return !!window.clarity || !!document.querySelector('script[src*="clarity.ms"]');
    });
    check('Pinterest Tag', 'advertising', ['ad_storage'], function () {
      return !!window.pintrk || !!document.querySelector('script[src*="pintrk"]');
    });
    check('Snapchat Pixel', 'advertising', ['ad_storage'], function () {
      return !!window.snaptr || !!document.querySelector('script[src*="sc-static.net"]');
    });

    return found;
  }

  // ─── Validation Engine ────────────────────────────────────────
  function runValidation() {
    const rules = [];

    // Rule 1: consent default must exist
    rules.push({
      id: 'consent-default-exists',
      name: 'Consent Default Exists',
      description: 'A gtag("consent", "default", {...}) command must be present. Without it, all consent types default to "granted" and tags fire without restriction.',
      status: state.consentDefaults ? 'pass' : 'fail',
      detail: state.consentDefaults
        ? 'Found at ' + Math.round(state.consentDefaults.ms) + 'ms with: ' + Object.keys(state.consentDefaults.settings).join(', ')
        : 'No consent default found. All tags will fire as if consent is granted.'
    });

    // Rule 2: consent default must come before any config call
    var defaultMs = state.consentDefaults ? state.consentDefaults.ms : Infinity;
    var firstConfigMs = state.configCalls.length > 0 ? state.configCalls[0].ms : Infinity;
    var configBeforeDefault = firstConfigMs < defaultMs && state.configCalls.length > 0;
    rules.push({
      id: 'consent-default-before-config',
      name: 'Default Before Config',
      description: 'consent("default") must appear before any gtag("config"). Otherwise tags fire in the gap with implicit "granted" consent.',
      status: state.configCalls.length === 0 ? 'info' : (configBeforeDefault ? 'fail' : 'pass'),
      detail: configBeforeDefault
        ? 'RACE CONDITION: gtag("config", "' + state.configCalls[0].id + '") fired at ' + Math.round(firstConfigMs) + 'ms but consent default was at ' + Math.round(defaultMs) + 'ms (' + Math.round(defaultMs - firstConfigMs) + 'ms late).'
        : state.configCalls.length === 0
          ? 'No config calls detected yet.'
          : 'Consent default (' + Math.round(defaultMs) + 'ms) correctly precedes first config (' + Math.round(firstConfigMs) + 'ms).'
    });

    // Rule 3: Consent Mode v2 types must be present
    var v2Types = ['ad_user_data', 'ad_personalization'];
    var defaultSettings = state.consentDefaults ? state.consentDefaults.settings : {};
    var missingV2 = v2Types.filter(function (t) { return !(t in defaultSettings); });
    rules.push({
      id: 'v2-types-present',
      name: 'Consent Mode v2 Types',
      description: 'ad_user_data and ad_personalization are required for Consent Mode v2. Google Ads conversions will not attribute without them.',
      status: !state.consentDefaults ? 'info' : (missingV2.length === 0 ? 'pass' : 'warn'),
      detail: !state.consentDefaults
        ? 'No consent default to check.'
        : missingV2.length === 0
          ? 'Both ad_user_data and ad_personalization are declared.'
          : 'Missing from consent default: ' + missingV2.join(', ') + '. Add these for v2 compliance.'
    });

    // Rule 4: wait_for_update should be set when a CMP is present
    var hasWaitForUpdate = state.consentDefaults && state.consentDefaults.settings.wait_for_update;
    var cmpDetected = state.cmp && state.cmp.detected;
    rules.push({
      id: 'wait-for-update',
      name: 'wait_for_update Configured',
      description: 'When a CMP is present, wait_for_update (in ms) should be set in consent defaults so GTM waits for the CMP to load before using default consent values.',
      status: !state.consentDefaults ? 'info'
        : !cmpDetected ? 'info'
          : hasWaitForUpdate ? 'pass' : 'warn',
      detail: !state.consentDefaults ? 'No consent default to check.'
        : !cmpDetected ? 'No CMP detected; wait_for_update not applicable.'
          : hasWaitForUpdate ? 'wait_for_update is set to ' + state.consentDefaults.settings.wait_for_update + 'ms.'
            : 'CMP (' + state.cmp.name + ') detected but wait_for_update is missing. Tags may fire with default consent before the CMP loads.'
    });

    // Rule 5: consent update received
    rules.push({
      id: 'consent-update-received',
      name: 'Consent Update Received',
      description: 'After the user interacts with the consent banner, a consent("update") should fire to change from default to user-chosen values.',
      status: state.consentUpdates.length > 0 ? 'pass' : 'info',
      detail: state.consentUpdates.length > 0
        ? state.consentUpdates.length + ' update(s) received. Last at ' + Math.round(state.consentUpdates[state.consentUpdates.length - 1].ms) + 'ms.'
        : 'No consent update yet. User may not have interacted with the consent banner.'
    });

    // Rule 6: GCS consistency — network requests should match consent state
    var gcsIssues = [];
    state.networkHits.forEach(function (hit) {
      if (!hit.decoded.gcs || hit.decoded.gcs.error) return;
      var gcs = hit.decoded.gcs;
      var expected = state.currentConsent;
      if (expected.analytics_storage && gcs.analytics_storage) {
        if (expected.analytics_storage !== gcs.analytics_storage) {
          gcsIssues.push('analytics_storage: consent says "' + expected.analytics_storage + '" but GCS shows "' + gcs.analytics_storage + '" in request to ' + hit.host);
        }
      }
      if (expected.ad_storage && gcs.ad_storage) {
        if (expected.ad_storage !== gcs.ad_storage) {
          gcsIssues.push('ad_storage: consent says "' + expected.ad_storage + '" but GCS shows "' + gcs.ad_storage + '" in request to ' + hit.host);
        }
      }
    });
    rules.push({
      id: 'gcs-consistency',
      name: 'GCS Signal Consistency',
      description: 'The GCS parameter in network requests should match the declared consent state. Mismatches indicate race conditions or implementation bugs.',
      status: state.networkHits.length === 0 ? 'info' : (gcsIssues.length === 0 ? 'pass' : 'fail'),
      detail: state.networkHits.length === 0
        ? 'No Google network requests captured yet.'
        : gcsIssues.length === 0
          ? state.networkHits.length + ' request(s) checked. All GCS values match consent state.'
          : gcsIssues.join(' | ')
    });

    // Rule 7: No duplicate consent defaults
    var defaultCount = state.timeline.filter(function (e) { return e.type === 'consent_default'; }).length;
    rules.push({
      id: 'no-duplicate-defaults',
      name: 'No Duplicate Defaults',
      description: 'Only one consent("default") should exist. Multiple defaults can cause unpredictable behavior.',
      status: defaultCount <= 1 ? 'pass' : 'warn',
      detail: defaultCount <= 1
        ? (defaultCount === 0 ? 'No defaults found.' : 'Single consent default — correct.')
        : defaultCount + ' consent defaults found. Only the first one takes effect; the rest are ignored by Google but may indicate a misconfiguration.'
    });

    return rules;
  }

  // ─── Initialization ───────────────────────────────────────────
  interceptDataLayer();
  interceptGtag();
  interceptNetwork();

  // Delayed detection (DOM must be available)
  function runDetection() {
    state.cmp = detectCMP();
    state.tags = detectTags();
    state.validation = runValidation();
    state.ready = true;
    notify('ready', null);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(runDetection, 500); });
  } else {
    setTimeout(runDetection, 500);
  }

  // Re-run validation periodically
  setInterval(function () {
    state.cmp = detectCMP();
    state.tags = detectTags();
    state.validation = runValidation();
  }, 3000);

  // ─── Message Handler ──────────────────────────────────────────
  // Content script requests full state via postMessage
  window.addEventListener('message', function (event) {
    if (!event.data || event.data.source !== 'cf-debug-content') return;
    if (event.data.type === 'get-state') {
      window.postMessage({
        source: 'cf-debug-injected',
        type: 'full-state',
        requestId: event.data.requestId,
        payload: exportState()
      }, '*');
    }
  });

  function exportState() {
    return {
      timeline: state.timeline.slice(-300),
      consentDefaults: state.consentDefaults,
      consentUpdates: state.consentUpdates,
      currentConsent: safeClone(state.currentConsent),
      networkHits: state.networkHits.slice(-100),
      configCalls: state.configCalls,
      cmp: state.cmp,
      tags: state.tags,
      validation: state.validation,
      ready: state.ready
    };
  }
})();
