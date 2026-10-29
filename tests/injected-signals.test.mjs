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
  const cases = [
    ["G111", "granted", "granted"],
    ["G100", "denied", "denied"],
    ["G110", "granted", "denied"],
    ["G101", "denied", "granted"],
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
