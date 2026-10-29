// Consent Mode command capture in injected.js: what gets recorded when a page issues
// consent defaults/updates, config calls and other dataLayer events.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { loadPage } from "./helpers/page.mjs";

const types = (page) => page.debugState().timeline.map((e) => e.type);

describe("consent default capture", () => {
  test("records a gtag('consent', 'default') call with its timestamp and settings", () => {
    const page = loadPage();
    page.at(12.5).gtag("consent", "default", {
      ad_storage: "denied",
      analytics_storage: "denied",
      wait_for_update: 500,
    });
    const state = page.debugState();
    assert.equal(state.consentDefaults.ms, 12.5);
    assert.deepEqual(state.consentDefaults.settings, {
      ad_storage: "denied",
      analytics_storage: "denied",
      wait_for_update: 500,
    });
    assert.deepEqual(types(page), ["consent_default"]);
    assert.equal(state.timeline[0].source, "dataLayer.push");
  });

  test("records an array-form dataLayer.push(['consent', 'default', ...])", () => {
    const page = loadPage();
    page.push(["consent", "default", { ad_storage: "granted" }]);
    assert.deepEqual(page.debugState().currentConsent, { ad_storage: "granted" });
  });

  test("records an arguments-object push, the form the standard gtag snippet produces", () => {
    const page = loadPage();
    (function () {
      page.push(arguments);
    })("consent", "default", { analytics_storage: "denied" });
    assert.deepEqual(page.debugState().consentDefaults.settings, { analytics_storage: "denied" });
  });

  test("replays consent commands already in dataLayer before the extension loaded", () => {
    const page = loadPage({
      dataLayer: [["consent", "default", { ad_storage: "denied" }], { event: "page_view" }],
    });
    const state = page.debugState();
    assert.deepEqual(state.currentConsent, { ad_storage: "denied" });
    assert.deepEqual(
      state.timeline.map((e) => [e.type, e.source]),
      [
        ["consent_default", "dataLayer.existing"],
        ["datalayer_event", "dataLayer.existing"],
      ],
    );
  });

  test("keeps the first default as the effective one and does not let a later default override it", () => {
    const page = loadPage();
    page.at(1).gtag("consent", "default", { ad_storage: "denied" });
    page.at(2).gtag("consent", "default", { ad_storage: "granted", analytics_storage: "granted" });
    const state = page.debugState();
    assert.deepEqual(state.consentDefaults.settings, { ad_storage: "denied" });
    // New keys from the second default are applied, existing ones are not overwritten.
    assert.deepEqual(state.currentConsent, { ad_storage: "denied", analytics_storage: "granted" });
    assert.deepEqual(types(page), ["consent_default", "consent_default"]);
  });

  test("does not treat wait_for_update as a consent type", () => {
    const page = loadPage();
    page.gtag("consent", "default", { ad_storage: "denied", wait_for_update: 2000 });
    assert.deepEqual(page.debugState().currentConsent, { ad_storage: "denied" });
  });
});

describe("consent update capture", () => {
  test("merges each update into the current consent state, in order", () => {
    const page = loadPage();
    page.at(1).gtag("consent", "default", { ad_storage: "denied", analytics_storage: "denied" });
    page.at(50).gtag("consent", "update", { analytics_storage: "granted" });
    page.at(80).gtag("consent", "update", { ad_storage: "granted", analytics_storage: "denied" });
    const state = page.debugState();
    assert.deepEqual(state.currentConsent, { ad_storage: "granted", analytics_storage: "denied" });
    assert.deepEqual(
      state.consentUpdates.map((u) => u.ms),
      [50, 80],
    );
    assert.deepEqual(types(page), ["consent_default", "consent_update", "consent_update"]);
  });

  test("an update issued before any default wins in the merged state and is reported as a race", () => {
    const page = loadPage();
    page.at(5).gtag("consent", "update", { ad_storage: "granted" });
    page.at(9).gtag("consent", "default", { ad_storage: "denied", analytics_storage: "denied" });
    const state = page.debugState();
    assert.deepEqual(state.currentConsent, { ad_storage: "granted", analytics_storage: "denied" });
    assert.equal(state.consentDefaults.ms, 9);
    assert.equal(state.consentUpdates[0].ms, 5);
    page.finishLoading();
    assert.equal(page.rule("default-before-update").status, "fail");
  });

  test("ignores consent commands other than default and update in arguments-object form", () => {
    const page = loadPage();
    (function () {
      page.push(arguments);
    })("consent", "revoke", { ad_storage: "denied" });
    const state = page.debugState();
    assert.equal(state.consentDefaults, null);
    assert.deepEqual(state.currentConsent, {});
  });
});

describe("dataLayer interception", () => {
  test("still captures pushes after GTM replaces dataLayer.push, and calls GTM's push", () => {
    const page = loadPage();
    const gtmSeen = [];
    page.window.dataLayer.push = function (entry) {
      gtmSeen.push(entry);
      return "gtm";
    };
    const result = page.push(["consent", "update", { ad_storage: "granted" }]);
    assert.equal(result, "gtm");
    assert.equal(gtmSeen.length, 1);
    assert.deepEqual(page.debugState().currentConsent, { ad_storage: "granted" });
  });

  test("survives a replacement push that chains to the previous one (gtag.js pattern)", () => {
    // gtag.js keeps the push it found and calls it from its own push. Before the fix, the
    // setter re-pointed the original wrapper at the new push, so the two called each other
    // forever: RangeError: Maximum call stack size exceeded on any page with gtag.js.
    const page = loadPage();
    const dl = page.window.dataLayer;
    const previous = dl.push;
    let gtagCalls = 0;
    dl.push = function () {
      gtagCalls++;
      return previous.apply(dl, arguments);
    };
    page.push(["consent", "update", { ad_storage: "granted" }]);
    assert.equal(gtagCalls, 1);
    assert.equal(dl.length, 1, "entry reaches the array exactly once");
    assert.deepEqual(page.debugState().currentConsent, { ad_storage: "granted" });
    assert.equal(types(page).filter((t) => t === "consent_update").length, 1, "captured once");
  });

  test("survives two chained replacements (GTM then gtag.js)", () => {
    const page = loadPage();
    const dl = page.window.dataLayer;
    const calls = [];
    for (const name of ["gtm", "gtag"]) {
      const previous = dl.push;
      dl.push = function () {
        calls.push(name);
        return previous.apply(dl, arguments);
      };
    }
    page.push({ event: "purchase" });
    assert.deepEqual(calls, ["gtag", "gtm"]);
    assert.equal(dl.length, 1);
    assert.equal(types(page).filter((t) => t === "datalayer_event").length, 1);
  });

  test("records a different entry pushed while a replacement push is forwarding", () => {
    // A replacement push that emits its own event while handling another must not lose it.
    const page = loadPage();
    const dl = page.window.dataLayer;
    const previous = dl.push;
    dl.push = function (entry) {
      if (entry && entry.event === "outer") previous.call(dl, { event: "nested" });
      return previous.apply(dl, arguments);
    };
    page.push({ event: "outer" });
    const names = page.debugState().timeline
      .filter((e) => e.type === "datalayer_event")
      .map((e) => e.detail.event);
    assert.deepEqual(names.sort(), ["nested", "outer"]);
  });

  test("passes pushes through to the real array", () => {
    const page = loadPage();
    page.push({ event: "a" }, { event: "b" });
    assert.equal(page.window.dataLayer.length, 2);
    assert.deepEqual(types(page), ["datalayer_event", "datalayer_event"]);
  });

  test("records gtm.js as GTM loaded and other events by name", () => {
    const page = loadPage();
    page.push({ event: "gtm.js" }, { event: "purchase" }, { not_an_event: true }, null, "string");
    const timeline = page.debugState().timeline;
    assert.deepEqual(
      timeline.map((e) => [e.type, e.detail]),
      [
        ["gtm_load", { event: "gtm.js" }],
        ["datalayer_event", { event: "purchase" }],
      ],
    );
  });

  test("survives entries that cannot be serialised (circular references)", () => {
    const page = loadPage();
    const settings = { ad_storage: "denied" };
    settings.self = settings;
    assert.doesNotThrow(() => page.gtag("consent", "default", settings));
    assert.equal(typeof page.window.__cfDebug.consentDefaults.settings, "string");
  });

  test("posts every recorded event to the content script as a cf-debug-injected message", () => {
    const page = loadPage();
    page.gtag("consent", "default", { ad_storage: "denied" });
    const events = page.posted.filter((m) => m.type === "event");
    assert.equal(events.length, 1);
    assert.equal(events[0].source, "cf-debug-injected");
    assert.equal(events[0].payload.type, "consent_default");
  });
});

describe("config call capture", () => {
  test("records gtag('config', id) with its time", () => {
    const page = loadPage();
    page.at(30).gtag("config", "G-ABC123");
    const state = page.debugState();
    assert.equal(state.configCalls[0].id, "G-ABC123");
    assert.equal(state.configCalls[0].ms, 30);
    assert.ok(types(page).includes("config"));
  });

  test("records an array-form config push", () => {
    const page = loadPage();
    page.push(["config", "AW-999"]);
    assert.deepEqual(
      page.debugState().configCalls.map((c) => c.id),
      ["AW-999"],
    );
  });

  test("records a config call through a gtag function the page defined itself", () => {
    const calls = [];
    const page = loadPage({
      globals: {
        gtag() {
          calls.push([...arguments]);
        },
      },
    });
    page.gtag("config", "G-OWN");
    assert.deepEqual(calls, [["config", "G-OWN"]]);
    assert.equal(page.debugState().configCalls.length, 1);
    assert.deepEqual(
      page.debugState().configCalls.map((c) => c.id),
      ["G-OWN"],
    );
  });

  test("keeps capturing when the page later replaces window.gtag", () => {
    const page = loadPage();
    const calls = [];
    page.window.gtag = function () {
      calls.push([...arguments]);
    };
    page.gtag("config", "G-LATE");
    assert.deepEqual(calls, [["config", "G-LATE"]]);
    assert.ok(page.debugState().configCalls.some((c) => c.id === "G-LATE"));
  });

  test("records config once when the page defines the standard gtag snippet", () => {
    // The real snippet: function gtag(){dataLayer.push(arguments);} — the call reaches
    // dataLayer, so the gtag wrapper must not record it a second time.
    const page = loadPage();
    page.window.gtag = function () {
      page.window.dataLayer.push(arguments);
    };
    page.gtag("config", "G-SNIPPET");
    assert.deepEqual(
      page.debugState().configCalls.map((c) => c.id),
      ["G-SNIPPET"],
    );
  });

  test("still records a custom gtag that never pushes to dataLayer", () => {
    const page = loadPage();
    page.window.gtag = function () {};
    page.gtag("config", "G-CUSTOM");
    assert.deepEqual(
      page.debugState().configCalls.map((c) => c.id),
      ["G-CUSTOM"],
    );
  });

  test("records a single config call made through the gtag trap once", () => {
    const page = loadPage();
    page.gtag("config", "G-ONCE");
    assert.equal(page.debugState().configCalls.length, 1);
  });

  test("forwards trap gtag() calls to dataLayer when the page has no gtag yet", () => {
    const page = loadPage();
    page.gtag("event", "sign_up");
    assert.equal(page.window.dataLayer.length, 1);
    assert.equal(page.window.dataLayer[0][0], "event");
  });
});
