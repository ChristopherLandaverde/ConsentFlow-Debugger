// Detection and judgement in injected.js: the seven validation rules (including the
// default-before-config race condition), CMP and tag detection, tag verdicts, and the
// get-state message the content script uses.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { loadPage } from "./helpers/page.mjs";

const GA4 = "https://region1.google-analytics.com/g/collect";
const FULL_V2 = {
  ad_storage: "denied",
  analytics_storage: "denied",
  ad_user_data: "denied",
  ad_personalization: "denied",
};

describe("validation lifecycle", () => {
  test("rules run 500 ms after DOMContentLoaded, then the state is marked ready", () => {
    const page = loadPage({ readyState: "loading" });
    assert.equal(page.debugState().ready, false);
    assert.deepEqual(page.debugState().validation, []);
    assert.deepEqual(
      page.timeouts.map((t) => t.ms),
      [],
      "nothing is scheduled until DOMContentLoaded",
    );
    page.finishLoading();
    const state = page.debugState();
    assert.equal(state.ready, true);
    assert.equal(state.validation.length, 7);
    assert.ok(page.posted.some((m) => m.type === "ready"));
  });

  test("on an already-loaded document detection is scheduled right away", () => {
    const page = loadPage({ readyState: "complete" });
    assert.deepEqual(
      page.timeouts.map((t) => t.ms),
      [500],
    );
  });

  test("rules are re-evaluated every 3 seconds", () => {
    const page = loadPage().finishLoading();
    assert.deepEqual(
      page.intervals.map((i) => i.ms),
      [3000],
    );
    assert.equal(page.rule("consent-update-received").status, "info");
    page.gtag("consent", "update", { ad_storage: "granted" });
    page.tick();
    assert.equal(page.rule("consent-update-received").status, "pass");
  });

  test("reports the rules in a fixed order with their ids", () => {
    const page = loadPage().finishLoading();
    assert.deepEqual(
      page.requestState().validation.map((r) => r.id),
      [
        "consent-default-exists",
        "consent-default-before-config",
        "v2-types-present",
        "wait-for-update",
        "consent-update-received",
        "gcs-consistency",
        "no-duplicate-defaults",
      ],
    );
  });
});

describe("rule 1: Consent Default Exists", () => {
  test("fails when the page never sets a consent default", () => {
    const page = loadPage().finishLoading();
    const rule = page.rule("consent-default-exists");
    assert.equal(rule.status, "fail");
    assert.match(rule.detail, /No consent default found/);
  });

  test("passes and lists the declared types when a default exists", () => {
    const page = loadPage();
    page.at(7.6).gtag("consent", "default", { ad_storage: "denied", analytics_storage: "denied" });
    page.finishLoading();
    const rule = page.rule("consent-default-exists");
    assert.equal(rule.status, "pass");
    assert.equal(rule.detail, "Found at 8ms with: ad_storage, analytics_storage");
  });
});

describe("rule 2: Default Before Config (race condition)", () => {
  test("is informational while there are no config calls", () => {
    const page = loadPage();
    page.gtag("consent", "default", FULL_V2);
    page.finishLoading();
    assert.equal(page.rule("consent-default-before-config").status, "info");
  });

  test("passes when the default precedes the first config", () => {
    const page = loadPage();
    page.at(10).gtag("consent", "default", FULL_V2);
    page.at(40).push(["config", "G-1"]);
    page.finishLoading();
    const rule = page.rule("consent-default-before-config");
    assert.equal(rule.status, "pass");
    assert.match(rule.detail, /Consent default \(10ms\) correctly precedes first config \(40ms\)/);
  });

  test("fails and reports how late the default was when config fires first", () => {
    const page = loadPage();
    page.at(20).push(["config", "G-RACE"]);
    page.at(145).gtag("consent", "default", FULL_V2);
    page.finishLoading();
    const rule = page.rule("consent-default-before-config");
    assert.equal(rule.status, "fail");
    assert.equal(
      rule.detail,
      'RACE CONDITION: gtag("config", "G-RACE") fired at 20ms but consent default was at 145ms (125ms late).',
    );
  });

  test("fails when config fires and no default ever arrives", () => {
    const page = loadPage();
    page.at(20).push(["config", "G-1"]);
    page.finishLoading();
    assert.equal(page.rule("consent-default-before-config").status, "fail");
  });

  test("judges only the first config call", () => {
    const page = loadPage();
    page.at(5).push(["config", "G-EARLY"]);
    page.at(10).gtag("consent", "default", FULL_V2);
    page.at(20).push(["config", "G-LATER"]);
    page.finishLoading();
    assert.match(page.rule("consent-default-before-config").detail, /G-EARLY/);
  });
});

describe("rule 3: Consent Mode v2 Types", () => {
  test("is informational without a default", () => {
    assert.equal(loadPage().finishLoading().rule("v2-types-present").status, "info");
  });

  test("warns and names the missing v2 types", () => {
    const page = loadPage();
    page.gtag("consent", "default", { ad_storage: "denied", analytics_storage: "denied" });
    page.finishLoading();
    const rule = page.rule("v2-types-present");
    assert.equal(rule.status, "warn");
    assert.match(rule.detail, /Missing from consent default: ad_user_data, ad_personalization/);
  });

  test("passes when ad_user_data and ad_personalization are declared", () => {
    const page = loadPage();
    page.gtag("consent", "default", FULL_V2);
    page.finishLoading();
    assert.equal(page.rule("v2-types-present").status, "pass");
  });

  test("checks the default, not types that only arrive in an update", () => {
    const page = loadPage();
    page.gtag("consent", "default", { ad_storage: "denied" });
    page.gtag("consent", "update", { ad_user_data: "granted", ad_personalization: "granted" });
    page.finishLoading();
    assert.equal(page.rule("v2-types-present").status, "warn");
  });
});

describe("rule 4: wait_for_update Configured", () => {
  test("is informational when no CMP is detected", () => {
    const page = loadPage();
    page.gtag("consent", "default", FULL_V2);
    page.finishLoading();
    assert.equal(page.rule("wait-for-update").status, "info");
  });

  test("warns when a CMP is present and the default has no wait_for_update", () => {
    const page = loadPage({ globals: { Cookiebot: {} } });
    page.gtag("consent", "default", FULL_V2);
    page.finishLoading();
    const rule = page.rule("wait-for-update");
    assert.equal(rule.status, "warn");
    assert.match(rule.detail, /CMP \(Cookiebot\) detected but wait_for_update is missing/);
  });

  test("passes when a CMP is present and wait_for_update is set", () => {
    const page = loadPage({ globals: { OneTrust: {} } });
    page.gtag("consent", "default", { ...FULL_V2, wait_for_update: 500 });
    page.finishLoading();
    const rule = page.rule("wait-for-update");
    assert.equal(rule.status, "pass");
    assert.equal(rule.detail, "wait_for_update is set to 500ms.");
  });
});

describe("rule 5: Consent Update Received", () => {
  test("is informational until an update arrives, then passes", () => {
    const page = loadPage();
    page.gtag("consent", "default", FULL_V2);
    page.finishLoading();
    assert.equal(page.rule("consent-update-received").status, "info");
    page.at(900).gtag("consent", "update", { analytics_storage: "granted" });
    page.at(1200).gtag("consent", "update", { ad_storage: "granted" });
    page.tick();
    const rule = page.rule("consent-update-received");
    assert.equal(rule.status, "pass");
    assert.equal(rule.detail, "2 update(s) received. Last at 1200ms.");
  });
});

describe("rule 6: GCS Signal Consistency", () => {
  test("is informational with no captured requests", () => {
    assert.equal(loadPage().finishLoading().rule("gcs-consistency").status, "info");
  });

  test("passes when every gcs value matches the current consent state", () => {
    const page = loadPage();
    page.gtag("consent", "default", FULL_V2);
    page.window.fetch(`${GA4}?gcs=G100`);
    page.finishLoading();
    const rule = page.rule("gcs-consistency");
    assert.equal(rule.status, "pass");
    assert.equal(rule.detail, "1 request(s) checked. All GCS values match consent state.");
  });

  test("fails and describes each mismatch", () => {
    const page = loadPage();
    page.gtag("consent", "default", FULL_V2);
    page.window.fetch(`${GA4}?gcs=G111`);
    page.finishLoading();
    const rule = page.rule("gcs-consistency");
    assert.equal(rule.status, "fail");
    assert.equal(
      rule.detail,
      'analytics_storage: consent says "denied" but GCS shows "granted" in request to region1.google-analytics.com | ' +
        'ad_storage: consent says "denied" but GCS shows "granted" in request to region1.google-analytics.com',
    );
  });

  test("compares against the current state, so a request sent before a grant later fails", () => {
    // A hit sent while denied (G100) is judged against consent as it is now (granted).
    const page = loadPage();
    page.gtag("consent", "default", FULL_V2);
    page.window.fetch(`${GA4}?gcs=G100`);
    page.gtag("consent", "update", { analytics_storage: "granted", ad_storage: "granted" });
    page.finishLoading();
    assert.equal(page.rule("gcs-consistency").status, "fail");
  });

  test("skips gcs values it could not decode and consent types the page never set", () => {
    const page = loadPage();
    page.gtag("consent", "default", { analytics_storage: "denied" });
    page.window.fetch(`${GA4}?gcs=BAD`);
    page.window.fetch(`${GA4}?gcs=G101`); // ad_storage granted, but ad_storage was never set
    page.finishLoading();
    assert.equal(page.rule("gcs-consistency").status, "pass");
  });
});

describe("rule 7: No Duplicate Defaults", () => {
  test("passes with none or one default", () => {
    assert.equal(loadPage().finishLoading().rule("no-duplicate-defaults").detail, "No defaults found.");
    const page = loadPage();
    page.gtag("consent", "default", FULL_V2);
    page.finishLoading();
    assert.equal(page.rule("no-duplicate-defaults").status, "pass");
  });

  test("warns and counts defaults when there are several", () => {
    const page = loadPage();
    page.gtag("consent", "default", FULL_V2);
    page.push(["consent", "default", { ad_storage: "granted" }]);
    page.gtag("consent", "default", { analytics_storage: "granted" });
    page.finishLoading();
    const rule = page.rule("no-duplicate-defaults");
    assert.equal(rule.status, "warn");
    assert.match(rule.detail, /^3 consent defaults found/);
  });
});

describe("CMP detection", () => {
  const byGlobal = [
    ["Cookiebot", "Cookiebot"],
    ["OneTrust", "OneTrust"],
    ["__tcfapi", "IAB TCF CMP"],
    ["CookieYes", "CookieYes"],
    ["cc", "CookieConsent"],
    ["Osano", "Osano"],
    ["klaro", "Klaro"],
    ["CookieInformation", "Cookie Information"],
  ];
  for (const [global, name] of byGlobal) {
    test(`window.${global} is detected as ${name}`, () => {
      const page = loadPage({ globals: { [global]: {} } }).finishLoading();
      assert.deepEqual(page.debugState().cmp, { name, detected: true });
    });
  }

  const byScript = [
    ["https://consent.cookiebot.com/uc.js", "Cookiebot (script)"],
    ["https://cdn.cookielaw.org/scripttemplates/otSDKStub.js", "OneTrust (script)"],
    ["https://cdn-cookieyes.com/client_data/x/script.js", "CookieYes (script)"],
    ["https://cmp.osano.com/x/osano.js", "Osano (script)"],
    ["https://app.usercentrics.eu/browser-ui/latest/loader.js", "Usercentrics (script)"],
    ["https://cs.iubenda.com/autoblocking/1.js", "iubenda (script)"],
  ];
  for (const [src, name] of byScript) {
    test(`a script from ${new URL(src).hostname} is detected as ${name}`, () => {
      const page = loadPage({ scripts: [src] }).finishLoading();
      assert.equal(page.debugState().cmp.name, name);
    });
  }

  test("reports None when no CMP is present", () => {
    const page = loadPage({ scripts: ["https://shop.example/app.js"] }).finishLoading();
    assert.deepEqual(page.debugState().cmp, { name: "None", detected: false });
  });
});

describe("tag detection", () => {
  const tags = [
    [{ scripts: ["https://www.googletagmanager.com/gtag/js?id=G-1"] }, "Google Analytics 4", ["analytics_storage"]],
    [{ globals: { google_tag_manager: {} } }, "Google Tag Manager", ["analytics_storage", "ad_storage"]],
    [{ scripts: ["https://www.googletagmanager.com/gtm.js?id=GTM-X"] }, "Google Tag Manager", null],
    [{ scripts: ["https://www.googleadservices.com/pagead/conversion.js"] }, "Google Ads", ["ad_storage", "ad_user_data", "ad_personalization"]],
    [{ globals: { fbq() {} } }, "Facebook Pixel", ["ad_storage"]],
    [{ scripts: ["https://snap.licdn.com/li.lms-analytics/insight.min.js"] }, "LinkedIn Insight", null],
    [{ globals: { ttq: {} } }, "TikTok Pixel", null],
    [{ globals: { hj() {} } }, "Hotjar", ["analytics_storage"]],
    [{ scripts: ["https://www.clarity.ms/tag/abc"] }, "Microsoft Clarity", null],
    [{ globals: { pintrk() {} } }, "Pinterest Tag", null],
    [{ scripts: ["https://sc-static.net/scevent.min.js"] }, "Snapchat Pixel", null],
  ];
  for (const [setup, name, consentTypes] of tags) {
    test(`detects ${name} from ${setup.scripts ? "its script" : "its global"}`, () => {
      const page = loadPage(setup).finishLoading();
      const found = page.debugState().tags.find((t) => t.name === name);
      assert.ok(found, `${name} not detected`);
      if (consentTypes) assert.deepEqual(found.consentTypes, consentTypes);
    });
  }

  test("detects several tags on one page and nothing on a bare page", () => {
    const page = loadPage({
      scripts: ["https://www.googletagmanager.com/gtag/js?id=G-1", "https://connect.facebook.net/en_US/fbevents.js"],
      globals: { hj() {} },
    }).finishLoading();
    assert.deepEqual(
      page.debugState().tags.map((t) => t.name),
      ["Google Analytics 4", "Facebook Pixel", "Hotjar"],
    );
    assert.deepEqual(loadPage().finishLoading().debugState().tags, []);
  });

  test("picks up tags whose scripts are added after the first pass", () => {
    const page = loadPage().finishLoading();
    page.addScript("https://www.clarity.ms/tag/abc");
    page.tick();
    assert.deepEqual(
      page.debugState().tags.map((t) => t.name),
      ["Microsoft Clarity"],
    );
  });
});

describe("tag verdicts (tags firing against consent)", () => {
  const withGA4 = () => loadPage({ scripts: ["https://www.googletagmanager.com/gtag/js?id=G-1"] });

  test("NO CONSENT MODE when the page has no consent default", () => {
    const page = withGA4();
    page.window.fetch(GA4);
    page.finishLoading();
    assert.equal(page.verdict("Google Analytics 4").verdict, "no_consent_mode");
  });

  test("VIOLATION when a required type is denied and the vendor sent requests", () => {
    const page = withGA4();
    page.gtag("consent", "default", FULL_V2);
    page.window.fetch(`${GA4}?gcs=G100`);
    page.window.navigator.sendBeacon(`${GA4}?gcs=G100`);
    page.finishLoading();
    assert.deepEqual(page.verdict("Google Analytics 4"), {
      name: "Google Analytics 4",
      type: "analytics",
      vendor: "google",
      consentTypes: ["analytics_storage"],
      requestCount: 2,
      verdict: "violation",
    });
  });

  test("BLOCKED when a required type is denied and no requests were sent", () => {
    const page = withGA4();
    page.gtag("consent", "default", FULL_V2);
    page.finishLoading();
    assert.equal(page.verdict("Google Analytics 4").verdict, "blocked");
  });

  test("FIRING when consent is granted and requests were sent", () => {
    const page = withGA4();
    page.gtag("consent", "default", FULL_V2);
    page.gtag("consent", "update", { analytics_storage: "granted" });
    page.window.fetch(`${GA4}?gcs=G110`);
    page.finishLoading();
    assert.equal(page.verdict("Google Analytics 4").verdict, "firing");
  });

  test("IDLE when consent is not denied and nothing was sent", () => {
    const page = withGA4();
    page.gtag("consent", "default", { analytics_storage: "granted" });
    page.finishLoading();
    assert.equal(page.verdict("Google Analytics 4").verdict, "idle");
  });

  test("a consent type the page never declared does not count as denied", () => {
    const page = withGA4();
    page.gtag("consent", "default", { ad_storage: "denied" });
    page.window.fetch(GA4);
    page.finishLoading();
    assert.equal(page.verdict("Google Analytics 4").verdict, "firing");
  });

  test("uses the current state: requests sent while denied are FIRING once consent is granted", () => {
    const page = withGA4();
    page.gtag("consent", "default", FULL_V2);
    page.window.fetch(GA4);
    page.gtag("consent", "update", { analytics_storage: "granted" });
    page.finishLoading();
    assert.equal(page.verdict("Google Analytics 4").verdict, "firing");
  });

  test("counts only requests to the tag's own vendor", () => {
    const page = loadPage({ globals: { fbq() {} } });
    page.gtag("consent", "default", FULL_V2);
    page.window.fetch(GA4);
    page.finishLoading();
    const fb = page.verdict("Facebook Pixel");
    assert.equal(fb.requestCount, 0);
    assert.equal(fb.verdict, "blocked");
  });
});

describe("get-state message", () => {
  test("answers a cf-debug-content get-state request with the full state and its requestId", () => {
    const page = loadPage().finishLoading();
    page.requestState("abc");
    const reply = page.posted.find((m) => m.type === "full-state");
    assert.equal(reply.source, "cf-debug-injected");
    assert.equal(reply.requestId, "abc");
    assert.deepEqual(Object.keys(reply.payload).sort(), [
      "cmp",
      "configCalls",
      "consentDefaults",
      "consentUpdates",
      "currentConsent",
      "networkHits",
      "ready",
      "tagImpact",
      "tags",
      "timeline",
      "validation",
    ]);
  });

  test("ignores messages from any other source", () => {
    const page = loadPage().finishLoading();
    const before = page.posted.length;
    page.deliver({ source: "someone-else", type: "get-state", requestId: "x" });
    page.deliver({ type: "get-state", requestId: "y" });
    page.deliver(null);
    assert.equal(page.posted.length, before);
  });

  test("keeps only the latest 300 timeline events and 200 network requests", () => {
    const page = loadPage();
    for (let i = 0; i < 250; i++) page.window.fetch(`${GA4}?n=${i}`);
    for (let i = 0; i < 100; i++) page.push({ event: `e${i}` });
    page.finishLoading();
    const state = page.requestState();
    assert.equal(state.networkHits.length, 200);
    assert.equal(state.timeline.length, 300);
    assert.equal(state.timeline.at(-1).detail.event, "e99");
    assert.equal(page.debugState().networkHits.length, 250, "page-side state is not trimmed");
  });

  test("does not install itself twice on the same page", () => {
    const page = loadPage();
    page.gtag("consent", "default", FULL_V2);
    const first = page.window.__cfDebug;
    page.reinject();
    assert.equal(page.window.__cfDebug, first);
    page.gtag("consent", "update", { ad_storage: "granted" });
    assert.equal(page.debugState().timeline.length, 2, "each command is recorded once");
  });
});
