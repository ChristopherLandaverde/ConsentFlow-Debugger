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

  // atMs: when the event happened, for events reported after the fact (a resource entry
  // arrives when the load finishes). Such events are placed in time order.
  function addEvent(type, detail, source, atMs) {
    const late = typeof atMs === 'number';
    const evt = {
      id: eventId++,
      type: type,
      detail: safeClone(detail),
      source: source || 'unknown',
      ms: Math.round((late ? atMs : ts()) * 100) / 100,
      wall: late ? Date.now() - (ts() - atMs) : Date.now()
    };
    insertByMs(state.timeline, evt);
    notify('event', evt);
    return evt;
  }

  // Append, or insert before the first item with a later ms (stable for equal ms).
  function insertByMs(list, item) {
    var i = list.length;
    while (i > 0 && list[i - 1].ms > item.ms) i--;
    list.splice(i, 0, item);
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
    } else {
      return;
    }
    consentHistory.push({ ms: record.ms, consent: safeClone(state.currentConsent) });
  }

  // The merged consent after each consent command, so a request reported after the fact can
  // be judged by the consent at the moment it was requested (#36).
  const consentHistory = [];
  function consentAt(ms) {
    var at = {};
    for (var i = 0; i < consentHistory.length && consentHistory[i].ms <= ms; i++) at = consentHistory[i].consent;
    return safeClone(at);
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
             'googlesyndication.com', 'googleadservices.com', 'doubleclick.net', 'google.com/pagead',
             'google.com/ccm/', 'google.com/rmkt/', 'adservice.google.com/ddm/'],
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
    'Floodlight': 'google',
    'Facebook Pixel': 'facebook',
    'LinkedIn Insight': 'linkedin',
    'TikTok Pixel': 'tiktok',
    'Hotjar': 'hotjar',
    'Microsoft Clarity': 'clarity',
    'Pinterest Tag': 'pinterest',
    'Snapchat Pixel': 'snapchat'
  };

  // ─── Request → tag attribution (#28) ─────────────────────────
  // Google's tags share hosts (Google's CSP guide lists www.google.com and
  // pagead2.googlesyndication.com for Analytics, Ads and Floodlight alike), so a Google request
  // is tied to the tag that sent it by the tag ID it carries, then by an endpoint only one tag
  // uses. The table and its sources are in docs/detection.md.
  var GOOGLE_ID_TAGS = [
    [/^G-[A-Z0-9]+$/, 'Google Analytics 4'],
    [/^AW-[0-9]+$/, 'Google Ads'],
    [/^DC-[0-9]+$/, 'Floodlight'],
    [/^GTM-[A-Z0-9]+$/, 'Google Tag Manager']
  ];
  // Google Ads endpoints that carry the conversion ID (the number in AW-<id>) in the path.
  var ADS_ID_PATH = /\/(?:pagead\/(?:conversion|viewthroughconversion|1p-conversion|1p-user-list)|rmkt\/collect)\/([0-9]+)(?:\/|$)/;
  // Floodlight activity URLs (ad.doubleclick.net/activity;…, *.fls.doubleclick.net/activityi;…,
  // ade.googlesyndication.com/ddm/activity/…, adservice.google.com/ddm/fls/…) carry
  // src=<advertiser ID> as a ;-separated parameter in the path.
  var FLOODLIGHT_PATH = /\/(?:activityi?;|ddm\/)/;
  var FLOODLIGHT_SRC = /[;\/]src=([0-9]+)(?:;|$)/;

  function tagForGoogleId(id) {
    if (typeof id !== 'string') return null;
    for (var i = 0; i < GOOGLE_ID_TAGS.length; i++) {
      if (GOOGLE_ID_TAGS[i][0].test(id)) return GOOGLE_ID_TAGS[i][1];
    }
    return null;
  }

  // → { tag, tagId, by, loader, reason }. tag is a detectTags() name, or null when the
  // request can't be tied to one tag (reason says why); such requests are shown, not judged.
  function attributeRequest(url, vendor) {
    function to(tag, tagId, by, loader) {
      return { tag: tag, tagId: tagId || null, by: by, loader: !!loader, reason: null };
    }
    function none(reason) { return { tag: null, tagId: null, by: null, loader: false, reason: reason }; }

    if (vendor !== 'google') {
      var names = Object.keys(TAG_VENDOR_MAP);
      for (var n = 0; n < names.length; n++) {
        if (TAG_VENDOR_MAP[names[n]] === vendor) return to(names[n], null, 'host');
      }
      return none('No tag is known for this vendor.');
    }

    var path = url.pathname;
    var params = url.searchParams;
    // Loaders: gtm.js (a GTM container) and gtag/js. Loading a script is not measurement, so
    // these are attributed to their tag but never judged.
    if (/\/gtm\.js$|\/gtag\/js$/.test(path)) {
      var loaded = params.get('id');
      var loaderTag = tagForGoogleId(loaded);
      return loaderTag ? to(loaderTag, loaded, 'loader', true) : none('A Google tag loader with no recognized tag ID.');
    }
    // Other googletagmanager.com requests are Google tag scripts or diagnostics, not one tag's measurement.
    if (/(^|\.)googletagmanager\.com$/.test(url.hostname)) {
      return none('A Google tag script or diagnostics request, not measurement by one tag.');
    }
    // 1. The tag ID the request carries (tid=G-…, tid=AW-…, tid=DC-…).
    var tid = params.get('tid');
    var tidTag = tagForGoogleId(tid);
    if (tidTag && tidTag !== 'Google Tag Manager') return to(tidTag, tid, 'tid');
    if (tid) return none('Carries tag ID ' + tid + ', which does not name one GA4, Google Ads or Floodlight tag.');
    // 2. Endpoints only one tag uses, with the ID in the path.
    var ads = ADS_ID_PATH.exec(path);
    if (ads) return to('Google Ads', 'AW-' + ads[1], 'path');
    if (FLOODLIGHT_PATH.test(path)) {
      var src = FLOODLIGHT_SRC.exec(path);
      if (src) return to('Floodlight', 'DC-' + src[1], 'path');
    }
    // 3. GA4's collection paths, and hosts only Google Analytics uses.
    if (/\/g\/collect$/.test(path) || /(^|\.)(google-analytics\.com|analytics\.google\.com)$/.test(url.hostname)) {
      return to('Google Analytics 4', null, 'path');
    }
    return none('Sent to an endpoint several Google tags share, with no tag ID.');
  }

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

      // The requests this tag sent (#28). Loader requests and requests that could not be
      // attributed to one tag are never judged.
      var vendorHits = [];
      for (var j = 0; j < state.networkHits.length; j++) {
        var hitJ = state.networkHits[j];
        if (hitJ.tag === tag.name && !hitJ.loader) vendorHits.push(hitJ);
      }

      var hasRequests = vendorHits.length > 0;
      var consentTypes = tag.consentTypes || [];
      var verdict;

      // Requests sent while a required consent type was denied at that moment: cookieless
      // pings (advanced Consent Mode, #34) and violations (everything else).
      var preConsentCount = 0;
      var firstPreConsentMs = null;
      var deniedTypes = [];
      var violationReasons = [];
      var cookielessCount = 0;
      var firstCookielessMs = null;
      var firstCookielessGcs = null;
      var cookielessTypes = [];
      var hosts = [];
      for (var h = 0; h < vendorHits.length; h++) {
        var hit = vendorHits[h];
        if (hosts.indexOf(hit.host) === -1) hosts.push(hit.host);
        var judged = judgeRequest(hit, tag.name, consentTypes);
        hit.judgement = judged;
        if (!judged) continue;
        if (judged.result === 'cookieless') {
          cookielessCount++;
          if (firstCookielessMs === null) {
            firstCookielessMs = Math.round(hit.ms);
            firstCookielessGcs = hit.gcs || null;
          }
          addAll(cookielessTypes, judged.types);
          continue;
        }
        preConsentCount++;
        if (firstPreConsentMs === null) firstPreConsentMs = Math.round(hit.ms);
        addAll(deniedTypes, judged.types);
        addAll(violationReasons, [judged.reason]);
      }

      if (!hasConsentMode) {
        verdict = 'no_consent_mode';
      } else if (tag.type === 'tag_manager') {
        // A container needs no consent of its own; the tags in it are judged by their requests.
        verdict = 'container';
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
        } else if (cookielessCount > 0) {
          verdict = 'cookieless';
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
        violationReasons: violationReasons,
        cookielessCount: cookielessCount,
        firstCookielessMs: firstCookielessMs,
        firstCookielessGcs: firstCookielessGcs,
        cookielessTypes: cookielessTypes,
        hosts: hosts,
        verdict: verdict
      });
    }

    return results;
  }

  function addAll(list, items) {
    for (var i = 0; i < items.length; i++) if (list.indexOf(items[i]) === -1) list.push(items[i]);
  }

  // ─── Cookieless pings (advanced Consent Mode, #34) ──────────
  // "While consent is denied, the Google tags send cookieless pings" (Google Ads Help
  // 10000067). A request sent while a consent type its tag needs was denied is a cookieless
  // ping when (1) a consent-aware Google tag sent it, (2) the storage type that tag needs was
  // denied, (3) the request's own gcs/gcd says so, (4) its own signals claim no denied type as
  // granted, and (5) it carries no advertising cookie ID. Anything else is a violation. The
  // rule and its sources are in docs/detection.md.
  var CONSENT_MODE_TAGS = ['Google Analytics 4', 'Google Ads', 'Floodlight'];
  var STORAGE_TYPES = ['ad_storage', 'analytics_storage'];
  // Parameters that carry Google's advertising cookie values: auid / auiddc (_gcl_au) and
  // gclaw (_gcl_aw). Measured with real gtag.js: sent only while ad_storage is granted.
  var COOKIE_ID_PARAMS = ['auid', 'auiddc', 'gclaw'];

  // → null when nothing the tag needs was denied, else { result: 'cookieless' | 'violation',
  // types: denied types, reason: null | no_consent_mode | no_signal | claimed_granted |
  // storage_granted | cookie_id }.
  function judgeRequest(hit, tagName, consentTypes) {
    var denied = deniedAtRequest(hit, consentTypes);
    if (!denied.length) return null;
    function violation(reason) { return { result: 'violation', types: denied, reason: reason }; }
    if (CONSENT_MODE_TAGS.indexOf(tagName) === -1) return violation('no_consent_mode');
    var own = hit.requestConsent || {};
    var storage = consentTypes.filter(function (t) { return STORAGE_TYPES.indexOf(t) !== -1; });
    var storageDenied = storage.length > 0 && storage.every(function (t) { return denied.indexOf(t) !== -1; });
    if (!storageDenied) return violation('storage_granted');
    if (!storage.every(function (t) { return own[t] === 'denied'; })) {
      var claimedStorage = storage.some(function (t) { return own[t] === 'granted'; });
      return violation(claimedStorage ? 'claimed_granted' : 'no_signal');
    }
    if (denied.some(function (t) { return own[t] === 'granted'; })) return violation('claimed_granted');
    if (hit.cookieIds && hit.cookieIds.length) return violation('cookie_id');
    return { result: 'cookieless', types: denied, reason: null };
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

  // Normalise the request's own consent signals to granted/denied: GCD first, then GCS. A GCD
  // letter ConsentFlow does not know (Google does not document them; real gtag.js sends r for a
  // type granted by an update) falls back to GCS for that type, and the letter is kept in
  // unknown so the Requests view can show it (#32). GCS only carries ad_storage and
  // analytics_storage, so an unknown letter for the other two stays unknown.
  function requestConsentFrom(decoded) {
    var out = {};
    var unknown = {};
    var gcd = decoded.gcd && !decoded.gcd.error ? decoded.gcd : null;
    var gcs = decoded.gcs && !decoded.gcs.error ? decoded.gcs : null;
    ['ad_storage', 'analytics_storage', 'ad_user_data', 'ad_personalization'].forEach(function (t) {
      var v = gcd ? gcd[t] : undefined;
      if (typeof v === 'string' && v.indexOf('unknown:') === 0) {
        unknown[t] = v.substring(8);
        v = undefined;
      }
      if (typeof v !== 'string') v = gcs ? gcs[t] : undefined;
      if (typeof v !== 'string') return;
      if (v.indexOf('granted') === 0) out[t] = 'granted';
      else if (v.indexOf('denied') === 0) out[t] = 'denied';
    });
    return { consent: out, unknown: unknown };
  }

  function isGoogleAnalyticsUrl(urlStr) {
    try {
      const url = new URL(urlStr, window.location.origin);
      return GOOGLE_DOMAINS.some(d => url.hostname.includes(d) || url.pathname.includes(d));
    } catch { return false; }
  }

  // Parameters Floodlight sends as ;key=value in the path (…/activity;src=…;gcs=G101;…), with
  // the query string winning over the path for the same name (#36).
  function requestParams(url) {
    var fromPath = {};
    var re = /[;\/]([A-Za-z_~][\w~.-]*)=([^;\/]*)/g;
    var path = url.pathname;
    var cut = path.indexOf(';');
    var slash = cut === -1 ? -1 : path.lastIndexOf('/', cut);
    var m;
    // Only the segment holding the first ; carries parameters (…/activity;… or …/ddm/activity/src=…;…).
    if (cut !== -1) {
      var segment = path.substring(slash);
      while ((m = re.exec(segment)) !== null) {
        if (!(m[1] in fromPath)) {
          try { fromPath[m[1]] = decodeURIComponent(m[2]); } catch (e) { fromPath[m[1]] = m[2]; }
        }
      }
    }
    return {
      get: function (k) {
        var q = url.searchParams.get(k);
        if (q !== null) return q;
        return k in fromPath ? fromPath[k] : null;
      },
      has: function (k) { return url.searchParams.has(k) || k in fromPath; }
    };
  }

  // atMs: when the request started, for requests reported after the fact (Resource Timing).
  function captureNetworkHit(urlStr, method, atMs) {
    var vendor = identifyVendor(urlStr);
    if (!vendor) return;
    try {
      const url = new URL(urlStr, window.location.origin);
      const params = requestParams(url);
      const late = typeof atMs === 'number';
      const semi = url.pathname.indexOf(';');
      const hit = {
        // Path only, up to the first ; (Floodlight puts cookie IDs and the page URL after it).
        url: semi === -1 ? url.pathname : url.pathname.substring(0, semi),
        host: url.hostname,
        method: method,
        vendor: vendor,
        ms: late ? atMs : ts(),
        wall: late ? Date.now() - (ts() - atMs) : Date.now(),
        decoded: {},
        // Consent on the page at the moment of this request
        consentAtRequest: late ? consentAt(atMs) : safeClone(state.currentConsent)
      };
      var attributed = attributeRequest(url, vendor);
      hit.tag = attributed.tag;
      hit.tagId = attributed.tagId;
      hit.attributedBy = attributed.by;
      if (attributed.loader) hit.loader = true;
      if (!attributed.tag) hit.unattributedReason = attributed.reason;

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
        // Names only: the values are cookie identifiers and are never recorded.
        var cookieIds = COOKIE_ID_PARAMS.filter(function (k) { return params.has(k); });
        if (cookieIds.length) hit.cookieIds = cookieIds;
        var own = requestConsentFrom(hit.decoded);
        hit.requestConsent = own.consent;
        if (Object.keys(own.unknown).length) hit.gcdUnknown = own.unknown;
      }

      // Facebook param extraction
      if (vendor === 'facebook') {
        hit.ev = params.get('ev');   // Facebook event name
      }

      // TikTok param extraction
      if (vendor === 'tiktok') {
        hit.event = params.get('event');   // TikTok event name
      }

      insertByMs(state.networkHits, hit);
      addEvent('network_hit', hit, 'network', late ? atMs : undefined);
    } catch { /* swallow malformed URLs */ }
  }

  // Image and iframe requests (Floodlight activity tags, some Google Ads hits) are not made
  // through fetch, XHR or sendBeacon. Resource Timing lists them, with no extra permission, once
  // they finish loading; startTime says when they were requested (#36). Only Google hosts, and
  // not googletagmanager.com, whose images are tag diagnostics, not measurement.
  var RESOURCE_TYPES = ['img', 'iframe'];
  function observeResources() {
    if (typeof window.PerformanceObserver !== 'function') return;
    try {
      var observer = new window.PerformanceObserver(function (list) {
        var entries = list.getEntries();
        for (var i = 0; i < entries.length; i++) {
          var e = entries[i];
          if (RESOURCE_TYPES.indexOf(e.initiatorType) === -1) continue;
          var at = e.startTime - state.t0;
          if (!(at >= 0)) continue; // requested before capture started
          if (identifyVendor(e.name) !== 'google') continue;
          if (/^https?:\/\/([^\/]*\.)?googletagmanager\.com\//.test(e.name)) continue;
          captureNetworkHit(e.name, e.initiatorType, at);
        }
      });
      observer.observe({ type: 'resource', buffered: true });
    } catch (e) { /* Resource Timing unavailable: fetch/XHR/beacon capture still works */ }
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
    // Format: G1<ad_storage><analytics_storage> where 1=granted, 0=denied.
    // Example: G111 = both granted, G100 = both denied, G101 = analytics granted, ads denied.
    // Google's sGTM transformations guide treats G100 and G110 as "analytics_storage denied"
    // (https://developers.google.com/tag-platform/tag-manager/server-side/transformations).
    if (!gcs || !gcs.startsWith('G1')) return { raw: gcs, error: 'unexpected format' };
    const chars = gcs.substring(2);
    return {
      raw: gcs,
      analytics_storage: chars[1] === '1' ? 'granted' : 'denied',
      ad_storage: chars[0] === '1' ? 'granted' : 'denied'
    };
  }

  function decodeGCD(gcd) {
    // Format: "1<seg1><seg2><seg3><seg4>5<seg5>"
    // Each segment is 2 chars: <source_digit><state_char>
    // Source: 1=default, 3=update, 5=not set
    // State: l=unset, p=denied(default), t=granted(default),
    //        e=granted(updated), q=denied(updated)
    // Google does not document these letters. Others (such as r, seen from real gtag.js)
    // decode as unknown:<letter> rather than a guessed meaning (#26).
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
  // True when a Google tag or container registered an ID matching pattern as a key of
  // window.google_tag_manager.
  function hasGoogleTagId(pattern) {
    var gtm = window.google_tag_manager;
    if (!gtm || typeof gtm !== 'object') return false;
    return Object.keys(gtm).some(function (k) { return pattern.test(k); });
  }

  function detectTags() {
    const found = [];
    function check(name, type, consentTypes, test) {
      try {
        if (test()) found.push({ name: name, type: type, consentTypes: consentTypes });
      } catch { /* ignore */ }
    }

    // A tag that sent requests attributed to it is on the page, even when its loader was not
    // seen (a GTM container sends GA4, Ads and Floodlight hits without loading gtag.js).
    function sentRequests(name) {
      return state.networkHits.some(function (h) { return h.tag === name && !h.loader; });
    }

    check('Google Analytics 4', 'analytics', ['analytics_storage'], function () {
      return sentRequests('Google Analytics 4') ||
        !!document.querySelector('script[src*="gtag/js"]') ||
        !!document.querySelector('script[src*="googletagmanager.com/gtag"]');
    });
    // gtag.js defines window.google_tag_manager too, keyed by the IDs it loaded (G-, AW-, DC-),
    // so only a GTM- key means a GTM container ran. Before it has run, a loader script with
    // id=GTM- (any host or path: server-side tagging and the tag gateway serve it first-party).
    // The object is undocumented; see docs/research/gtag-vs-gtm-detection.md (#21).
    // A container has no consent type of its own: loading gtm.js collects nothing, and each tag
    // in it is judged by the requests it sends (#28).
    check('Google Tag Manager', 'tag_manager', [], function () {
      return hasGoogleTagId(/^GTM-[A-Z0-9]+$/) ||
        !!document.querySelector('script[src*="id=GTM-"]');
    });
    check('Google Ads', 'advertising', ['ad_storage', 'ad_user_data', 'ad_personalization'], function () {
      return sentRequests('Google Ads') || hasGoogleTagId(/^AW-[A-Z0-9]+$/) ||
        !!document.querySelector('script[src*="id=AW-"]') ||
        !!document.querySelector('script[src*="googleadservices.com"]') ||
        !!document.querySelector('script[src*="googlesyndication.com"]');
    });
    check('Floodlight', 'advertising', ['ad_storage', 'ad_user_data', 'ad_personalization'], function () {
      return sentRequests('Floodlight') || hasGoogleTagId(/^DC-[A-Z0-9]+$/) ||
        !!document.querySelector('script[src*="id=DC-"]');
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
  observeResources();

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

  // Re-run detection and the rules. Done periodically, and on every get-state so a reader
  // never gets results from before the page's latest consent commands and requests (#22).
  function refreshChecks() {
    state.cmp = detectCMP();
    state.tags = detectTags();
    state.validation = runValidation();
  }

  setInterval(refreshChecks, 3000);

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
    if (state.ready) refreshChecks();
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
