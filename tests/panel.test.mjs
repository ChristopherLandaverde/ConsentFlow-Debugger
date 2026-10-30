// sidepanel/panel.js: the trace beside the page. View states, the APG tabs, the timeline,
// requests and consent views, live refresh that keeps the user's place, following the
// active tab, and what is remembered in chrome.storage.session.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { loadPage } from "./helpers/page.mjs";
import { disclosures, loadPanel, loadPopup, newSession } from "./helpers/popup-dom.mjs";
import { FULL_V2, GA4, states } from "./helpers/states.mjs";

const VIEWS = ["findings", "timeline", "requests", "consent"];
const withHost = (state, host = "shop.example") => ({ ...state, page: { host } });
const open = (state, options = {}) => loadPanel({ responses: [withHost(state)], ...options });
const key = (panel, code) => panel.el("tablist").dispatch("keydown", { key: code, preventDefault() {} });
const clickTab = (panel, view) => panel.el("tablist").dispatch("click", { target: panel.el(`tab-${view}`) });
const selected = (panel) => VIEWS.filter((v) => panel.el(`tab-${v}`).getAttribute("aria-selected") === "true");

// A page whose Google request carried granted while the page had denied.
function mismatchState() {
  const page = loadPage({ globals: { Cookiebot: {} } });
  page.at(1).gtag("consent", "default", FULL_V2);
  page.at(10).push(["config", "G-1"]);
  page.at(40).window.fetch(`${GA4}?gcs=G111&gcd=13t3t3t3t5l1&en=page_view`);
  page.at(60).push({ event: "scroll" });
  return page.finishLoading().requestState();
}

describe("view states", () => {
  test("shows loading with a progress indicator until the page's first pass is done", () => {
    const panel = open({ ready: false });
    assert.equal(panel.el("verdict").getAttribute("data-state"), "loading");
    assert.equal(panel.el("progress").hidden, false);
    assert.equal(panel.el("content").hidden, true);
  });

  test("shows an error with a reload action where the trace would be when the tab never answers", () => {
    const panel = loadPanel({ responses: [undefined, undefined] });
    panel.runTimeouts();
    assert.equal(panel.el("verdict").getAttribute("data-state"), "error");
    assert.equal(panel.text("verdictTitle"), "Can't read this tab.");
    assert.equal(panel.el("errorAction").hidden, false);
    assert.equal(panel.el("content").hidden, true);
    panel.el("errorAction").click();
    assert.deepEqual(panel.calls.reloaded, [7]);
  });

  test("states the same verdict as the popup for the same page", () => {
    for (const make of [states.broken, states.zeroRequests, states.verified, states.review]) {
      const panel = open(make());
      const popup = loadPopup({ responses: [make()] });
      assert.equal(panel.text("verdictTitle"), popup.text("verdictTitle"));
      assert.equal(panel.text("verdictLabel"), popup.text("verdictLabel"));
    }
  });

  test("the verdict is a polite live region that only changes with the verdict", () => {
    const panel = open(states.broken());
    assert.equal(panel.el("verdict").getAttribute("aria-live"), "polite");
    assert.equal(panel.el("verdict").getAttribute("aria-atomic"), "true");
    const before = panel.text("verdictTitle");
    panel.refresh(withHost(states.broken()));
    assert.equal(panel.text("verdictTitle"), before);
    panel.refresh(withHost(states.verified()));
    assert.equal(panel.text("verdictTitle"), "Consent is wired correctly on this page.");
  });

  test("shows the page's host and when it was updated", () => {
    const panel = open(states.broken());
    assert.equal(panel.text("pageMeta"), "shop.example");
    assert.match(panel.text("checkedAt"), /^Updated \d\d:\d\d:\d\d · this page load$/);
  });

  test("goes back to loading when the tab starts a new page load", () => {
    const panel = open(states.broken());
    for (const fn of panel.tabListeners.updated) fn(7, { status: "loading" });
    assert.equal(panel.el("verdict").getAttribute("data-state"), "loading");
    assert.equal(panel.el("content").hidden, true);
  });

  test("refreshes every 2 seconds", () => {
    assert.deepEqual(
      open(states.broken()).intervals.map((i) => i.ms),
      [2000],
    );
  });
});

describe("tabs (WAI-ARIA APG pattern)", () => {
  test("one tab is selected and focusable, its panel shown, the others hidden", () => {
    const panel = open(states.broken());
    assert.deepEqual(selected(panel), ["findings"]);
    for (const v of VIEWS) {
      const tab = panel.el(`tab-${v}`);
      assert.equal(tab.getAttribute("role"), "tab");
      assert.equal(tab.getAttribute("aria-controls"), `view-${v}`);
      assert.equal(tab.getAttribute("tabindex"), v === "findings" ? "0" : "-1");
      assert.equal(panel.el(`view-${v}`).hidden, v !== "findings");
      assert.equal(panel.el(`view-${v}`).getAttribute("role"), "tabpanel");
    }
    assert.equal(panel.el("tablist").getAttribute("role"), "tablist");
  });

  test("arrow keys move and select, wrapping; Home and End jump; focus follows", () => {
    const panel = open(states.broken());
    key(panel, "ArrowRight");
    assert.deepEqual(selected(panel), ["timeline"]);
    assert.equal(panel.el("tab-timeline").focused, 1);
    assert.equal(panel.el("view-timeline").hidden, false);
    assert.equal(panel.el("view-findings").hidden, true);
    key(panel, "End");
    assert.deepEqual(selected(panel), ["consent"]);
    key(panel, "ArrowRight");
    assert.deepEqual(selected(panel), ["findings"]);
    key(panel, "ArrowLeft");
    assert.deepEqual(selected(panel), ["consent"]);
    key(panel, "Home");
    assert.deepEqual(selected(panel), ["findings"]);
    key(panel, "a");
    assert.deepEqual(selected(panel), ["findings"]);
  });

  test("clicking a tab selects it", () => {
    const panel = open(states.broken());
    clickTab(panel, "requests");
    assert.deepEqual(selected(panel), ["requests"]);
  });

  test("tab labels carry counts", () => {
    const panel = open(states.broken());
    assert.equal(panel.text("count-findings"), "2");
    assert.equal(panel.text("count-requests"), "2");
  });
});

describe("findings view", () => {
  test("lists the findings with their fixes and evidence behind a labelled disclosure", () => {
    const html = open(states.broken()).html("view-findings");
    assert.match(html, /× <\/span>|<span aria-hidden="true">×<\/span> BROKEN/);
    assert.match(html, /<dt>Fix<\/dt>/);
    assert.match(html, /<dl id="pf-p-ev-[^"]+" class="evidence" hidden>/);
  });
});

describe("timeline view", () => {
  test("is a table of time since page start, then the event and its consent change", () => {
    const html = open(states.verified()).html("view-timeline");
    assert.match(html, /<th scope="col">After start<\/th><th scope="col">Event and consent change<\/th>/);
    assert.match(html, /<td class="t-time">\+1 ms<\/td><td><span class="t-label">Consent default<\/span><span class="t-sub mono">wait_for_update 500 ms<\/span>/);
    assert.match(html, /Google tag config<\/span><span class="t-sub mono">G-1</);
  });

  test("an update shows only the types it changed, from and to", () => {
    const html = open(states.verified()).html("view-timeline");
    const update = html.slice(html.indexOf("Consent update"));
    const row = update.slice(0, update.indexOf("</tr>"));
    assert.match(row, /analytics_storage<\/span> <span class="cv denied">.*denied<\/span> <span aria-hidden="true">→<\/span><span class="visually-hidden"> to <\/span> <span class="cv granted">/);
    assert.doesNotMatch(row, /ad_storage/);
  });

  test("other dataLayer events are hidden behind a disclosure that counts them", () => {
    const panel = open(mismatchState());
    assert.doesNotMatch(panel.html("view-timeline"), />scroll</);
    const toggle = disclosures(panel.html("view-timeline")).find((d) => d.key === "tl-other");
    assert.equal(toggle.label, "Show 1 other dataLayer event");
    panel.toggle("view-timeline", "tl-other");
    assert.match(panel.html("view-timeline"), /dataLayer event<\/span><span class="t-sub mono">scroll</);
  });

  test("empty timeline says what is missing and what to do", () => {
    const panel = open({ ...states.bare(), timeline: [] });
    assert.match(panel.html("view-timeline"), /No consent or tag events yet\.<\/p><p class="empty-detail">Events appear as the page runs\. Reload to capture from the start\./);
  });
});

describe("requests view", () => {
  test("defines gcs and gcd before using them", () => {
    const html = open(states.verified()).html("view-requests");
    assert.ok(html.indexOf("Google consent state") < html.indexOf("Show raw gcs and gcd values"));
    assert.match(html, /<code>gcs<\/code>, the Google consent state, and <code>gcd<\/code>, the Google consent detail/);
  });

  test("shows what each request carried next to the consent on the page, and flags mismatches", () => {
    const html = open(mismatchState()).html("view-requests");
    assert.match(html, /region1\.google-analytics\.com · page_view<\/span><span class="flag"><span aria-hidden="true">×<\/span> mismatch<\/span>/);
    assert.match(html, /<tr class="mismatch"><th scope="row" class="mono">ad_storage<\/th><td><span class="cv granted">.*?<\/td><td><span class="cv denied">/);
  });

  test("raw gcs and gcd values are one labelled click away", () => {
    const panel = open(mismatchState());
    assert.doesNotMatch(panel.html("view-requests"), /class="raw"/);
    panel.toggle("view-requests", "req-raw");
    assert.match(panel.html("view-requests"), /<p class="raw">gcs=G111 · gcd=13t3t3t3t5l1<\/p>/);
  });

  test("names the tag each request was attributed to, and shows unattributed requests as not judged (#28)", () => {
    const page = loadPage({ scripts: ["https://www.googletagmanager.com/gtag/js?id=G-1"] });
    page.at(1).gtag("consent", "default", FULL_V2);
    page.at(5).window.fetch("https://www.googletagmanager.com/gtag/js?id=AW-123456789");
    page.at(40).window.fetch(`${GA4}?tid=G-1&gcs=G100&en=page_view`);
    page.at(60).window.fetch("https://ad.doubleclick.net/ccm/s/collect?gtm=45be6as1");
    const html = open(page.finishLoading().requestState()).html("view-requests");
    assert.match(html, /<div><dt>Sent by<\/dt><dd>The tag the request is judged against/);
    assert.match(html, /<p class="req-tag">Sent by Google Analytics 4 <span class="mono">G-1<\/span><\/p>/);
    assert.match(html, /<p class="req-tag">Loads Google Ads <span class="mono">AW-123456789<\/span>\. Not judged: loading a tag collects nothing\.<\/p>/);
    assert.match(html, /<p class="req-tag"><span class="req-none">– Not tied to a tag<\/span> Not judged\. Sent to an endpoint several Google tags share, with no tag ID\.<\/p>/);
  });

  test("empty requests say what to do", () => {
    assert.match(open(states.zeroRequests()).html("view-requests"), /No vendor requests yet\./);
  });
});

describe("consent view", () => {
  test("is a table with denied types first and the recognized CMP", () => {
    const html = open(states.verified()).html("view-consent");
    assert.ok(html.indexOf("ad_storage") < html.indexOf("analytics_storage"));
    assert.match(html, /<th scope="col">Consent type<\/th><th scope="col">Now<\/th>/);
    assert.match(html, /OneTrust recognized\./);
  });

  test("without a CMP it says so and lists the supported ones behind a disclosure", () => {
    const panel = open(states.zeroRequests());
    assert.match(panel.html("view-consent"), /No supported CMP recognized\./);
    assert.match(panel.html("view-consent"), /<p id="cmp-list" class="trace-line-plain" hidden>/);
    panel.toggle("view-consent", "cmp-list");
    assert.match(panel.html("view-consent"), /<p id="cmp-list" class="trace-line-plain">Cookiebot, OneTrust/);
  });

  test("a page with no consent commands gets an empty state", () => {
    assert.match(open(states.bare()).html("view-consent"), /No consent state on this page\./);
  });
});

describe("live refresh keeps the user's place", () => {
  test("only views whose data changed are re-rendered", () => {
    const state = states.verified();
    const panel = open(structuredClone(state));
    const writes = Object.fromEntries(VIEWS.map((v) => [v, panel.el(`view-${v}`).writes]));
    panel.refresh(withHost(structuredClone(state)));
    for (const v of VIEWS) assert.equal(panel.el(`view-${v}`).writes, writes[v], `${v} unchanged`);

    const changed = structuredClone(state);
    changed.networkHits.push({ ...changed.networkHits[0], ms: 3000 });
    panel.refresh(withHost(changed));
    assert.equal(panel.el("view-requests").writes, writes.requests + 1);
    assert.equal(panel.el("view-timeline").writes, writes.timeline);
    assert.equal(panel.el("view-findings").writes, writes.findings);
    assert.equal(panel.el("view-consent").writes, writes.consent);
  });

  test("keeps scroll, the selected view, expanded items and focus when new data arrives", () => {
    const panel = open(mismatchState());
    clickTab(panel, "requests");
    panel.toggle("view-requests", "req-raw");
    panel.document.scrollingElement.scrollTop = 300;
    panel.document.activeElement = { getAttribute: (n) => (n === "data-toggle" ? "req-raw" : null) };
    const changed = mismatchState();
    changed.networkHits.push({ ...changed.networkHits[0], ms: 5000 });
    panel.refresh(withHost(changed));
    assert.equal(panel.document.scrollingElement.scrollTop, 300);
    assert.deepEqual(selected(panel), ["requests"]);
    assert.match(panel.html("view-requests"), /class="raw"/);
    assert.equal(panel.queried.at(-1).selector, '[data-toggle="req-raw"]');
  });

  test("a missed refresh keeps the last trace instead of flashing an error", () => {
    const panel = open(states.broken());
    panel.refresh(undefined);
    assert.equal(panel.el("verdict").getAttribute("data-state"), "broken");
    assert.equal(panel.el("content").hidden, false);
  });
});

describe("follows the active tab and remembers each tab's view", () => {
  test("the selected view and expanded items are stored per tab in chrome.storage.session", () => {
    const panel = open(states.broken());
    clickTab(panel, "requests");
    panel.toggle("view-requests", "req-raw");
    assert.deepEqual(panel.calls.stored.at(-1), { key: "cf.ui.panel.7", value: { open: { "req-raw": true }, view: "requests" } });
  });

  test("reopening the panel restores the view and expanded items", () => {
    const session = newSession();
    const first = loadPanel({ responses: [withHost(mismatchState())], session });
    clickTab(first, "timeline");
    first.toggle("view-timeline", "tl-other");
    const again = loadPanel({ responses: [withHost(mismatchState())], session });
    assert.deepEqual(selected(again), ["timeline"]);
    assert.match(again.html("view-timeline"), />scroll</);
  });

  test("switching tabs traces the new tab with its own remembered view", () => {
    const session = newSession();
    session.set("cf.ui.panel.8", JSON.stringify({ open: {}, view: "consent" }));
    const panel = loadPanel({ responses: [withHost(states.broken())], session });
    panel.activate({ id: 8 }, withHost(states.verified(), "other.example"));
    assert.equal(panel.calls.sendMessage.at(-1).tabId, 8);
    assert.deepEqual(selected(panel), ["consent"]);
    assert.equal(panel.text("pageMeta"), "other.example");
    assert.equal(panel.text("verdictTitle"), "Consent is wired correctly on this page.");
  });

  test("stored state from an older version is sanitized", () => {
    const session = newSession();
    session.set("cf.ui.panel.7", JSON.stringify({ open: { 'x"><img': true, ok: "yes" }, view: "devtools" }));
    const panel = loadPanel({ responses: [withHost(states.broken())], session });
    assert.deepEqual(selected(panel), ["findings"]);
  });
});

describe("escaping", () => {
  test("page-controlled strings are escaped in every view", () => {
    const state = mismatchState();
    state.networkHits[0].host = "<b>evil</b>";
    state.networkHits[0].en = '"><img src=x>';
    state.timeline.find((e) => e.type === "config").detail.measurementId = "<script>x</script>";
    state.cmp = { name: "<i>cmp</i>", detected: true };
    const panel = open(state);
    panel.toggle("view-timeline", "tl-other");
    const html = VIEWS.map((v) => panel.html(`view-${v}`)).join("");
    assert.doesNotMatch(html, /<b>|<img|<script>|<i>/);
    assert.match(html, /&lt;b&gt;evil&lt;\/b&gt;/);
  });
});
