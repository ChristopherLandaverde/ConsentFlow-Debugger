// Detection and judgement in injected.js: the eight validation rules (including the
// default-before-config and default-before-update race conditions), CMP and tag detection, tag verdicts, and the
// get-state message the content script uses.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { loadFindings } from "./helpers/findings.mjs";
import { loadPage } from "./helpers/page.mjs";

const { computeVerdict } = loadFindings();

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
    assert.equal(state.validation.length, 8);
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
    assert.equal(page.rule("consent-update-received").status, "not_checked");
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
        "default-before-update",
      ],
    );
  });
});

describe("rule statuses", () => {
  const statuses = ["pass", "fail", "warn", "not_checked"];

  test("a rule that lacked the data it needs is not_checked with a needs reason, never info", () => {
    const page = loadPage().finishLoading();
    for (const rule of page.requestState().validation) {
      assert.ok(statuses.includes(rule.status), `${rule.id} has status ${rule.status}`);
      if (rule.status === "not_checked") assert.match(rule.needs, /^[a-z_]+$/, `${rule.id} says what it needs`);
      else assert.equal(rule.needs, undefined);
      assert.equal(typeof rule.data, "object", `${rule.id} carries data for the finding copy`);
    }
  });

  test("a bare page reports one failure and seven checks that could not run", () => {
    const rules = loadPage().finishLoading().requestState().validation;
    assert.deepEqual(
      rules.map((r) => r.status),
      ["fail", "not_checked", "not_checked", "not_checked", "not_checked", "not_checked", "not_checked", "not_checked"],
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
  test("is not checked, and says it needs a config call, while there are no config calls", () => {
    const page = loadPage();
    page.gtag("consent", "default", FULL_V2);
    page.finishLoading();
    const rule = page.rule("consent-default-before-config");
    assert.equal(rule.status, "not_checked");
    assert.equal(rule.needs, "config_call");
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
    assert.deepEqual(rule.data, { configId: "G-RACE", configMs: 20, defaultMs: 145, lateMs: 125, hasDefault: true });
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
  test("is not checked without a default", () => {
    const rule = loadPage().finishLoading().rule("v2-types-present");
    assert.equal(rule.status, "not_checked");
    assert.equal(rule.needs, "consent_default");
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
  test("is not checked when no CMP is detected, or without a default", () => {
    const page = loadPage();
    page.gtag("consent", "default", FULL_V2);
    page.finishLoading();
    const rule = page.rule("wait-for-update");
    assert.equal(rule.status, "not_checked");
    assert.equal(rule.needs, "cmp");
    const bare = loadPage({ globals: { Cookiebot: {} } }).finishLoading().rule("wait-for-update");
    assert.equal(bare.status, "not_checked");
    assert.equal(bare.needs, "consent_default");
  });

  test("warns when a CMP is present and the default has no wait_for_update", () => {
    const page = loadPage({ globals: { Cookiebot: {} } });
    page.gtag("consent", "default", FULL_V2);
    page.finishLoading();
    const rule = page.rule("wait-for-update");
    assert.equal(rule.status, "warn");
    assert.match(rule.detail, /CMP \(Cookiebot\) detected but wait_for_update is missing/);
    assert.deepEqual(rule.data, { cmp: "Cookiebot", waitForUpdate: null });
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
  test("is not checked until an update arrives, then passes", () => {
    const page = loadPage();
    page.gtag("consent", "default", FULL_V2);
    page.finishLoading();
    assert.equal(page.rule("consent-update-received").status, "not_checked");
    assert.equal(page.rule("consent-update-received").needs, "consent_update");
    page.at(900).gtag("consent", "update", { analytics_storage: "granted" });
    page.at(1200).gtag("consent", "update", { ad_storage: "granted" });
    page.tick();
    const rule = page.rule("consent-update-received");
    assert.equal(rule.status, "pass");
    assert.equal(rule.detail, "2 update(s) received. Last at 1200ms.");
    assert.deepEqual(rule.data, { count: 2, lastMs: 1200 });
  });
});

describe("rule 6: GCS Signal Consistency", () => {
  test("is not checked with no captured requests", () => {
    const rule = loadPage().finishLoading().rule("gcs-consistency");
    assert.equal(rule.status, "not_checked");
    assert.equal(rule.needs, "google_request");
  });

  test("is not checked when no captured request carries a gcs value", () => {
    const page = loadPage({ globals: { fbq() {} } });
    page.gtag("consent", "default", FULL_V2);
    page.window.fetch("https://www.facebook.com/tr?ev=PageView");
    page.window.fetch(GA4);
    page.finishLoading();
    assert.equal(page.rule("gcs-consistency").status, "not_checked");
  });

  test("passes when every gcs value matches the consent state when it was sent", () => {
    const page = loadPage();
    page.gtag("consent", "default", FULL_V2);
    page.window.fetch(`${GA4}?gcs=G100`);
    page.finishLoading();
    const rule = page.rule("gcs-consistency");
    assert.equal(rule.status, "pass");
    assert.equal(rule.detail, "1 request(s) checked. All GCS values match the consent state when they were sent.");
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
      'analytics_storage: consent was "denied" when sent but GCS shows "granted" in request to region1.google-analytics.com at 0ms | ' +
        'ad_storage: consent was "denied" when sent but GCS shows "granted" in request to region1.google-analytics.com at 0ms',
    );
  });

  test("compares each request with consent when it was sent, so a denied hit before a grant passes", () => {
    const page = loadPage();
    page.at(1).gtag("consent", "default", FULL_V2);
    page.at(20).window.fetch(`${GA4}?gcs=G100`);
    page.at(900).gtag("consent", "update", { analytics_storage: "granted", ad_storage: "granted" });
    page.at(950).window.fetch(`${GA4}?gcs=G111`);
    page.finishLoading();
    assert.equal(page.rule("gcs-consistency").status, "pass");
  });

  test("still fails a request that claimed granted while consent was denied, after consent is granted", () => {
    const page = loadPage();
    page.at(1).gtag("consent", "default", FULL_V2);
    page.at(20).window.fetch(`${GA4}?gcs=G101`);
    page.at(900).gtag("consent", "update", { analytics_storage: "granted", ad_storage: "granted" });
    page.finishLoading();
    const rule = page.rule("gcs-consistency");
    assert.equal(rule.status, "fail");
    assert.equal(
      rule.detail,
      'analytics_storage: consent was "denied" when sent but GCS shows "granted" in request to region1.google-analytics.com at 20ms',
    );
    assert.deepEqual(rule.data, {
      checked: 1,
      issues: [
        { type: "analytics_storage", expected: "denied", actual: "granted", host: "region1.google-analytics.com", ms: 20 },
      ],
    });
  });

  test("skips gcs values it could not decode and consent types the page never set", () => {
    const page = loadPage();
    page.gtag("consent", "default", { analytics_storage: "denied" });
    page.window.fetch(`${GA4}?gcs=BAD`);
    page.window.fetch(`${GA4}?gcs=G110`); // ad_storage granted, but ad_storage was never set
    page.finishLoading();
    assert.equal(page.rule("gcs-consistency").status, "pass");
  });

  test("passes gtag.js's G101 when analytics is granted and ads denied (#26)", () => {
    const page = loadPage();
    page.at(1).gtag("consent", "default", FULL_V2);
    page.at(2).gtag("consent", "update", { analytics_storage: "granted" });
    page.at(500).window.fetch(`${GA4}?gcs=G101&en=page_view`);
    page.finishLoading();
    const rule = page.rule("gcs-consistency");
    assert.equal(rule.status, "pass", rule.detail);
    assert.deepEqual(page.requestState().networkHits[0].requestConsent, {
      ad_storage: "denied",
      analytics_storage: "granted",
    });
  });
});

describe("rule 7: No Duplicate Defaults", () => {
  test("is not checked without a default and passes with one", () => {
    const none = loadPage().finishLoading().rule("no-duplicate-defaults");
    assert.equal(none.status, "not_checked");
    assert.equal(none.needs, "consent_default");
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

describe("rule 8: Default Before Update (race condition)", () => {
  test("is not checked while there are no updates", () => {
    const page = loadPage();
    page.gtag("consent", "default", FULL_V2);
    page.finishLoading();
    const rule = page.rule("default-before-update");
    assert.equal(rule.status, "not_checked");
    assert.equal(rule.needs, "consent_update");
    assert.equal(rule.detail, "No consent update to check.");
  });

  test("passes when the default precedes the first update", () => {
    const page = loadPage();
    page.at(10).gtag("consent", "default", FULL_V2);
    page.at(900).gtag("consent", "update", { analytics_storage: "granted" });
    page.finishLoading();
    const rule = page.rule("default-before-update");
    assert.equal(rule.status, "pass");
    assert.equal(rule.detail, "Consent default (10ms) correctly precedes first update (900ms).");
  });

  test("fails on an update-only page and explains why it matters", () => {
    const page = loadPage();
    page.at(30).gtag("consent", "update", { ad_storage: "granted", analytics_storage: "granted" });
    page.finishLoading();
    const rule = page.rule("default-before-update");
    assert.equal(rule.status, "fail");
    assert.equal(
      rule.detail,
      "1 consent update(s) captured, the first at 30ms, but no consent default was ever set. " +
        "Until the update, every consent type was implicitly granted.",
    );
    assert.match(rule.description, /override the choice the user already made/);
  });

  test("fails when an update arrives before the default and reports how early it was", () => {
    const page = loadPage();
    page.at(5).gtag("consent", "update", { ad_storage: "granted" });
    page.at(9).gtag("consent", "default", FULL_V2);
    page.at(40).gtag("consent", "update", { analytics_storage: "granted" });
    page.finishLoading();
    const rule = page.rule("default-before-update");
    assert.equal(rule.status, "fail");
    assert.equal(
      rule.detail,
      "RACE CONDITION: consent update at 5ms arrived before the consent default at 9ms (4ms early). " +
        "The default can override the choice the update recorded.",
    );
  });

  test("judges order, not timestamps, when both commands share a millisecond", () => {
    const page = loadPage();
    page.at(5).push(["consent", "update", { ad_storage: "granted" }]);
    page.at(5).push(["consent", "default", FULL_V2]);
    page.finishLoading();
    assert.equal(page.rule("default-before-update").status, "fail");
  });

  test("counts updates that were already in dataLayer before the extension ran", () => {
    const page = loadPage({
      dataLayer: [
        ["consent", "update", { ad_storage: "granted" }],
        ["consent", "default", FULL_V2],
      ],
    });
    page.finishLoading();
    assert.equal(page.rule("default-before-update").status, "fail");
  });

  test("is re-evaluated when an update arrives after the first pass", () => {
    const page = loadPage().finishLoading();
    assert.equal(page.rule("default-before-update").status, "not_checked");
    page.gtag("consent", "update", { ad_storage: "granted" });
    page.tick();
    assert.equal(page.rule("default-before-update").status, "fail");
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
    [{ globals: { google_tag_manager: { "GTM-X": {} } } }, "Google Tag Manager", []],
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

// #21: gtag.js defines window.google_tag_manager too, keyed by the IDs it loaded (G-, AW-, DC-).
// Only a GTM- key, or a loader script with id=GTM-, means a GTM container is on the page.
// See docs/research/gtag-vs-gtm-detection.md.
describe("Google tag vs GTM container (#21)", () => {
  const GTAG = "https://www.googletagmanager.com/gtag/js?id=G-1";
  const GTM_JS = "https://www.googletagmanager.com/gtm.js?id=GTM-ABC123";
  const names = (page) => page.debugState().tags.map((t) => t.name);

  test("gtag.js with only a GA4 ID is GA4, not Google Tag Manager", () => {
    const page = loadPage({ scripts: [GTAG], globals: { google_tag_manager: { "G-1": {} } } }).finishLoading();
    assert.deepEqual(names(page), ["Google Analytics 4"]);
  });

  test("a GA4 hit on a gtag.js page with ads denied is judged against analytics_storage only", () => {
    const page = loadPage({ scripts: [GTAG], globals: { google_tag_manager: { "G-1": {} } } });
    page.at(1).gtag("consent", "default", FULL_V2);
    page.at(2).gtag("consent", "update", { analytics_storage: "granted" });
    page.at(500).window.fetch(`${GA4}?en=page_view`);
    page.finishLoading();
    const impact = page.requestState().tagImpact;
    assert.deepEqual(impact.map((t) => [t.name, t.verdict]), [["Google Analytics 4", "firing"]]);
  });

  test("an empty google_tag_manager or a GT- Google tag ID is not a GTM container", () => {
    assert.deepEqual(names(loadPage({ globals: { google_tag_manager: {} } }).finishLoading()), []);
    const gt = loadPage({ scripts: [GTAG], globals: { google_tag_manager: { "GT-ABC123": {}, "G-1": {} } } });
    assert.deepEqual(names(gt.finishLoading()), ["Google Analytics 4"]);
  });

  test("gtag.js with an AW- ID detects Google Ads, judged against the ad consent types", () => {
    const page = loadPage({ scripts: [GTAG], globals: { google_tag_manager: { "G-1": {}, "AW-123456789": {} } } });
    page.at(1).gtag("consent", "default", FULL_V2);
    page.at(2).gtag("consent", "update", { analytics_storage: "granted" });
    // No consent signal, so not a cookieless ping (#34): a violation.
    page.at(500).window.fetch("https://www.googleadservices.com/pagead/conversion/123456789/");
    page.finishLoading();
    assert.deepEqual(names(page), ["Google Analytics 4", "Google Ads"]);
    const ads = page.verdict("Google Ads");
    assert.deepEqual(ads.consentTypes, ["ad_storage", "ad_user_data", "ad_personalization"]);
    assert.equal(ads.vendor, "google");
    assert.equal(ads.verdict, "violation");
    assert.deepEqual(ads.deniedTypes, ["ad_storage", "ad_user_data", "ad_personalization"]);
  });

  test("a gtag.js loader for an AW- ID detects Google Ads before gtag.js has run", () => {
    const page = loadPage({ scripts: ["https://www.googletagmanager.com/gtag/js?id=AW-123456789"] }).finishLoading();
    assert.ok(names(page).includes("Google Ads"));
    assert.ok(!names(page).includes("Google Tag Manager"));
  });

  test("a DC- ID detects Floodlight, judged against the ad consent types", () => {
    const page = loadPage({ scripts: [GTAG], globals: { google_tag_manager: { "G-1": {}, "DC-1234567": {} } } });
    page.at(1).gtag("consent", "default", FULL_V2);
    page.at(500).window.fetch("https://fls.doubleclick.net/activityi;src=1234567;type=a;cat=b");
    page.finishLoading();
    assert.deepEqual(names(page), ["Google Analytics 4", "Floodlight"]);
    const fl = page.verdict("Floodlight");
    assert.equal(fl.type, "advertising");
    assert.equal(fl.vendor, "google");
    assert.deepEqual(fl.consentTypes, ["ad_storage", "ad_user_data", "ad_personalization"]);
    assert.equal(fl.verdict, "violation");
  });

  test("a GTM container is detected from its GTM- key", () => {
    const page = loadPage({ scripts: [GTM_JS], globals: { google_tag_manager: { "GTM-ABC123": {} } } }).finishLoading();
    assert.deepEqual(names(page), ["Google Tag Manager"]);
  });

  test("a GTM container that loaded gtag.js is both Google Tag Manager and GA4", () => {
    const page = loadPage({
      scripts: [GTM_JS, GTAG],
      globals: { google_tag_manager: { "GTM-ABC123": {}, "G-1": {} } },
    }).finishLoading();
    assert.deepEqual(names(page), ["Google Analytics 4", "Google Tag Manager"]);
  });

  test("a GTM container served from a first-party host and path is detected", () => {
    for (const src of [
      "https://shop.example/metrics/gtm.js?id=GTM-ABC123",
      "https://sgtm.shop.example/x7q2?id=GTM-ABC123&l=dataLayer",
    ]) {
      assert.deepEqual(names(loadPage({ scripts: [src] }).finishLoading()), ["Google Tag Manager"], src);
    }
    const keyed = loadPage({
      scripts: ["https://shop.example/metrics/x7q2.js"],
      globals: { google_tag_manager: { "GTM-ABC123": {} } },
    }).finishLoading();
    assert.deepEqual(names(keyed), ["Google Tag Manager"]);
  });

  test("a GTM- key registered after the first pass is picked up", () => {
    const page = loadPage({ globals: { google_tag_manager: { "AW-1": {} } } }).finishLoading();
    assert.deepEqual(names(page), ["Google Ads"]);
    page.window.google_tag_manager["GTM-ABC123"] = {};
    page.tick();
    assert.deepEqual(names(page), ["Google Tag Manager", "Google Ads"]);
  });
});

// #30: a gtag.js loader is classified by the ID it loads (gtag/js?id=TAG_ID), not listed as GA4
// whatever that ID is.
describe("gtag.js loader classified by its tag ID (#30)", () => {
  const names = (setup) => loadPage(setup).finishLoading().debugState().tags.map((t) => t.name);

  test("an AW-only gtag.js install is Google Ads, not GA4", () => {
    assert.deepEqual(names({ scripts: ["https://www.googletagmanager.com/gtag/js?id=AW-123456789"] }), ["Google Ads"]);
    assert.deepEqual(
      names({
        scripts: ["https://www.googletagmanager.com/gtag/js?id=AW-123456789"],
        globals: { google_tag_manager: { "AW-123456789": {} } },
      }),
      ["Google Ads"],
    );
  });

  test("a DC-only gtag.js install is Floodlight, not GA4", () => {
    assert.deepEqual(names({ scripts: ["https://www.googletagmanager.com/gtag/js?id=DC-1234567"] }), ["Floodlight"]);
  });

  test("a G- loader is GA4, on Google's host or a first-party path", () => {
    for (const src of [
      "https://www.googletagmanager.com/gtag/js?id=G-FIXTURE123",
      "https://shop.example/metrics/g.js?id=G-FIXTURE123",
    ]) {
      assert.deepEqual(names({ scripts: [src] }), ["Google Analytics 4"], src);
    }
  });

  test("a G- key is GA4 even when the loader named another ID", () => {
    // gtag.js loaded for AW- registers G- once gtag('config', 'G-…') runs.
    assert.deepEqual(
      names({
        scripts: ["https://www.googletagmanager.com/gtag/js?id=AW-123456789"],
        globals: { google_tag_manager: { "AW-123456789": {}, "G-1": {} } },
      }),
      ["Google Analytics 4", "Google Ads"],
    );
  });

  test("a GT- loader alone is not GA4; GA4 behind it is found from its G- key or its hits", () => {
    const GT = "https://www.googletagmanager.com/gtag/js?id=GT-ABC123";
    assert.deepEqual(names({ scripts: [GT] }), []);
    assert.deepEqual(names({ scripts: [GT], globals: { google_tag_manager: { "GT-ABC123": {}, "G-1": {} } } }), [
      "Google Analytics 4",
    ]);
    const page = loadPage({ scripts: [GT] });
    page.window.fetch(`${GA4}?tid=G-1&en=page_view`);
    assert.deepEqual(page.finishLoading().debugState().tags.map((t) => t.name), ["Google Analytics 4"]);
  });

  test("a GTM container loader is not GA4", () => {
    assert.deepEqual(names({ scripts: ["https://www.googletagmanager.com/gtm.js?id=GTM-ABC123"] }), ["Google Tag Manager"]);
  });
});

// #28: each captured request is attributed to the tag that sent it, from the request itself
// (tag ID, endpoint path, host), and judged only against that tag's consent types. Patterns
// measured from real gtag.js in Chromium; see docs/detection.md.
describe("request attribution (#28)", () => {
  const GTAG_G = "https://www.googletagmanager.com/gtag/js?id=G-1";
  const GTM_JS = "https://www.googletagmanager.com/gtm.js?id=GTM-ABC123";
  const ADS_DENIED = (page) => {
    page.at(1).gtag("consent", "default", FULL_V2);
    page.at(2).gtag("consent", "update", { analytics_storage: "granted" });
  };
  const gaAndAds = () => loadPage({ scripts: [GTAG_G], globals: { google_tag_manager: { "G-1": {}, "AW-123456789": {} } } });
  const attribution = (url) => {
    const page = loadPage();
    page.window.fetch(url);
    const hit = page.debugState().networkHits[0];
    return [hit.tag, hit.tagId];
  };

  const table = [
    // GA4: tid=G- on /g/collect, any Google host (Google Signals sends to stats.g.doubleclick.net)
    ["https://www.google-analytics.com/g/collect?v=2&tid=G-FIXTURE123&en=page_view", "Google Analytics 4", "G-FIXTURE123"],
    ["https://region1.analytics.google.com/g/collect?tid=G-1", "Google Analytics 4", "G-1"],
    ["https://stats.g.doubleclick.net/g/collect?v=2&tid=G-1", "Google Analytics 4", "G-1"],
    // GA4 path or GA4-only host without a tid: still GA4, ID unknown
    ["https://region1.google-analytics.com/g/collect?en=page_view", "Google Analytics 4", null],
    // Google Ads: tid=AW- on /ccm/collect, or the numeric conversion ID in the path
    ["https://www.google.com/ccm/collect?tid=AW-123456789&en=page_view", "Google Ads", "AW-123456789"],
    ["https://pagead2.googlesyndication.com/ccm/collect?tid=AW-123456789&en=page_view", "Google Ads", "AW-123456789"],
    ["https://www.googleadservices.com/pagead/conversion/123456789/?label=abc&en=conversion", "Google Ads", "AW-123456789"],
    ["https://pagead2.googlesyndication.com/pagead/conversion/123456789/?en=conversion", "Google Ads", "AW-123456789"],
    ["https://googleads.g.doubleclick.net/pagead/viewthroughconversion/123456789/?en=gtag.config", "Google Ads", "AW-123456789"],
    ["https://www.google.com/rmkt/collect/123456789/?en=gtag.config", "Google Ads", "AW-123456789"],
    ["https://www.google.com/pagead/1p-user-list/123456789/?en=gtag.config", "Google Ads", "AW-123456789"],
    ["https://www.google.com/pagead/1p-conversion/123456789/?en=conversion", "Google Ads", "AW-123456789"],
    // Floodlight: tid=DC-, or src=<advertiser ID> in the activity URL
    ["https://pagead2.googlesyndication.com/ccm/collect?tid=DC-1234567&en=page_view", "Floodlight", "DC-1234567"],
    ["https://ad.doubleclick.net/activity;src=1234567;type=invmedia;cat=fixtu0;ord=1", "Floodlight", "DC-1234567"],
    ["https://1234567.fls.doubleclick.net/activityi;src=1234567;type=a;cat=b", "Floodlight", "DC-1234567"],
    ["https://ade.googlesyndication.com/ddm/activity/src=1234567;type=a;cat=b", "Floodlight", "DC-1234567"],
    ["https://adservice.google.com/ddm/fls/z/src=1234567;type=a;cat=b", "Floodlight", "DC-1234567"],
    // Loaders: the GTM container and gtag.js
    ["https://www.googletagmanager.com/gtm.js?id=GTM-ABC123", "Google Tag Manager", "GTM-ABC123"],
    ["https://www.googletagmanager.com/gtag/js?id=AW-123456789", "Google Ads", "AW-123456789"],
    // Not attributable: no tag ID and an endpoint several Google tags share
    ["https://ad.doubleclick.net/ccm/s/collect?gtm=45be6as1", null, null],
    ["https://www.google.com/ccm/collect?tid=GT-ABC123", null, null],
    ["https://www.googletagmanager.com/a?id=AW-123456789", null, null],
  ];
  for (const [url, tag, tagId] of table) {
    test(`${new URL(url).host}${new URL(url).pathname.split(";")[0]} → ${tag || "unattributed"}`, () => {
      assert.deepEqual(attribution(url), [tag, tagId]);
    });
  }

  test("GA4 + Google Ads, ads denied and analytics granted: GA4 hits pass and are not counted against Ads", () => {
    const page = gaAndAds();
    ADS_DENIED(page);
    page.at(500).window.fetch(`${GA4}?tid=G-1&gcs=G101&en=page_view`);
    page.at(700).window.navigator.sendBeacon(`${GA4}?tid=G-1&gcs=G101&en=scroll`);
    page.finishLoading();
    const ga = page.verdict("Google Analytics 4");
    assert.deepEqual([ga.verdict, ga.requestCount, ga.preConsentCount], ["firing", 2, 0]);
    const ads = page.verdict("Google Ads");
    assert.deepEqual([ads.verdict, ads.requestCount, ads.preConsentCount], ["blocked", 0, 0]);
    assert.notEqual(computeVerdict(page.requestState()).status, "broken");
  });

  test("an Ads conversion sent while ad_storage is denied makes Google Ads a VIOLATION, and only Ads", () => {
    const page = gaAndAds();
    ADS_DENIED(page);
    page.at(500).window.fetch(`${GA4}?tid=G-1&gcs=G101&en=page_view`);
    // No consent signal, so not a cookieless ping (#34).
    page.at(1500).window.fetch("https://pagead2.googlesyndication.com/pagead/conversion/123456789/?en=conversion&label=abc");
    page.finishLoading();
    const ads = page.verdict("Google Ads");
    assert.deepEqual([ads.verdict, ads.requestCount, ads.preConsentCount, ads.firstPreConsentMs], ["violation", 1, 1, 1500]);
    assert.deepEqual(ads.hosts, ["pagead2.googlesyndication.com"]);
    assert.equal(page.verdict("Google Analytics 4").verdict, "firing");
    assert.equal(computeVerdict(page.requestState()).status, "broken");
  });

  test("GTM page with a GA4 tag: GA4 hits are judged against analytics_storage only, the container needs no consent", () => {
    const page = loadPage({
      scripts: [GTM_JS, `${GTAG_G}&cx=c&gtm=4e6as1`],
      globals: { google_tag_manager: { "GTM-ABC123": {}, "G-1": {} } },
    });
    ADS_DENIED(page);
    page.at(500).window.fetch(`${GA4}?tid=G-1&gcs=G101&en=page_view`);
    page.finishLoading();
    const gtm = page.verdict("Google Tag Manager");
    assert.deepEqual(gtm.consentTypes, []);
    assert.deepEqual([gtm.verdict, gtm.requestCount, gtm.preConsentCount], ["container", 0, 0]);
    assert.equal(page.verdict("Google Analytics 4").verdict, "firing");
    assert.notEqual(computeVerdict(page.requestState()).status, "broken");
  });

  test("GTM page whose GA4 tag sends directly: GA4 is detected from its own requests and judged", () => {
    const page = loadPage({ scripts: [GTM_JS], globals: { google_tag_manager: { "GTM-ABC123": {} } } });
    page.at(1).gtag("consent", "default", FULL_V2);
    page.at(400).window.fetch("https://www.google-analytics.com/g/collect?tid=G-9&en=page_view");
    page.finishLoading();
    assert.deepEqual(page.debugState().tags.map((t) => t.name), ["Google Analytics 4", "Google Tag Manager"]);
    const ga = page.verdict("Google Analytics 4");
    assert.deepEqual([ga.verdict, ga.preConsentCount, ga.deniedTypes], ["violation", 1, ["analytics_storage"]]);
    assert.equal(page.verdict("Google Tag Manager").verdict, "container");
  });

  test("a GTM page without a consent default still reports the container as running without consent controls", () => {
    const page = loadPage({ scripts: [GTM_JS], globals: { google_tag_manager: { "GTM-ABC123": {} } } }).finishLoading();
    assert.equal(page.verdict("Google Tag Manager").verdict, "no_consent_mode");
  });

  test("Floodlight is judged on its own requests, not on GA4 hits", () => {
    const page = loadPage({ scripts: [GTAG_G], globals: { google_tag_manager: { "G-1": {}, "DC-1234567": {} } } });
    ADS_DENIED(page);
    page.at(500).window.fetch(`${GA4}?tid=G-1&gcs=G101`);
    page.finishLoading();
    assert.deepEqual([page.verdict("Floodlight").verdict, page.verdict("Floodlight").requestCount], ["blocked", 0]);
    // No consent signals, so not cookieless pings (#34).
    page.at(900).window.fetch("https://ad.doubleclick.net/activity;src=1234567;type=a;cat=b");
    page.at(950).window.fetch("https://pagead2.googlesyndication.com/ccm/collect?tid=DC-1234567");
    const fl = page.verdict("Floodlight");
    assert.deepEqual([fl.verdict, fl.requestCount, fl.preConsentCount], ["violation", 2, 2]);
    assert.equal(page.verdict("Google Analytics 4").verdict, "firing");
  });

  test("an unattributable Google request is kept with a reason but changes no verdict", () => {
    const page = gaAndAds();
    ADS_DENIED(page);
    page.at(500).window.fetch(`${GA4}?tid=G-1&gcs=G101`);
    page.at(600).window.fetch("https://ad.doubleclick.net/ccm/s/collect?gtm=45be6as1&gcs=G101");
    page.finishLoading();
    const state = page.requestState();
    const hit = state.networkHits.find((h) => h.host === "ad.doubleclick.net");
    assert.equal(hit.tag, null);
    assert.match(hit.unattributedReason, /no tag ID/);
    assert.deepEqual(
      state.tagImpact.map((t) => [t.name, t.verdict, t.requestCount]),
      [["Google Analytics 4", "firing", 1], ["Google Ads", "blocked", 0]],
    );
    assert.notEqual(computeVerdict(state).status, "broken");
  });

  test("a loader request is attributed to its tag but never judged", () => {
    const page = gaAndAds();
    page.at(1).gtag("consent", "default", FULL_V2);
    page.at(5).window.fetch("https://www.googletagmanager.com/gtag/js?id=AW-123456789");
    page.finishLoading();
    const hit = page.requestState().networkHits[0];
    assert.deepEqual([hit.tag, hit.tagId, hit.loader], ["Google Ads", "AW-123456789", true]);
    const ads = page.verdict("Google Ads");
    assert.deepEqual([ads.verdict, ads.requestCount], ["blocked", 0]);
  });

  test("non-Google vendors are still attributed by vendor host", () => {
    const page = loadPage({ globals: { fbq() {} } });
    page.window.fetch("https://www.facebook.com/tr?ev=PageView");
    assert.deepEqual(attribution("https://www.facebook.com/tr?ev=PageView"), ["Facebook Pixel", null]);
  });
});

// #34: under advanced Consent Mode Google's tags send cookieless pings while consent is denied
// (Google Ads Help 10000067). Requests below are the ones real gtag.js sent in Chromium.
describe("cookieless pings under advanced Consent Mode (#34)", () => {
  const ADS_PING = "https://pagead2.googlesyndication.com/ccm/collect?tid=AW-123456789&en=page_view&rnd=662018345.1793382932&npa=1&gcs=G101&gcd=13p3r3p3p5l1";
  const ADS_CONV = "https://pagead2.googlesyndication.com/pagead/conversion/123456789/?en=conversion&label=FixtureLabel&gcs=G101&gcd=13p3r3p3p5l1";
  const GA4_DENIED = `${GA4}?v=2&tid=G-1&cid=943277194.1793382938&sid=1793382937&gcs=G100&gcd=13p3p3p3p5l1&en=page_view`;
  const gaAndAds = () => loadPage({ globals: { google_tag_manager: { "G-1": {}, "AW-123456789": {} } } });
  const adsDenied = (page) => {
    page.at(1).gtag("consent", "default", FULL_V2);
    page.at(2).gtag("consent", "update", { analytics_storage: "granted" });
  };

  test("Google Ads' pings with ad_storage denied in gcs and no cookie ID are cookieless pings, not violations", () => {
    const page = gaAndAds();
    adsDenied(page);
    page.at(500).window.fetch(ADS_PING);
    page.at(1500).window.fetch(ADS_CONV);
    page.finishLoading();
    const ads = page.verdict("Google Ads");
    assert.equal(ads.verdict, "cookieless");
    assert.deepEqual(
      [ads.requestCount, ads.preConsentCount, ads.cookielessCount, ads.firstCookielessMs],
      [2, 0, 2, 500],
    );
    assert.deepEqual(ads.cookielessTypes, ["ad_storage", "ad_user_data", "ad_personalization"]);
    assert.deepEqual(ads.deniedTypes, []);
    assert.equal(computeVerdict(page.requestState()).status, "review");
  });

  test("a GA4 hit with analytics_storage denied in gcs is a cookieless ping; its random cid is not a cookie ID", () => {
    const page = loadPage({ scripts: ["https://www.googletagmanager.com/gtag/js?id=G-1"] });
    page.at(1).gtag("consent", "default", FULL_V2);
    page.at(300).window.fetch(GA4_DENIED);
    page.finishLoading();
    const ga = page.verdict("Google Analytics 4");
    assert.deepEqual([ga.verdict, ga.cookielessCount, ga.preConsentCount], ["cookieless", 1, 0]);
    assert.deepEqual(ga.cookielessTypes, ["analytics_storage"]);
  });

  const stillViolations = [
    // [why, url, reason]
    ["it carried no consent signal", "https://pagead2.googlesyndication.com/ccm/collect?tid=AW-123456789&en=page_view", "no_signal"],
    ["its gcs claimed ad_storage granted", "https://pagead2.googlesyndication.com/ccm/collect?tid=AW-123456789&gcs=G111", "claimed_granted"],
    ["its gcd claimed ad_user_data granted", "https://pagead2.googlesyndication.com/ccm/collect?tid=AW-123456789&gcs=G101&gcd=13p3r3t3p5l1", "claimed_granted"],
    ["it carried auid, the _gcl_au cookie value", `${ADS_PING}&auid=1192308007.1793382921`, "cookie_id"],
    ["it carried gclaw, the _gcl_aw cookie value", `${ADS_PING}&gclaw=TESTGCLID`, "cookie_id"],
    ["it carried auiddc", `${ADS_PING}&auiddc=1192308007.1793382921`, "cookie_id"],
  ];
  for (const [why, url, reason] of stillViolations) {
    test(`a Google Ads request sent while ad_storage was denied stays a VIOLATION when ${why}`, () => {
      const page = gaAndAds();
      adsDenied(page);
      page.at(500).window.fetch(url);
      page.finishLoading();
      const ads = page.verdict("Google Ads");
      assert.deepEqual([ads.verdict, ads.preConsentCount, ads.cookielessCount], ["violation", 1, 0]);
      assert.deepEqual(ads.violationReasons, [reason]);
      assert.equal(page.requestState().networkHits[0].judgement.reason, reason);
    });
  }

  test("a click ID in the page URL is not a cookie ID: Google sends full URLs while ad_storage is denied", () => {
    const page = gaAndAds();
    adsDenied(page);
    page.at(500).window.fetch(`${ADS_PING}&gclid=TESTGCLID&dl=https%3A%2F%2Fshop.example%2F%3Fgclid%3DTESTGCLID`);
    page.finishLoading();
    assert.equal(page.verdict("Google Ads").verdict, "cookieless");
  });

  test("with ad_storage granted and only ad_user_data denied, the request used cookies: still a VIOLATION", () => {
    const page = gaAndAds();
    page.at(1).gtag("consent", "default", { ...FULL_V2, ad_storage: "granted", analytics_storage: "granted" });
    page.at(500).window.fetch("https://www.google.com/ccm/collect?tid=AW-123456789&gcs=G111&gcd=13t3t3p3p5l1");
    page.finishLoading();
    const ads = page.verdict("Google Ads");
    assert.deepEqual([ads.verdict, ads.deniedTypes, ads.violationReasons], ["violation", ["ad_user_data", "ad_personalization"], ["storage_granted"]]);
  });

  test("other vendors have no Consent Mode: their requests while denied stay violations", () => {
    const page = loadPage({ globals: { fbq() {} } });
    page.at(1).gtag("consent", "default", FULL_V2);
    page.at(500).window.fetch("https://www.facebook.com/tr?ev=PageView&gcs=G100");
    page.finishLoading();
    const fb = page.verdict("Facebook Pixel");
    assert.deepEqual([fb.verdict, fb.violationReasons], ["violation", ["no_consent_mode"]]);
  });

  test("a tag with a violation and cookieless pings is a VIOLATION that counts both", () => {
    const page = gaAndAds();
    adsDenied(page);
    page.at(500).window.fetch(ADS_PING);
    page.at(700).window.fetch(`${ADS_PING}&auid=1.2`);
    page.finishLoading();
    const ads = page.verdict("Google Ads");
    assert.deepEqual(
      [ads.verdict, ads.requestCount, ads.preConsentCount, ads.firstPreConsentMs, ads.cookielessCount],
      ["violation", 2, 1, 700, 1],
    );
  });

  test("each request sent while denied is marked as a cookieless ping or a violation; others are not marked", () => {
    const page = gaAndAds();
    adsDenied(page);
    page.at(400).window.fetch(`${GA4}?tid=G-1&gcs=G101`);
    page.at(500).window.fetch(ADS_PING);
    page.at(600).window.fetch("https://pagead2.googlesyndication.com/ccm/collect?tid=AW-123456789");
    page.finishLoading();
    const hits = page.requestState().networkHits;
    assert.equal(hits[0].judgement, null);
    assert.deepEqual(hits[1].judgement, {
      result: "cookieless",
      types: ["ad_storage", "ad_user_data", "ad_personalization"],
      reason: null,
    });
    assert.deepEqual(hits[2].judgement, {
      result: "violation",
      types: ["ad_storage", "ad_user_data", "ad_personalization"],
      reason: "no_signal",
    });
  });

  test("only the names of cookie ID parameters are recorded, never their values", () => {
    const page = gaAndAds();
    page.window.fetch(`${ADS_PING}&auid=1192308007.1793382921&gclaw=TESTGCLID`);
    const hit = page.debugState().networkHits[0];
    assert.deepEqual(hit.cookieIds, ["auid", "gclaw"]);
    assert.doesNotMatch(JSON.stringify(hit), /1192308007|TESTGCLID/);
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
    // No gcs: not cookieless pings (#34).
    page.window.fetch(GA4);
    page.window.navigator.sendBeacon(GA4);
    page.finishLoading();
    assert.deepEqual(page.verdict("Google Analytics 4"), {
      name: "Google Analytics 4",
      type: "analytics",
      vendor: "google",
      consentTypes: ["analytics_storage"],
      requestCount: 2,
      preConsentCount: 2,
      firstPreConsentMs: 0,
      deniedTypes: ["analytics_storage"],
      violationReasons: ["no_signal"],
      cookielessCount: 0,
      firstCookielessMs: null,
      firstCookielessGcs: null,
      cookielessTypes: [],
      hosts: ["region1.google-analytics.com"],
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
    page.window.fetch(`${GA4}?gcs=G101`);
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

  test("a request sent while denied stays a VIOLATION after consent is granted", () => {
    const page = withGA4();
    page.at(1).gtag("consent", "default", FULL_V2);
    page.at(20).window.fetch(GA4);
    page.at(900).gtag("consent", "update", { analytics_storage: "granted" });
    page.at(950).window.fetch(GA4);
    page.finishLoading();
    const v = page.verdict("Google Analytics 4");
    assert.equal(v.verdict, "violation");
    assert.equal(v.requestCount, 2);
    assert.equal(v.preConsentCount, 1);
  });

  test("requests sent only after the grant are FIRING", () => {
    const page = withGA4();
    page.at(1).gtag("consent", "default", FULL_V2);
    page.at(900).gtag("consent", "update", { analytics_storage: "granted" });
    page.at(950).window.fetch(`${GA4}?gcs=G101`);
    page.finishLoading();
    const v = page.verdict("Google Analytics 4");
    assert.equal(v.verdict, "firing");
    assert.equal(v.preConsentCount, 0);
  });

  test("requests sent while granted are not violations after consent is withdrawn", () => {
    const page = withGA4();
    page.at(1).gtag("consent", "default", { analytics_storage: "granted" });
    page.at(20).window.fetch(GA4);
    page.at(900).gtag("consent", "update", { analytics_storage: "denied" });
    page.finishLoading();
    const v = page.verdict("Google Analytics 4");
    assert.equal(v.verdict, "blocked");
    assert.equal(v.requestCount, 1);
    assert.equal(v.preConsentCount, 0);
  });

  test("judges each vendor against the consent types it needs at the time of each request", () => {
    const page = loadPage({
      scripts: ["https://www.googletagmanager.com/gtag/js?id=G-1"],
      globals: { fbq() {}, hj() {} },
    });
    page.at(1).gtag("consent", "default", FULL_V2);
    page.at(10).window.fetch("https://www.facebook.com/tr?ev=PageView"); // ad_storage denied
    page.at(500).gtag("consent", "update", { analytics_storage: "granted" });
    page.at(600).window.fetch(`${GA4}?gcs=G101`); // analytics granted by now
    page.at(700).window.navigator.sendBeacon("https://www.facebook.com/tr?ev=ViewContent"); // still denied
    page.at(800).gtag("consent", "update", { ad_storage: "granted" });
    page.at(850).window.fetch("https://www.facebook.com/tr?ev=Purchase"); // granted
    page.finishLoading();
    const fb = page.verdict("Facebook Pixel");
    assert.deepEqual([fb.verdict, fb.requestCount, fb.preConsentCount], ["violation", 3, 2]);
    const ga = page.verdict("Google Analytics 4");
    assert.deepEqual([ga.verdict, ga.requestCount, ga.preConsentCount], ["firing", 1, 0]);
    const hj = page.verdict("Hotjar");
    assert.deepEqual([hj.verdict, hj.requestCount, hj.preConsentCount], ["idle", 0, 0]);
  });

  test("uses the request's own GCS when the consent type was not set yet in the timeline", () => {
    const page = withGA4();
    page.at(5).window.fetch(`${GA4}?gcs=G100`); // before any default reached dataLayer
    page.at(9).gtag("consent", "default", FULL_V2);
    page.at(900).gtag("consent", "update", { analytics_storage: "granted" });
    page.finishLoading();
    // Denied by its own gcs, which also makes it a cookieless ping (#34).
    const v = page.verdict("Google Analytics 4");
    assert.deepEqual([v.verdict, v.cookielessCount, v.preConsentCount], ["cookieless", 1, 0]);
  });

  test("uses gcs when the request's gcd letter for that type is undocumented (#32)", () => {
    const page = withGA4();
    page.at(5).window.fetch(`${GA4}?gcs=G100&gcd=13p3z3p3p5l1`); // before any default; gcd letter z unknown
    page.at(9).gtag("consent", "default", FULL_V2);
    page.at(900).gtag("consent", "update", { analytics_storage: "granted" });
    page.finishLoading();
    // Denied by its own gcs, which also makes it a cookieless ping (#34).
    const v = page.verdict("Google Analytics 4");
    assert.deepEqual([v.verdict, v.cookielessCount], ["cookieless", 1]);
  });

  test("the timeline wins over a request's own GCS when both are known", () => {
    // gcs lags the update by one request; the page had already granted.
    const page = withGA4();
    page.at(1).gtag("consent", "default", FULL_V2);
    page.at(500).gtag("consent", "update", { analytics_storage: "granted" });
    page.at(501).window.fetch(`${GA4}?gcs=G100`);
    page.finishLoading();
    assert.equal(page.verdict("Google Analytics 4").verdict, "firing");
  });

  test("records consent at the moment of each captured request", () => {
    const page = withGA4();
    page.at(1).gtag("consent", "default", { analytics_storage: "denied", wait_for_update: 500 });
    page.at(20).window.fetch(`${GA4}?gcs=G100`);
    page.at(900).gtag("consent", "update", { analytics_storage: "granted" });
    page.at(950).window.fetch(`${GA4}?gcs=G101&gcd=13p3t`);
    page.finishLoading();
    const hits = page.requestState().networkHits;
    assert.deepEqual(hits[0].consentAtRequest, { analytics_storage: "denied" });
    assert.deepEqual(hits[0].requestConsent, { analytics_storage: "denied", ad_storage: "denied" });
    assert.deepEqual(hits[1].consentAtRequest, { analytics_storage: "granted" });
    assert.deepEqual(hits[1].requestConsent, { ad_storage: "denied", analytics_storage: "granted" });
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

  test("answers with rules evaluated now, not at the last 3-second pass (#22)", () => {
    // The verified popup fixture: the update and the GA4 hit land after the 500 ms
    // detection pass, and the popup is opened before the next periodic pass.
    const page = loadPage({ globals: { OneTrust: {} } });
    page.at(60).gtag("consent", "default", { ...FULL_V2, wait_for_update: 500 });
    page.at(120).push(["config", "G-1"]);
    page.finishLoading();
    page.at(700).gtag("consent", "update", { analytics_storage: "granted" });
    page.at(800).window.fetch(`${GA4}?gcs=G101&en=page_view`);
    const state = page.requestState();
    assert.equal(state.validation.find((r) => r.id === "consent-update-received").status, "pass");
    assert.equal(computeVerdict(state).status, "verified");
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
