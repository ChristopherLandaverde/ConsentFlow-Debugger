// Network capture in injected.js: which requests are recorded, and how the gcs, gcd and npa
// consent parameters in Google requests are decoded.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { loadPage } from "./helpers/page.mjs";

const GA4 = "https://region1.google-analytics.com/g/collect";

function hitFor(url, via = "fetch") {
  const page = loadPage();
  if (via === "fetch") page.window.fetch(url);
  if (via === "beacon") page.window.navigator.sendBeacon(url, "body");
  if (via === "xhr") new page.window.XMLHttpRequest().open("POST", url);
  return page.debugState().networkHits[0];
}

describe("GCS decoding", () => {
  // gcs is G1<ad_storage><analytics_storage>. Google's sGTM transformations guide treats both
  // G100 and G110 as "analytics_storage denied"; real gtag.js sends G101 when analytics is
  // granted and ads denied (#26).
  const cases = [
    ["G111", "granted", "granted"],
    ["G100", "denied", "denied"],
    ["G101", "granted", "denied"],
    ["G110", "denied", "granted"],
  ];
  for (const [gcs, analytics, ads] of cases) {
    test(`${gcs} decodes to analytics_storage=${analytics}, ad_storage=${ads}`, () => {
      const hit = hitFor(`${GA4}?v=2&tid=G-1&gcs=${gcs}&en=page_view`);
      assert.equal(hit.gcs, gcs);
      assert.deepEqual(hit.decoded.gcs, { raw: gcs, analytics_storage: analytics, ad_storage: ads });
    });
  }

  test("a value not starting with G1 is reported as an unexpected format, not decoded", () => {
    const hit = hitFor(`${GA4}?gcs=X100`);
    assert.deepEqual(hit.decoded.gcs, { raw: "X100", error: "unexpected format" });
  });

  test("a request without gcs has no decoded gcs", () => {
    const hit = hitFor(`${GA4}?tid=G-1`);
    assert.equal(hit.gcs, null);
    assert.equal(hit.decoded.gcs, undefined);
  });
});

describe("GCD decoding", () => {
  test("decodes the four consent types in order with default/update source", () => {
    // ad_storage granted by update, analytics_storage denied by default,
    // ad_user_data denied by update, ad_personalization granted by default.
    const hit = hitFor(`${GA4}?gcd=13e1p3q1t5`);
    assert.deepEqual(hit.decoded.gcd, {
      raw: "13e1p3q1t5",
      ad_storage: "granted (updated)",
      analytics_storage: "denied (default)",
      ad_user_data: "denied (updated)",
      ad_personalization: "granted (default)",
    });
  });

  test("decodes an unset consent type", () => {
    const hit = hitFor(`${GA4}?gcd=11l1l1l1l5`);
    assert.equal(hit.decoded.gcd.ad_storage, "unset");
    assert.equal(hit.decoded.gcd.ad_personalization, "unset");
  });

  test("labels unknown state characters instead of guessing", () => {
    const hit = hitFor(`${GA4}?gcd=11z1t1t1t5`);
    assert.equal(hit.decoded.gcd.ad_storage, "unknown:z");
  });

  // #32: gtag.js sends the letter r for a type granted by an update. Google does not define the
  // gcd letters, so r stays unmapped; the type is read from gcs (ad_storage, analytics_storage)
  // and the letter is kept as evidence.
  test("real gtag.js hits: an undocumented gcd letter falls back to gcs for that type", () => {
    const adsDenied = hitFor(`${GA4}?tid=G-1&gcs=G101&gcd=13p3r3p3p5l1&en=page_view`);
    assert.equal(adsDenied.decoded.gcd.analytics_storage, "unknown:r");
    assert.deepEqual(adsDenied.requestConsent, {
      ad_storage: "denied",
      analytics_storage: "granted",
      ad_user_data: "denied",
      ad_personalization: "denied",
    });
    assert.deepEqual(adsDenied.gcdUnknown, { analytics_storage: "r" });

    const granted = hitFor(`${GA4}?tid=G-1&gcs=G111&gcd=13r3r3r3r5l1&en=page_view`);
    assert.deepEqual(granted.requestConsent, { ad_storage: "granted", analytics_storage: "granted" });
    assert.deepEqual(granted.gcdUnknown, {
      ad_storage: "r",
      analytics_storage: "r",
      ad_user_data: "r",
      ad_personalization: "r",
    });
  });

  test("an undocumented gcd letter with no gcs leaves the type unknown, not denied or granted", () => {
    const hit = hitFor(`${GA4}?tid=G-1&gcd=13r3p3p3p5l1`);
    assert.deepEqual(hit.requestConsent, { analytics_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
    assert.deepEqual(hit.gcdUnknown, { ad_storage: "r" });
  });

  test("a known gcd letter still wins over gcs, and no gcdUnknown is recorded", () => {
    const hit = hitFor(`${GA4}?tid=G-1&gcs=G111&gcd=13p3p3p3p5l1`);
    assert.equal(hit.requestConsent.ad_storage, "denied");
    assert.equal(hit.gcdUnknown, undefined);
  });

  test("a one-character value is reported as too short", () => {
    const hit = hitFor(`${GA4}?gcd=1`);
    assert.deepEqual(hit.decoded.gcd, { raw: "1", error: "too short" });
  });
});

describe("NPA, tracking ID and event name", () => {
  test("npa=1 means non-personalized ads", () => {
    const hit = hitFor("https://googleads.g.doubleclick.net/pagead/viewthroughconversion/1?npa=1");
    assert.equal(hit.decoded.npa, "non-personalized (ad_personalization denied)");
  });

  test("npa=0 means personalized ads", () => {
    const hit = hitFor("https://www.googleadservices.com/pagead/conversion/1?npa=0");
    assert.equal(hit.decoded.npa, "personalized");
  });

  test("reads tid and the GA4 event name", () => {
    const hit = hitFor(`${GA4}?tid=G-XYZ&en=purchase`);
    assert.equal(hit.tid, "G-XYZ");
    assert.equal(hit.en, "purchase");
  });

  test("falls back to the id parameter for the tracking ID (gtag.js loads)", () => {
    const hit = hitFor("https://www.googletagmanager.com/gtag/js?id=G-LOADER");
    assert.equal(hit.tid, "G-LOADER");
  });
});

describe("which requests are captured", () => {
  test("captures fetch, sendBeacon and XMLHttpRequest, and records the method", () => {
    assert.equal(hitFor(GA4, "fetch").method, "fetch");
    assert.equal(hitFor(GA4, "beacon").method, "beacon");
    assert.equal(hitFor(GA4, "xhr").method, "xhr");
  });

  test("passes the original calls through unchanged", () => {
    const page = loadPage();
    assert.equal(page.window.fetch(GA4, { method: "POST" }), "fetch-result");
    assert.equal(page.window.navigator.sendBeacon(GA4, "x"), true);
    new page.window.XMLHttpRequest().open("GET", "/api");
    assert.deepEqual(page.sent.fetch, [GA4]);
    assert.deepEqual(page.sent.beacon, [GA4]);
    assert.deepEqual(page.sent.xhr, [{ method: "GET", url: "/api" }]);
  });

  test("reads the URL from a Request object passed to fetch", () => {
    const page = loadPage();
    page.window.fetch(new page.window.Request(`${GA4}?gcs=G100`));
    assert.equal(page.debugState().networkHits[0].decoded.gcs.analytics_storage, "denied");
  });

  test("records host and path, not the full query string", () => {
    const hit = hitFor(`${GA4}?tid=G-1&uid=secret`);
    assert.equal(hit.host, "region1.google-analytics.com");
    assert.equal(hit.url, "/g/collect");
  });

  test("ignores requests to non-vendor hosts, including same-origin relative URLs", () => {
    const page = loadPage();
    page.window.fetch("https://api.shop.example/cart?gcs=G100");
    page.window.fetch("/checkout");
    assert.deepEqual(page.debugState().networkHits, []);
  });

  const vendors = [
    ["https://www.facebook.com/tr?ev=Purchase", "facebook", { ev: "Purchase" }],
    ["https://snap.licdn.com/li.lms-analytics/insight.min.js", "linkedin", {}],
    ["https://analytics.tiktok.com/api/v2/pixel?event=ViewContent", "tiktok", { event: "ViewContent" }],
    ["https://in.hotjar.com/api/v2/client", "hotjar", {}],
    ["https://c.clarity.ms/collect", "clarity", {}],
    ["https://ct.pinterest.com/v3/", "pinterest", {}],
    ["https://tr.snapchat.com/p", "snapchat", {}],
    ["https://stats.g.doubleclick.net/g/collect", "google", {}],
  ];
  for (const [url, vendor, extra] of vendors) {
    test(`${new URL(url).hostname} is ${vendor ? `attributed to ${vendor}` : "not captured"}`, () => {
      const hit = hitFor(url);
      if (!vendor) return assert.equal(hit, undefined);
      assert.equal(hit.vendor, vendor);
      for (const [key, value] of Object.entries(extra)) assert.equal(hit[key], value);
    });
  }

  test("only Google requests get gcs/gcd decoding", () => {
    const hit = hitFor("https://www.facebook.com/tr?ev=PageView&gcs=G100");
    assert.equal(hit.gcs, undefined);
    assert.deepEqual(hit.decoded, {});
  });

  test("each captured request is added to the timeline as a network_hit", () => {
    const page = loadPage();
    page.at(42).window.fetch(`${GA4}?gcs=G111`);
    const event = page.debugState().timeline[0];
    assert.equal(event.type, "network_hit");
    assert.equal(event.ms, 42);
    assert.equal(event.detail.gcs, "G111");
  });
});

// #36: Floodlight sends activity requests as <img> / <iframe>, and Google Ads some hits as
// <img>. They are seen through Resource Timing (a PerformanceObserver in the page), and
// Floodlight's consent signals are ;-separated parameters in the path. URLs measured from real
// gtag.js (DC-1234567) in Chromium.
describe("image and iframe requests, and ;-parameters in the path (#36)", () => {
  const FL_IMG_DENIED =
    "https://ade.googlesyndication.com/ddm/activity/src=1234567;type=invmedia;cat=fixtu0;rcb=10;ord=987761624692;npa=1;pscdl=denied;frm=0;_tu=IFA;gtm=45fe6as1za200xecxf1;gcs=G101;gcd=13p3r3p3p5l1;dma_cps=-;dma=0;dc_fmt=8;epver=2;~oref=https%3A%2F%2Fshop.example%2Fcheckout?";
  const FL_IFRAME_GRANTED =
    "https://1234567.fls.doubleclick.net/activityi;src=1234567;type=invmedia;cat=fixtu0;rcb=1;ord=6921626417323;npa=0;auiddc=1941375432.1793382834;pscdl=noapi;frm=0;gcs=G111;gcd=13r3r3r3r5l1;dma=0;dc_fmt=2;dc_random=1793382835_JsUh;~oref=https%3A%2F%2Fshop.example%2Fcheckout?";

  test("an <img> to a Google host is captured at its start time, with gcs, gcd and npa read from the path", () => {
    const page = loadPage();
    page.at(2000).resource(FL_IMG_DENIED, "img", 1500);
    const hit = page.debugState().networkHits[0];
    assert.deepEqual([hit.method, hit.host, hit.url, hit.ms], ["img", "ade.googlesyndication.com", "/ddm/activity/src=1234567", 1500]);
    assert.deepEqual([hit.tag, hit.tagId], ["Floodlight", "DC-1234567"]);
    assert.deepEqual([hit.gcs, hit.gcd, hit.npa], ["G101", "13p3r3p3p5l1", "1"]);
    assert.deepEqual(hit.requestConsent, {
      ad_storage: "denied",
      analytics_storage: "granted",
      ad_user_data: "denied",
      ad_personalization: "denied",
    });
  });

  test("an <iframe> is captured; its ;auiddc= cookie ID is recorded by name only, and the stored path stops at the first ;", () => {
    const page = loadPage();
    page.at(900).resource(FL_IFRAME_GRANTED, "iframe", 800);
    const hit = page.debugState().networkHits[0];
    assert.deepEqual([hit.method, hit.url, hit.gcs, hit.cookieIds], ["iframe", "/activityi", "G111", ["auiddc"]]);
    assert.doesNotMatch(JSON.stringify(page.debugState()), /1941375432|oref|shop\.example%2Fcheckout/);
  });

  test(";-parameters are read for a Floodlight request captured through fetch too", () => {
    const hit = hitFor("https://ad.doubleclick.net/activity;src=1234567;type=invmedia;cat=fixtu0;npa=0;gcs=G111;gcd=13r3r3r3r5l1;dc_fmt=3?");
    assert.deepEqual([hit.url, hit.gcs, hit.gcd, hit.tag], ["/activity", "G111", "13r3r3r3r5l1", "Floodlight"]);
  });

  test("a query parameter wins over a path parameter of the same name", () => {
    const hit = hitFor("https://ad.doubleclick.net/activity;src=1234567;gcs=G100?gcs=G111");
    assert.equal(hit.gcs, "G111");
  });

  test("Google Ads hits sent as images are captured too", () => {
    const page = loadPage();
    page.resource("https://www.google.com/pagead/1p-user-list/123456789/?random=1&gcd=13r3r3r3r5l1&en=page_view", "img", 300);
    const hit = page.debugState().networkHits[0];
    assert.deepEqual([hit.method, hit.tag, hit.tagId], ["img", "Google Ads", "AW-123456789"]);
  });

  test("skips what the wrappers already capture, scripts, other vendors and Google tag diagnostics", () => {
    const page = loadPage();
    page.resource("https://www.google-analytics.com/g/collect?tid=G-1", "fetch", 10);
    page.resource("https://www.google-analytics.com/g/collect?tid=G-1", "xmlhttprequest", 11);
    page.resource("https://www.google-analytics.com/g/collect?tid=G-1", "beacon", 12);
    page.resource("https://www.googletagmanager.com/gtag/js?id=G-1", "script", 13);
    page.resource("https://www.facebook.com/tr?ev=PageView", "img", 14);
    page.resource("https://www.googletagmanager.com/a?id=G-1&v=3&t=t", "img", 15);
    page.resource("https://cdn.shop.example/logo.png", "img", 16);
    assert.deepEqual(page.debugState().networkHits, []);
  });

  test("skips resources that started before the extension's capture began", () => {
    const page = loadPage();
    page.resource(FL_IMG_DENIED, "img", -5);
    assert.deepEqual(page.debugState().networkHits, []);
  });

  test("observes resource entries, including ones buffered before the observer started", () => {
    const page = loadPage();
    assert.equal(page.observers.length, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(page.observers[0].options)), { type: "resource", buffered: true });
  });

  test("a page without PerformanceObserver still captures fetch, XHR and beacons", () => {
    const page = loadPage({ noPerformanceObserver: true });
    page.window.fetch(`${GA4}?tid=G-1`);
    assert.equal(page.debugState().networkHits.length, 1);
  });
});
