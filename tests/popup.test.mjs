// popup/popup.js: how the state from the page is fetched, classified and rendered.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { loadPage } from "./helpers/page.mjs";
import { loadPopup, modifiers, texts } from "./helpers/popup-dom.mjs";

const rule = (id, status, extra = {}) => ({
  id,
  name: `Rule ${id}`,
  description: `About ${id}`,
  detail: `Detail ${id}`,
  status,
  ...extra,
});

const impact = (name, verdict, extra = {}) => ({
  name,
  type: "analytics",
  vendor: "google",
  consentTypes: ["analytics_storage"],
  requestCount: 0,
  verdict,
  ...extra,
});

const baseState = (overrides = {}) => ({
  ready: true,
  timeline: [],
  validation: [],
  networkHits: [],
  currentConsent: {},
  tags: [],
  tagImpact: [],
  cmp: { name: "None", detected: false },
  ...overrides,
});

const show = (state) => loadPopup({ responses: [state] });

describe("fetching state", () => {
  test("asks the active tab's content script for state and renders the reply", () => {
    const popup = show(baseState());
    assert.deepEqual(popup.calls.sendMessage, [{ tabId: 7, message: { action: "getState" } }]);
    assert.equal(popup.el("headerStatus").textContent, "No issues detected");
  });

  test("shows 'Analyzing page...' while the page has not finished its first pass", () => {
    const popup = show({ ready: false });
    assert.equal(popup.el("headerStatus").textContent, "Analyzing page...");
    assert.equal(popup.el("headerStatus").className, "header-status loading");
  });

  test("when the content script does not answer, asks the background to inject it and retries after 2.5 s", () => {
    const popup = loadPopup({ responses: [undefined, baseState()] });
    assert.deepEqual(popup.calls.runtime, [{ action: "ensureContentScript", tabId: 7 }]);
    assert.deepEqual(
      popup.timeouts.map((t) => t.ms),
      [2500],
    );
    popup.runTimeouts();
    assert.equal(popup.calls.sendMessage.length, 2);
    assert.equal(popup.el("headerStatus").textContent, "No issues detected");
  });

  test("reports an error when the content script still does not answer", () => {
    const popup = loadPopup({ responses: [undefined, undefined] });
    popup.runTimeouts();
    assert.equal(popup.el("headerStatus").textContent, "Content script not responding. Try refreshing the page.");
    assert.equal(popup.el("headerStatus").className, "header-status error");
  });

  test("reports when there is no active tab", () => {
    const popup = loadPopup({ tabs: [] });
    assert.equal(popup.el("headerStatus").textContent, "No active tab");
  });

  test("refreshes every 4 seconds and on the Refresh button", () => {
    const popup = show(baseState());
    assert.deepEqual(
      popup.intervals.map((i) => i.ms),
      [4000],
    );
    popup.refresh(baseState({ validation: [rule("a", "fail")] }));
    assert.equal(popup.el("headerStatus").textContent, "1 issue found");
    popup.el("refreshBtn").click();
    assert.equal(popup.calls.sendMessage.length, 3);
  });
});

describe("header and scorecard", () => {
  test("counts failed rules as issues", () => {
    const popup = show(baseState({ validation: [rule("a", "fail"), rule("b", "fail"), rule("c", "warn")] }));
    assert.equal(popup.el("headerStatus").textContent, "2 issues found");
    assert.equal(popup.el("headerStatus").className, "header-status error");
  });

  test("shows warnings when nothing failed", () => {
    const popup = show(baseState({ validation: [rule("a", "warn"), rule("b", "pass")] }));
    assert.equal(popup.el("headerStatus").textContent, "1 warning");
    assert.equal(popup.el("headerStatus").className, "header-status warn");
  });

  test("info results are neither issues nor warnings", () => {
    const popup = show(baseState({ validation: [rule("a", "info"), rule("b", "pass")] }));
    assert.equal(popup.el("headerStatus").className, "header-status ok");
  });

  test("scores rules passed, tags, hits and CMP", () => {
    const popup = show(
      baseState({
        validation: [rule("a", "pass"), rule("b", "pass"), rule("c", "info")],
        tags: [{}, {}],
        networkHits: [{}, {}, {}],
        cmp: { name: "OneTrust", detected: true },
      }),
    );
    const score = (id) => [popup.el(id).querySelector(".score-num").textContent, popup.el(id).className];
    assert.deepEqual(score("scoreRules"), ["2/3", "score-item good"]);
    assert.deepEqual(score("scoreTags"), ["2", "score-item"]);
    assert.deepEqual(score("scoreHits"), ["3", "score-item"]);
    assert.deepEqual(score("scoreCMP"), ["OneTrust", "score-item good"]);
  });

  test("marks rules bad on any failure and tags bad on any violation", () => {
    const popup = show(
      baseState({
        validation: [rule("a", "fail"), rule("b", "pass")],
        tags: [{}],
        tagImpact: [impact("GA4", "violation")],
      }),
    );
    assert.equal(popup.el("scoreRules").className, "score-item bad");
    assert.equal(popup.el("scoreTags").className, "score-item bad");
    assert.equal(popup.el("scoreCMP").querySelector(".score-num").textContent, "None");
  });
});

describe("Flow tab", () => {
  test("shows consent, config, GTM and network events and summarises the rest", () => {
    const popup = show(
      baseState({
        timeline: [
          { type: "consent_default", ms: 1.5, detail: { ad_storage: "denied", analytics_storage: "denied" } },
          { type: "datalayer_event", ms: 2, detail: { event: "scroll" } },
          { type: "config", ms: 3, detail: { measurementId: "G-1" } },
          { type: "gtm_load", ms: 4, detail: { event: "gtm.js" } },
          { type: "network_hit", ms: 5, detail: { host: "www.google-analytics.com", gcs: "G100", en: "page_view" } },
          { type: "consent_update", ms: 6, detail: { analytics_storage: "granted" } },
        ],
      }),
    );
    const html = popup.html("timeline");
    assert.deepEqual(texts(html, "tl-label"), [
      "CONSENT DEFAULT",
      "CONFIG",
      "GTM LOADED",
      "NETWORK HIT",
      "CONSENT UPDATE",
    ]);
    assert.deepEqual(modifiers(html, "tl-event"), ["consent", "config", "gtm", "network", "consent"]);
    assert.deepEqual(texts(html, "tl-time"), ["1.5ms", "3ms", "4ms", "5ms", "6ms"]);
    assert.match(html, /<div class="tl-detail">ad_storage: denied, analytics_storage: denied<\/div>/);
    assert.match(html, /<div class="tl-detail">www\.google-analytics\.com \| GCS=G100 \| event=page_view<\/div>/);
    assert.match(html, /1 other dataLayer events/);
  });

  test("falls back to plain dataLayer events when there are no consent-related ones", () => {
    const popup = show(baseState({ timeline: [{ type: "datalayer_event", ms: 1, detail: { event: "scroll" } }] }));
    assert.deepEqual(texts(popup.html("timeline"), "tl-label"), ["EVENT"]);
    assert.doesNotMatch(popup.html("timeline"), /other dataLayer events/);
  });

  test("shows an empty message when nothing was captured", () => {
    assert.match(show(baseState()).html("timeline"), /No consent flow events captured yet/);
  });

  test("escapes page-controlled strings", () => {
    const popup = show(
      baseState({ timeline: [{ type: "config", ms: 1, detail: { measurementId: "<img src=x onerror=alert(1)>" } }] }),
    );
    assert.match(popup.html("timeline"), /&lt;img src=x onerror=alert\(1\)&gt;/);
    assert.doesNotMatch(popup.html("timeline"), /<img/);
  });
});

describe("Rules tab", () => {
  test("renders every rule with its status badge, description and detail", () => {
    const popup = show(baseState({ validation: [rule("a", "pass"), rule("b", "warn"), rule("c", "info")] }));
    const html = popup.html("rulesList");
    assert.equal(modifiers(html, "rule-card").length, 3);
    assert.deepEqual(texts(html, "rule-badge").sort(), ["INFO", "PASS", "WARN"]);
    assert.deepEqual(texts(html, "rule-icon").sort(), ["INFO", "PASS", "WARN"]);
    assert.match(html, /<div class="rule-desc">About a<\/div>/);
    assert.match(html, /<div class="rule-detail">Detail b<\/div>/);
  });

  test("orders warnings, then info, then passes", () => {
    const popup = show(baseState({ validation: [rule("p", "pass"), rule("i", "info"), rule("w", "warn")] }));
    assert.deepEqual(modifiers(popup.html("rulesList"), "rule-card"), ["warn", "info", "pass"]);
  });

  test("lists failed rules first", () => {
    const popup = show(baseState({ validation: [rule("p", "pass"), rule("w", "warn"), rule("f", "fail")] }));
    assert.deepEqual(modifiers(popup.html("rulesList"), "rule-card"), ["fail", "warn", "pass"]);
  });

  test("escapes rule text", () => {
    const popup = show(baseState({ validation: [rule("a", "fail", { detail: 'CMP (<b>"x"</b>)' })] }));
    assert.match(popup.html("rulesList"), /CMP \(&lt;b&gt;"x"&lt;\/b&gt;\)/);
  });
});

describe("Network tab", () => {
  test("shows decoded GCS, GCD and NPA for a Google request", () => {
    const popup = show(
      baseState({
        networkHits: [
          {
            method: "beacon",
            vendor: "google",
            host: "region1.google-analytics.com",
            ms: 12.7,
            en: "page_view",
            tid: "G-1",
            decoded: {
              gcs: { raw: "G110", analytics_storage: "granted", ad_storage: "denied" },
              gcd: { raw: "13e1p", ad_storage: "granted (updated)", analytics_storage: "denied (default)" },
              npa: "personalized",
            },
          },
        ],
      }),
    );
    const html = popup.html("networkList");
    assert.deepEqual(texts(html, "net-method"), ["beacon"]);
    assert.deepEqual(texts(html, "net-vendor"), ["Google"]);
    assert.deepEqual(texts(html, "net-time"), ["13ms"]);
    assert.deepEqual(texts(html, "net-key"), [
      "Event",
      "Tracking ID",
      "analytics_storage",
      "ad_storage",
      "raw",
      "ad_storage",
      "analytics_storage",
      "raw",
      "NPA",
    ]);
    assert.match(html, /<span class="net-val granted">granted<\/span>/);
    assert.match(html, /<span class="net-val denied">denied<\/span>/);
    assert.match(html, /<span class="net-val">granted \(updated\)<\/span>/);
  });

  test("shows the consent state at the moment each request was sent", () => {
    const popup = show(
      baseState({
        networkHits: [
          {
            method: "fetch",
            vendor: "facebook",
            host: "www.facebook.com",
            ms: 10,
            decoded: {},
            consentAtRequest: { ad_storage: "denied", analytics_storage: "<b>granted</b>" },
          },
          { method: "fetch", vendor: "facebook", host: "www.facebook.com", ms: 1, decoded: {}, consentAtRequest: {} },
        ],
      }),
    );
    const html = popup.html("networkList");
    assert.deepEqual(texts(html, "net-key"), ["Consent when sent", "Consent when sent"]);
    assert.match(html, /<span class="net-val">ad_storage: denied, analytics_storage: &lt;b&gt;granted&lt;\/b&gt;<\/span>/);
    assert.match(html, /<span class="net-val">none set yet<\/span>/);
  });

  test("hides GCS and GCD sections that failed to decode", () => {
    const popup = show(
      baseState({
        networkHits: [
          {
            method: "fetch",
            vendor: "google",
            host: "h",
            ms: 1,
            decoded: { gcs: { raw: "X", error: "unexpected format" }, gcd: { raw: "1", error: "too short" } },
          },
        ],
      }),
    );
    assert.doesNotMatch(popup.html("networkList"), /net-section/);
  });

  test("shows an empty message listing the tracked vendors", () => {
    assert.match(show(baseState()).html("networkList"), /No vendor requests captured yet/);
  });
});

describe("State tab", () => {
  test("lists consent types with their values, leaving out wait_for_update and region", () => {
    const popup = show(
      baseState({
        currentConsent: { ad_storage: "denied", analytics_storage: "granted", wait_for_update: 500, region: ["DE"] },
      }),
    );
    const html = popup.html("consentGrid");
    assert.deepEqual(texts(html, "cs-key"), ["ad_storage", "analytics_storage"]);
    assert.deepEqual(modifiers(html, "cs-row"), ["denied", "granted"]);
  });

  test("escapes page-controlled consent type names and values as text", () => {
    const popup = show(baseState({ currentConsent: { "<i>key</i>": "<b>val</b>" } }));
    const html = popup.html("consentGrid");
    assert.match(html, /<span class="cs-key">&lt;i&gt;key&lt;\/i&gt;<\/span>/);
    assert.match(html, /<span class="cs-val">&lt;b&gt;val&lt;\/b&gt;<\/span>/);
  });

  test("says when no consent state was detected", () => {
    assert.match(show(baseState()).html("consentGrid"), /Consent Mode may not be implemented/);
  });

  test("shows the detected CMP", () => {
    const popup = show(baseState({ cmp: { name: "Cookiebot", detected: true } }));
    assert.equal(popup.el("cmpInfo").textContent, "Cookiebot");
    assert.equal(popup.el("cmpInfo").className, "cmp-info detected");
    assert.equal(show(baseState()).el("cmpInfo").textContent, "No CMP detected on this page.");
  });

  test("renders a card per tag with its verdict label, consent needs and request count", () => {
    const popup = show(
      baseState({
        tagImpact: [
          impact("Hotjar", "firing", { requestCount: 1 }),
          impact("Google Ads", "blocked", {
            type: "advertising",
            consentTypes: ["ad_storage", "ad_user_data"],
            requestCount: 0,
          }),
        ],
      }),
    );
    const html = popup.html("tagImpact");
    assert.deepEqual(texts(html, "ti-name").sort(), ["Google Ads", "Hotjar"]);
    assert.match(html, /<span class="ti-verdict blocked">BLOCKED<\/span>/);
    assert.match(html, /<span class="ti-verdict firing">FIRING<\/span>/);
    assert.match(html, /Needs: ad_storage, ad_user_data/);
    assert.match(html, /1 request captured/);
    assert.match(html, /0 requests captured/);
  });

  test("says how many requests were sent while consent was denied", () => {
    const popup = show(
      baseState({
        tagImpact: [
          impact("Facebook Pixel", "violation", { requestCount: 3, preConsentCount: 2 }),
          impact("Hotjar", "firing", { requestCount: 1, preConsentCount: 0 }),
        ],
      }),
    );
    const html = popup.html("tagImpact");
    assert.deepEqual(texts(html, "ti-preconsent"), ["2 sent while required consent was denied"]);
  });

  test("labels every verdict", () => {
    const verdicts = ["violation", "blocked", "firing", "idle", "no_consent_mode"];
    const popup = show(baseState({ tagImpact: verdicts.map((v) => impact(v, v)) }));
    assert.deepEqual(texts(popup.html("tagImpact"), "ti-verdict").sort(), [
      "BLOCKED",
      "FIRING",
      "IDLE",
      "NO CONSENT MODE",
      "VIOLATION",
    ]);
  });

  test("lists violations first", () => {
    const popup = show(baseState({ tagImpact: [impact("A", "firing"), impact("B", "violation")] }));
    assert.deepEqual(texts(popup.html("tagImpact"), "ti-name"), ["B", "A"]);
  });

  const grades = [
    [["violation", "firing"], "CRITICAL", "critical"],
    [["no_consent_mode", "no_consent_mode"], "NOT IMPLEMENTED", "not-implemented"],
    [["no_consent_mode", "blocked"], "PARTIAL", "partial"],
    [["blocked", "firing", "idle"], "GOOD", "good"],
  ];
  for (const [verdicts, grade, cls] of grades) {
    test(`grades ${verdicts.join(" + ")} as ${grade}`, () => {
      const popup = show(baseState({ tagImpact: verdicts.map((v, i) => impact(`t${i}`, v)) }));
      const html = popup.html("implQuality");
      assert.match(html, new RegExp(`<div class="impl-banner ${cls}">`));
      assert.deepEqual(texts(html, "impl-grade"), [grade]);
    });
  }

  test("shows no grade and an empty message without tags", () => {
    const popup = show(baseState());
    assert.equal(popup.html("implQuality"), "");
    assert.match(popup.html("tagImpact"), /No tracking tags detected/);
  });

  test("keeps page-controlled consent values out of HTML attributes", () => {
    const popup = show(baseState({ currentConsent: { ad_storage: '" onmouseover="x' } }));
    assert.doesNotMatch(popup.html("consentGrid"), /class="[^"]*"\s+onmouseover=/);
  });
});

describe("review call to action", () => {
  test("is hidden when nothing failed or warned", () => {
    const popup = show(baseState({ validation: [rule("a", "pass")], tagImpact: [impact("t", "firing")] }));
    assert.equal(popup.el("reviewCta").className, "review-cta hidden");
  });

  test("uses the critical variant for a consent violation", () => {
    const popup = show(baseState({ tagImpact: [impact("t", "violation")] }));
    assert.equal(popup.el("reviewCta").className, "review-cta critical");
    assert.equal(popup.el("reviewCtaLabel").textContent, "Need help fixing this consent violation?");
  });

  test("offers help for failed rules or tags without Consent Mode", () => {
    for (const state of [
      baseState({ validation: [rule("a", "fail")] }),
      baseState({ tagImpact: [impact("t", "no_consent_mode")] }),
    ]) {
      const popup = show(state);
      assert.equal(popup.el("reviewCta").className, "review-cta");
      assert.equal(popup.el("reviewCtaLabel").textContent, "Need help fixing this implementation?");
    }
  });

  test("offers a second look for warnings", () => {
    const popup = show(baseState({ validation: [rule("a", "warn")] }));
    assert.equal(popup.el("reviewCtaLabel").textContent, "Want a second set of eyes on these warnings?");
  });

  test("the button opens the review page in a new tab and sends nothing else", () => {
    const popup = show(baseState());
    popup.el("reviewCtaButton").click();
    assert.deepEqual(popup.calls.created, [{ url: "https://focosys.io/review" }]);
  });
});

describe("tabs", () => {
  test("clicking a tab shows its panel and hides the others", () => {
    const popup = show(baseState());
    const rulesTab = popup.tabs.find((t) => t.dataset.tab === "rules");
    rulesTab.click();
    assert.deepEqual(
      popup.tabs.filter((t) => t.classList.contains("active")).map((t) => t.dataset.tab),
      ["rules"],
    );
    assert.deepEqual(
      popup.panels.filter((p) => p.classList.contains("active")).map((p) => p.id),
      ["rules-tab"],
    );
  });
});

describe("page to popup", () => {
  test("renders the state injected.js reports for a page with a race condition and a violation", () => {
    const page = loadPage({ scripts: ["https://www.googletagmanager.com/gtag/js?id=G-1"] });
    page.at(10).push(["config", "G-1"]);
    page.at(60).gtag("consent", "default", {
      ad_storage: "denied",
      analytics_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
    });
    page.at(80).window.fetch("https://region1.google-analytics.com/g/collect?tid=G-1&gcs=G100&en=page_view");
    page.finishLoading();

    const popup = show(page.requestState());
    assert.equal(popup.el("headerStatus").textContent, "1 issue found");
    assert.match(popup.html("rulesList"), /RACE CONDITION: gtag\("config", "G-1"\) fired at 10ms but consent default was at 60ms/);
    assert.match(popup.html("tagImpact"), /<span class="ti-verdict violation">VIOLATION<\/span>/);
    assert.deepEqual(texts(popup.html("implQuality"), "impl-grade"), ["CRITICAL"]);
    assert.equal(popup.el("reviewCta").className, "review-cta critical");
    assert.match(popup.html("networkList"), /G100/);
  });

  test("shows an update that arrived before the default as a failed rule", () => {
    const page = loadPage();
    page.at(5).gtag("consent", "update", { ad_storage: "granted" });
    page.at(9).gtag("consent", "default", { ad_storage: "denied", analytics_storage: "denied" });
    page.finishLoading();

    const popup = show(page.requestState());
    const html = popup.html("rulesList");
    assert.match(
      html,
      /<span class="rule-name">Default Before Update<\/span><span class="rule-badge fail">FAIL<\/span>/,
    );
    assert.match(html, /RACE CONDITION: consent update at 5ms arrived before the consent default at 9ms/);
    assert.match(popup.el("headerStatus").textContent, /issues? found/);
  });

  test("keeps a request sent before the grant as a violation after the grant", () => {
    const page = loadPage({ globals: { fbq() {} } });
    page.at(1).gtag("consent", "default", {
      ad_storage: "denied",
      analytics_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
    });
    page.at(10).window.fetch("https://www.facebook.com/tr?ev=PageView");
    page.at(800).gtag("consent", "update", { ad_storage: "granted" });
    page.at(850).window.fetch("https://www.facebook.com/tr?ev=Purchase");
    page.finishLoading();

    const popup = show(page.requestState());
    const html = popup.html("tagImpact");
    assert.match(html, /<span class="ti-verdict violation">VIOLATION<\/span>/);
    assert.deepEqual(texts(html, "ti-preconsent"), ["1 sent while required consent was denied"]);
    assert.match(html, /2 requests captured/);
    assert.deepEqual(texts(popup.html("implQuality"), "impl-grade"), ["CRITICAL"]);
    assert.match(popup.html("networkList"), /ad_storage: denied/);
  });
});
