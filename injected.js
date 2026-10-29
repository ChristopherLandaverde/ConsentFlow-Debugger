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

    // Each interceptor forwards to the push it wrapped, permanently. GTM and gtag.js replace
    // push with a function that calls the push they found (our interceptor), so re-pointing an
    // existing interceptor at the new push would make the two call each other forever.
    // An entry is recorded by the outermost interceptor that sees it; entries already in flight
    // are skipped further down the chain, while new entries pushed meanwhile are still recorded.
    const inFlight = new Set();
    function intercept(target) {
      return function () {
        // Decide what outer interceptors already carry before claiming anything, so an
        // object passed twice in this one call is recorded twice, like the array stores it.
        const carriedByOuter = [];
        for (let i = 0; i < arguments.length; i++) carriedByOuter.push(inFlight.has(arguments[i]));
        const claimed = [];
        for (let i = 0; i < arguments.length; i++) {
          const entry = arguments[i];
          if (carriedByOuter[i]) continue;
          if (entry && typeof entry === 'object' && !inFlight.has(entry)) {
            inFlight.add(entry);
            claimed.push(entry);
          }
          if (gtagDepth > 0) pushedDuringGtag = true;
          processDataLayerEntry(entry, 'dataLayer.push');
        }
        try {
          return target.apply(dl, arguments);
        } finally {
          for (let i = 0; i < claimed.length; i++) inFlight.delete(claimed[i]);
        }
      };
    }
    const wrappedPush = intercept(dl.push.bind(dl));
    dl.push = wrappedPush;

    // When GTM or gtag.js replaces .push, intercept the new function too
    try {
      let currentPushFn = wrappedPush;
      Object.defineProperty(dl, 'push', {
        get: function () { return currentPushFn; },
        set: function (newPush) {
          currentPushFn = intercept(newPush);
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
  // A gtag call normally reaches dataLayer (the standard snippet pushes its arguments), where
  // the push interceptor records it. Record it from gtag directly only when it didn't, so a
  // custom gtag is still captured but a standard one isn't recorded twice.
  let gtagDepth = 0;
  let pushedDuringGtag = false;
  function wrapGtag(fn) {
    return function () {
      const outer = pushedDuringGtag;
      pushedDuringGtag = false;
      gtagDepth++;
      try {
        return fn.apply(this, arguments);
      } finally {
        gtagDepth--;
        if (!pushedDuringGtag) captureGtagCall(arguments);
        pushedDuringGtag = outer || pushedDuringGtag;
      }
    };
  }

  function interceptGtag() {
    if (typeof window.gtag === 'function') {
      // gtag already exists — wrap it
      window.gtag = wrapGtag(window.gtag);
    } else {
      // gtag doesn't exist yet — create a trap that records calls
      // When GTM creates the real gtag, it replays through dataLayer,
      // which we already intercept, including calls made before GTM loads.
      window.gtag = function () {
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
            currentGtag = wrapGtag(fn);
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

  // Multi-vendor domain fragments for broad network capture
  var VENDOR_DOMAINS = {
    google: ['google-analytics.com', 'analytics.google.com', 'googletagmanager.com',
             'googlesyndication.com', 'googleadservices.com', 'doubleclick.net', 'google.com/pagead'],
    facebook: ['facebook.net', 'facebook.com/tr', 'fbcdn.net', 'meta.com'],
    linkedin: ['snap.licdn.com', 'linkedin.com/li/'],
    tiktok: ['analytics.tiktok.com', 'tiktokapi.com'],
    hotjar: ['hotjar.com', 'hotjar.io'],
    clarity: ['clarity.ms'],
    pinterest: ['ct.pinterest.com', 'pinimg.com/ct'],
    snapchat: ['sc-static.net', 'tr.snapchat.com']
  };

  // Map tag names from detectTags() to their vendor key
  var TAG_VENDOR_MAP = {
    'Google Analytics 4': 'google',
    'Google Tag Manager': 'google',
    'Google Ads': 'google',
    'Facebook Pixel': 'facebook',
    'LinkedIn Insight': 'linkedin',
    'TikTok Pixel': 'tiktok',
    'Hotjar': 'hotjar',
    'Microsoft Clarity': 'clarity',
    'Pinterest Tag': 'pinterest',
    'Snapchat Pixel': 'snapchat'
  };

  // Reverse lookup: URL string → vendor key
  function identifyVendor(urlStr) {
    try {
      var url = new URL(urlStr, window.location.origin);
      var full = url.hostname + url.pathname;
      var vendors = Object.keys(VENDOR_DOMAINS);
      for (var i = 0; i < vendors.length; i++) {
        var fragments = VENDOR_DOMAINS[vendors[i]];
        for (var j = 0; j < fragments.length; j++) {
          if (full.indexOf(fragments[j]) !== -1) return vendors[i];
        }
      }
    } catch { /* ignore */ }
    return null;
  }

  // Correlate tags × consent state × actual network requests → verdicts
  function computeTagImpact() {
    var tags = state.tags || [];
    var consent = state.currentConsent || {};
    var hasConsentMode = !!state.consentDefaults;
    var results = [];

    for (var i = 0; i < tags.length; i++) {
      var tag = tags[i];
      var vendor = TAG_VENDOR_MAP[tag.name] || null;

      // Count network requests for this vendor
      var vendorHits = [];
      if (vendor) {
        for (var j = 0; j < state.networkHits.length; j++) {
          if (state.networkHits[j].vendor === vendor) vendorHits.push(state.networkHits[j]);
        }
      }

      var hasRequests = vendorHits.length > 0;
      var consentTypes = tag.consentTypes || [];
      var verdict;

      // Requests sent while a required consent type was denied at that moment
      var preConsentCount = 0;
      var firstPreConsentMs = null;
      var deniedTypes = [];
      var hosts = [];
      for (var h = 0; h < vendorHits.length; h++) {
        var denied = deniedAtRequest(vendorHits[h], consentTypes);
        if (hosts.indexOf(vendorHits[h].host) === -1) hosts.push(vendorHits[h].host);
        if (denied.length === 0) continue;
        preConsentCount++;
        if (firstPreConsentMs === null) firstPreConsentMs = Math.round(vendorHits[h].ms);
        for (var d = 0; d < denied.length; d++) {
          if (deniedTypes.indexOf(denied[d]) === -1) deniedTypes.push(denied[d]);
        }
      }

      if (!hasConsentMode) {
        verdict = 'no_consent_mode';
      } else {
        // Is any required consent type denied now?
        var anyDenied = false;
        for (var k = 0; k < consentTypes.length; k++) {
          if (consent[consentTypes[k]] === 'denied') {
            anyDenied = true;
            break;
          }
        }

        if (preConsentCount > 0) {
          verdict = 'violation';
        } else if (anyDenied) {
          verdict = 'blocked';
        } else if (hasRequests) {
          verdict = 'firing';
        } else {
          verdict = 'idle';
        }
      }

      results.push({
        name: tag.name,
        type: tag.type,
        vendor: vendor,
        consentTypes: tag.consentTypes,
        requestCount: vendorHits.length,
        preConsentCount: preConsentCount,
        firstPreConsentMs: firstPreConsentMs,
        deniedTypes: deniedTypes,
        hosts: hosts,
        verdict: verdict
      });
    }

    return results;
  }

  // Consent types that were denied when this request was sent. The captured consent
  // timeline (snapshot taken at capture) wins; the request's own GCS/GCD fills in types
  // the timeline had not set yet.
  function deniedAtRequest(hit, consentTypes) {
    var timeline = hit.consentAtRequest || {};
    var own = hit.requestConsent || {};
    var denied = [];
    for (var i = 0; i < consentTypes.length; i++) {
      var t = consentTypes[i];
      var value = (t in timeline) ? timeline[t] : own[t];
      if (value === 'denied') denied.push(t);
    }
    return denied;
  }

  // Normalise the request's own consent signals (GCD, then GCS) to granted/denied.
  function requestConsentFrom(decoded) {
    var out = {};
    var gcd = decoded.gcd && !decoded.gcd.error ? decoded.gcd : null;
    var gcs = decoded.gcs && !decoded.gcs.error ? decoded.gcs : null;
    ['ad_storage', 'analytics_storage', 'ad_user_data', 'ad_personalization'].forEach(function (t) {
      var v = gcd && typeof gcd[t] === 'string' ? gcd[t] : (gcs ? gcs[t] : undefined);
      if (typeof v !== 'string') return;
      if (v.indexOf('granted') === 0) out[t] = 'granted';
      else if (v.indexOf('denied') === 0) out[t] = 'denied';
    });
    return out;
  }

  function isGoogleAnalyticsUrl(urlStr) {
    try {
      const url = new URL(urlStr, window.location.origin);
      return GOOGLE_DOMAINS.some(d => url.hostname.includes(d) || url.pathname.includes(d));
    } catch { return false; }
  }

  function captureNetworkHit(urlStr, method) {
    var vendor = identifyVendor(urlStr);
    if (!vendor) return;
    try {
      const url = new URL(urlStr, window.location.origin);
      const params = url.searchParams;
      const hit = {
        url: url.pathname,
        host: url.hostname,
        method: method,
        vendor: vendor,
        ms: ts(),
        wall: Date.now(),
        decoded: {},
        // Consent as captured from the timeline at the moment of this request
        consentAtRequest: safeClone(state.currentConsent)
      };

      // Google-specific param decoding
      if (vendor === 'google') {
        hit.gcs = params.get('gcs');
        hit.gcd = params.get('gcd');
        hit.npa = params.get('npa');
        hit.tid = params.get('tid') || params.get('id');
        hit.en = params.get('en');   // event name in GA4
        if (hit.gcs) hit.decoded.gcs = decodeGCS(hit.gcs);
        if (hit.gcd) hit.decoded.gcd = decodeGCD(hit.gcd);
        if (hit.npa) hit.decoded.npa = hit.npa === '1' ? 'non-personalized (ad_personalization denied)' : 'personalized';
        hit.requestConsent = requestConsentFrom(hit.decoded);
      }

      // Facebook param extraction
      if (vendor === 'facebook') {
        hit.ev = params.get('ev');   // Facebook event name
      }

      // TikTok param extraction
      if (vendor === 'tiktok') {
        hit.event = params.get('event');   // TikTok event name
      }

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
  // Each rule returns status pass | fail | warn | not_checked. A rule that lacked the data
  // it needs is not_checked and names what it needs (needs), so the popup never reports a
  // check that did not run as clean. data carries the facts the finding copy is built from.
  function runValidation() {
    const rules = [];
    var hasDefault = !!state.consentDefaults;
    var defaultMs = hasDefault ? state.consentDefaults.ms : Infinity;
    var defaultSettings = hasDefault ? state.consentDefaults.settings : {};

    function rule(r) {
      if (r.status !== 'not_checked') delete r.needs;
      rules.push(r);
    }

    // Rule 1: consent default must exist
    rule({
      id: 'consent-default-exists',
      name: 'Consent Default Exists',
      description: 'A gtag("consent", "default", {...}) command must be present. Without it, all consent types default to "granted" and tags fire without restriction.',
      status: hasDefault ? 'pass' : 'fail',
      detail: hasDefault
        ? 'Found at ' + Math.round(defaultMs) + 'ms with: ' + Object.keys(defaultSettings).join(', ')
        : 'No consent default found. All tags will fire as if consent is granted.',
      data: {
        defaultMs: hasDefault ? Math.round(defaultMs) : null,
        types: Object.keys(defaultSettings).filter(function (k) { return k !== 'wait_for_update' && k !== 'region'; })
      }
    });

    // Rule 2: consent default must come before any config call
    var firstConfig = state.configCalls.length > 0 ? state.configCalls[0] : null;
    var firstConfigMs = firstConfig ? firstConfig.ms : Infinity;
    var configBeforeDefault = !!firstConfig && firstConfigMs < defaultMs;
    rule({
      id: 'consent-default-before-config',
      name: 'Default Before Config',
      description: 'consent("default") must appear before any gtag("config"). Otherwise tags fire in the gap with implicit "granted" consent.',
      status: !firstConfig ? 'not_checked' : (configBeforeDefault ? 'fail' : 'pass'),
      needs: 'config_call',
      detail: configBeforeDefault
        ? 'RACE CONDITION: gtag("config", "' + firstConfig.id + '") fired at ' + Math.round(firstConfigMs) + 'ms but consent default was at ' + Math.round(defaultMs) + 'ms (' + Math.round(defaultMs - firstConfigMs) + 'ms late).'
        : !firstConfig
          ? 'No config calls detected yet.'
          : 'Consent default (' + Math.round(defaultMs) + 'ms) correctly precedes first config (' + Math.round(firstConfigMs) + 'ms).',
      data: {
        configId: firstConfig ? firstConfig.id : null,
        configMs: firstConfig ? Math.round(firstConfigMs) : null,
        defaultMs: hasDefault ? Math.round(defaultMs) : null,
        lateMs: configBeforeDefault && hasDefault ? Math.round(defaultMs - firstConfigMs) : null,
        hasDefault: hasDefault
      }
    });

    // Rule 3: Consent Mode v2 types must be present
    var v2Types = ['ad_user_data', 'ad_personalization'];
    var missingV2 = v2Types.filter(function (t) { return !(t in defaultSettings); });
    rule({
      id: 'v2-types-present',
      name: 'Consent Mode v2 Types',
      description: 'ad_user_data and ad_personalization are required for Consent Mode v2. Google Ads conversions will not attribute without them.',
      status: !hasDefault ? 'not_checked' : (missingV2.length === 0 ? 'pass' : 'warn'),
      needs: 'consent_default',
      detail: !hasDefault
        ? 'No consent default to check.'
        : missingV2.length === 0
          ? 'Both ad_user_data and ad_personalization are declared.'
          : 'Missing from consent default: ' + missingV2.join(', ') + '. Add these for v2 compliance.',
      data: { missing: hasDefault ? missingV2 : [] }
    });

    // Rule 4: wait_for_update should be set when a CMP is present
    var waitForUpdate = hasDefault && defaultSettings.wait_for_update ? defaultSettings.wait_for_update : null;
    var cmpDetected = !!(state.cmp && state.cmp.detected);
    rule({
      id: 'wait-for-update',
      name: 'wait_for_update Configured',
      description: 'When a CMP is present, wait_for_update (in ms) should be set in consent defaults so GTM waits for the CMP to load before using default consent values.',
      status: !hasDefault || !cmpDetected ? 'not_checked' : (waitForUpdate ? 'pass' : 'warn'),
      needs: !hasDefault ? 'consent_default' : 'cmp',
      detail: !hasDefault ? 'No consent default to check.'
        : !cmpDetected ? 'No CMP detected; wait_for_update not applicable.'
          : waitForUpdate ? 'wait_for_update is set to ' + waitForUpdate + 'ms.'
            : 'CMP (' + state.cmp.name + ') detected but wait_for_update is missing. Tags may fire with default consent before the CMP loads.',
      data: { cmp: cmpDetected ? state.cmp.name : null, waitForUpdate: waitForUpdate }
    });

    // Rule 5: consent update received
    var lastUpdate = state.consentUpdates.length > 0 ? state.consentUpdates[state.consentUpdates.length - 1] : null;
    rule({
      id: 'consent-update-received',
      name: 'Consent Update Received',
      description: 'After the user interacts with the consent banner, a consent("update") should fire to change from default to user-chosen values.',
      status: lastUpdate ? 'pass' : 'not_checked',
      needs: 'consent_update',
      detail: lastUpdate
        ? state.consentUpdates.length + ' update(s) received. Last at ' + Math.round(lastUpdate.ms) + 'ms.'
        : 'No consent update yet. User may not have interacted with the consent banner.',
      data: { count: state.consentUpdates.length, lastMs: lastUpdate ? Math.round(lastUpdate.ms) : null }
    });

    // Rule 6: GCS consistency — each request should match consent as it was when sent.
    // Only requests that carry a decodable gcs value can be checked.
    var gcsIssues = [];
    var gcsIssueData = [];
    var gcsChecked = 0;
    state.networkHits.forEach(function (hit) {
      if (!hit.decoded || !hit.decoded.gcs || hit.decoded.gcs.error) return;
      gcsChecked++;
      var gcs = hit.decoded.gcs;
      var expected = hit.consentAtRequest || {};
      ['analytics_storage', 'ad_storage'].forEach(function (t) {
        if (expected[t] && gcs[t] && expected[t] !== gcs[t]) {
          gcsIssues.push(t + ': consent was "' + expected[t] + '" when sent but GCS shows "' + gcs[t] + '" in request to ' + hit.host + ' at ' + Math.round(hit.ms) + 'ms');
          gcsIssueData.push({ type: t, expected: expected[t], actual: gcs[t], host: hit.host, ms: Math.round(hit.ms) });
        }
      });
    });
    rule({
      id: 'gcs-consistency',
      name: 'GCS Signal Consistency',
      description: 'The GCS parameter in each network request should match the consent state at the moment the request was sent. Mismatches indicate race conditions or implementation bugs.',
      status: gcsChecked === 0 ? 'not_checked' : (gcsIssues.length === 0 ? 'pass' : 'fail'),
      needs: 'google_request',
      detail: gcsChecked === 0
        ? 'No Google network requests captured yet.'
        : gcsIssues.length === 0
          ? gcsChecked + ' request(s) checked. All GCS values match the consent state when they were sent.'
          : gcsIssues.join(' | '),
      data: { checked: gcsChecked, issues: gcsIssueData }
    });

    // Rule 7: No duplicate consent defaults
    var defaultCount = state.timeline.filter(function (e) { return e.type === 'consent_default'; }).length;
    rule({
      id: 'no-duplicate-defaults',
      name: 'No Duplicate Defaults',
      description: 'Only one consent("default") should exist. Multiple defaults can cause unpredictable behavior.',
      status: defaultCount === 0 ? 'not_checked' : (defaultCount === 1 ? 'pass' : 'warn'),
      needs: 'consent_default',
      detail: defaultCount <= 1
        ? (defaultCount === 0 ? 'No defaults found.' : 'Single consent default — correct.')
        : defaultCount + ' consent defaults found. Only the first one takes effect; the rest are ignored by Google but may indicate a misconfiguration.',
      data: { count: defaultCount, firstMs: hasDefault ? Math.round(defaultMs) : null }
    });

    // Rule 8: consent default must come before any consent update.
    // Judged by capture order (not timestamps), so same-millisecond commands are ordered correctly.
    var firstDefaultEvt = null;
    var firstUpdateEvt = null;
    var updateCount = 0;
    state.timeline.forEach(function (e) {
      if (e.type === 'consent_default' && !firstDefaultEvt) firstDefaultEvt = e;
      if (e.type === 'consent_update') {
        updateCount++;
        if (!firstUpdateEvt) firstUpdateEvt = e;
      }
    });
    var updateFirst = !!firstUpdateEvt && (!firstDefaultEvt || firstUpdateEvt.id < firstDefaultEvt.id);
    rule({
      id: 'default-before-update',
      name: 'Default Before Update',
      description: 'consent("default") must appear before any consent("update"). A default processed after an update can override the choice the user already made, and tags that fire before the default run with implicit "granted" consent.',
      status: !firstUpdateEvt ? 'not_checked' : (updateFirst ? 'fail' : 'pass'),
      needs: 'consent_update',
      detail: !firstUpdateEvt
        ? 'No consent update to check.'
        : !firstDefaultEvt
          ? updateCount + ' consent update(s) captured, the first at ' + Math.round(firstUpdateEvt.ms) + 'ms, but no consent default was ever set. Until the update, every consent type was implicitly granted.'
          : updateFirst
            ? 'RACE CONDITION: consent update at ' + Math.round(firstUpdateEvt.ms) + 'ms arrived before the consent default at ' + Math.round(firstDefaultEvt.ms) + 'ms (' + Math.round(firstDefaultEvt.ms - firstUpdateEvt.ms) + 'ms early). The default can override the choice the update recorded.'
            : 'Consent default (' + Math.round(firstDefaultEvt.ms) + 'ms) correctly precedes first update (' + Math.round(firstUpdateEvt.ms) + 'ms).',
      data: {
        updateCount: updateCount,
        updateMs: firstUpdateEvt ? Math.round(firstUpdateEvt.ms) : null,
        defaultMs: firstDefaultEvt ? Math.round(firstDefaultEvt.ms) : null,
        earlyMs: updateFirst && firstDefaultEvt ? Math.round(firstDefaultEvt.ms - firstUpdateEvt.ms) : null,
        hasDefault: !!firstDefaultEvt
      }
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
      networkHits: state.networkHits.slice(-200),
      configCalls: state.configCalls,
      cmp: state.cmp,
      tags: state.tags,
      validation: state.validation,
      tagImpact: computeTagImpact(),
      ready: state.ready
    };
  }
})();
