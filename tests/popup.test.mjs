// popup/popup.js: how state is fetched, which view state shows, how the verdict and findings
// are rendered and kept stable across live refreshes, what is remembered between opens, and
// the hand-off to the side panel.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { loadPage } from "./helpers/page.mjs";
import { disclosures, findingTitles, loadPopup, newSession, statusTags } from "./helpers/popup-dom.mjs";
import { FULL_V2, states } from "./helpers/states.mjs";

const show = (state) => loadPopup({ responses: [state] });

describe("fetching state and view states", () => {
  test("asks the active tab's content script for state and shows the tab's host", () => {
    const popup = show(states.verified());
    assert.deepEqual(popup.calls.sendMessage, [{ tabId: 7, message: { action: "getState" } }]);
    assert.equal(popup.text("pageMeta"), "shop.example");
  });

  test("shows a loading state with a progress indicator until the page's first pass is done", () => {
    const popup = show({ ready: false });
    assert.equal(popup.el("verdict").getAttribute("data-state"), "loading");
    assert.equal(popup.text("verdictTitle"), "Reading this page…");
    assert.equal(popup.el("progress").hidden, false);
    assert.equal(popup.el("findings").hidden, true);
    assert.equal(popup.el("reviewCta").hidden, true);
    assert.doesNotMatch(popup.text("verdictTitle") + popup.text("verdictDetail"), /no issues|nothing found/i);
  });

  test("when the content script does not answer, asks the background to inject it and retries after 2.5 s", () => {
    const popup = loadPopup({ responses: [undefined, states.verified()] });
    assert.deepEqual(popup.calls.runtime, [{ action: "ensureContentScript", tabId: 7 }]);
    assert.equal(popup.text("verdictDetail"), "Connecting to the page…");
    assert.deepEqual(
      popup.timeouts.map((t) => t.ms),
      [2500],
    );
    popup.runTimeouts();
    assert.equal(popup.calls.sendMessage.length, 2);
    assert.equal(popup.el("verdict").getAttribute("data-state"), "verified");
  });

  test("shows an error where the content would be, with a reload action, when the page never answers", () => {
    const popup = loadPopup({ responses: [undefined, undefined] });
    popup.runTimeouts();
    assert.equal(popup.el("verdict").getAttribute("data-state"), "error");
    assert.equal(popup.text("verdictTitle"), "Can't read this page yet.");
    assert.equal(popup.el("errorAction").hidden, false);
    assert.equal(popup.el("progress").hidden, true);
    assert.equal(popup.el("findings").hidden, true);
    popup.el("errorAction").click();
    assert.deepEqual(popup.calls.reloaded, [7]);
    assert.equal(popup.el("verdict").getAttribute("data-state"), "loading");
  });

  test("says Chrome pages can't be inspected, without a reload button", () => {
    const popup = loadPopup({ responses: [undefined], injectResult: { ok: false, reason: "system-page" } });
    assert.equal(popup.text("verdictTitle"), "Chrome pages can't be inspected.");
    assert.equal(popup.el("errorAction").hidden, true);
  });

  test("reports when there is no active tab", () => {
    const popup = loadPopup({ tabs: [] });
    assert.equal(popup.text("verdictTitle"), "No page to inspect.");
    assert.equal(popup.el("errorAction").hidden, true);
  });

  test("refreshes every 4 seconds", () => {
    const popup = show(states.zeroRequests());
    assert.deepEqual(
      popup.intervals.map((i) => i.ms),
      [4000],
    );
    popup.refresh(states.broken());
    assert.equal(popup.el("verdict").getAttribute("data-state"), "broken");
  });

  test("Reload and recheck reloads the tab and ignores the old page's replies for a moment", () => {
    const popup = show(states.broken());
    popup.el("recheckBtn").click();
    assert.deepEqual(popup.calls.reloaded, [7]);
    assert.equal(popup.el("verdict").getAttribute("data-state"), "loading");
    popup.refresh(states.broken()); // the old page answering before navigation
    assert.equal(popup.el("verdict").getAttribute("data-state"), "loading");
    popup.clock.now += 2000;
    popup.refresh(states.verified());
    assert.equal(popup.el("verdict").getAttribute("data-state"), "verified");
  });
});

describe("verdict", () => {
  test("zero Google requests reads 'Not enough data yet', never 'No issues'", () => {
    const popup = show(states.zeroRequests());
    assert.equal(popup.el("verdict").getAttribute("data-state"), "incomplete");
    assert.equal(popup.text("verdictLabel"), "– INCOMPLETE");
    assert.equal(popup.text("verdictTitle"), "Not enough data yet.");
    assert.match(popup.text("verdictDetail"), /checks ran and passed\. Accept or reject the cookie banner/);
    assert.doesNotMatch(popup.html("findings"), /no issues/i);
    assert.equal(popup.el("reviewCta").hidden, true);
  });

  test("a page without Consent Mode is broken", () => {
    const popup = show(states.bare());
    assert.equal(popup.text("verdictLabel"), "× BROKEN");
    assert.equal(popup.text("verdictTitle"), "This page has no Consent Mode.");
  });

  test("all checks passing is verified, with no review offer", () => {
    const popup = show(states.verified());
    assert.equal(popup.text("verdictLabel"), "✓ VERIFIED");
    assert.equal(popup.text("verdictTitle"), "Consent is wired correctly on this page.");
    assert.equal(popup.el("reviewCta").hidden, true);
  });

  test("the verdict is a polite live region whose text only changes when the verdict does", () => {
    const popup = show(states.broken());
    assert.equal(popup.el("verdict").getAttribute("aria-live"), "polite");
    const before = popup.text("verdictTitle");
    popup.refresh(states.broken());
    assert.equal(popup.text("verdictTitle"), before);
  });

  test("shows when the data was checked", () => {
    assert.match(show(states.broken()).text("checkedAt"), /^Checked \d\d:\d\d:\d\d · this page load$/);
  });
});

describe("findings", () => {
  test("the most severe finding comes first with its fix and verify step visible", () => {
    const html = show(states.broken()).html("findings");
    const titles = findingTitles(html);
    assert.equal(titles[0], "Google tag configured before the consent default");
    assert.equal(titles[1], "Facebook Pixel sent 2 requests while ad_storage was denied");
    const first = html.slice(0, html.indexOf("</article>"));
    for (const label of ["Observed", "Why", "Fix", "Verify"]) assert.match(first, new RegExp(`<dt>${label}</dt>`));
    assert.match(first, /Move the consent default above the Google tag snippet/);
    assert.match(first, /The consent default should come before <code>config<\/code>/);
  });

  test("every status shows a word and a symbol", () => {
    const html = show(states.broken()).html("findings");
    assert.deepEqual([...new Set(statusTags(html))], ["× BROKEN", "– NOT CHECKED"]);
    assert.deepEqual([...new Set(statusTags(show(states.review()).html("findings")))], ["! REVIEW"]);
  });

  test("evidence is one labelled click away, collapsed by default", () => {
    const popup = show(states.broken());
    const evidence = disclosures(popup.html("findings")).filter((d) => d.key.startsWith("ev-"));
    assert.ok(evidence.length >= 2);
    for (const d of evidence) {
      assert.equal(d.label, "Show evidence");
      assert.equal(d.expanded, false);
      assert.match(popup.html("findings"), new RegExp(`<dl id="${d.controls}" class="evidence" hidden>`));
    }
  });

  test("checks that could not run are listed with what they need and the next step", () => {
    const html = show(states.zeroRequests()).html("findings");
    assert.match(html, /checks need more data<\/h2>/);
    assert.match(html, /<span class="nc-label">Needs<\/span><span>No Google request with a consent signal yet\.<\/span>/);
    assert.match(html, /<span class="nc-label">Next<\/span><span>Accept or reject the cookie banner, then reopen ConsentFlow\.<\/span>/);
  });

  test("among checks that could not run, the ones the user can unlock come first", () => {
    const html = show(states.zeroRequests()).html("findings");
    assert.ok(html.indexOf("Banner choice reaching Consent Mode") < html.indexOf("wait_for_update with a CMP"));
  });

  test("passed checks are collapsed into one row that names what it reveals", () => {
    const popup = show(states.verified());
    const passed = disclosures(popup.html("findings")).find((d) => d.key === "passed");
    assert.match(passed.label, /^Show \d+ passed checks$/);
    assert.equal(passed.expanded, false);
    assert.match(popup.html("findings"), /<ul id="passed-list" class="passed-list" hidden>/);
    assert.doesNotMatch(popup.html("findings"), /class="finding /, "no full finding cards on the all-clear");
  });

  test("the review offer sits below the findings and only shows when something is broken or needs review", () => {
    assert.equal(show(states.broken()).el("reviewCta").hidden, false);
    assert.equal(show(states.review()).el("reviewCta").hidden, false);
    assert.equal(show(states.zeroRequests()).el("reviewCta").hidden, true);
  });

  test("the review button opens the review page in a new tab and sends nothing else", () => {
    const popup = show(states.broken());
    popup.el("reviewCtaButton").click();
    assert.deepEqual(popup.calls.created, [{ url: "https://focosys.io/review" }]);
  });

  test("escapes page-controlled strings", () => {
    const state = states.broken();
    state.tagImpact[0].name = '<img src=x onerror="alert(1)">';
    const popup = show(state);
    const html = popup.html("findings");
    assert.doesNotMatch(html, /<img/);
    assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  });
});

describe("live refresh keeps the user's place", () => {
  test("an unchanged state is not re-rendered", () => {
    const popup = show(states.broken());
    const writes = popup.el("findings").writes;
    popup.refresh(states.broken());
    popup.refresh(states.broken());
    assert.equal(popup.el("findings").writes, writes);
  });

  test("expanded evidence stays expanded across refreshes, and focus returns to the toggle", () => {
    const popup = show(states.broken());
    const key = disclosures(popup.html("findings")).find((d) => d.key.startsWith("ev-")).key;
    popup.toggle("findings", key);
    assert.equal(disclosures(popup.html("findings")).find((d) => d.key === key).expanded, true);
    assert.equal(popup.queried.at(-1).selector, `[data-toggle="${key}"]`);
    assert.equal(popup.queried.at(-1).element.focused, 1);

    // A refresh with new data re-renders, but the evidence stays open.
    const changed = states.broken();
    changed.timeline.push({ id: 999, type: "datalayer_event", ms: 2000, detail: { event: "scroll" } });
    popup.refresh(changed);
    assert.equal(disclosures(popup.html("findings")).find((d) => d.key === key).expanded, true);
  });

  test("keeps the scroll position and the focused control when new data arrives", () => {
    const popup = show(states.broken());
    popup.document.scrollingElement.scrollTop = 240;
    popup.document.activeElement = { getAttribute: (n) => (n === "data-toggle" ? "passed" : null) };
    const changed = states.broken();
    changed.tagImpact.find((t) => t.verdict === "violation").preConsentCount += 1;
    popup.refresh(changed);
    assert.equal(popup.document.scrollingElement.scrollTop, 240);
    assert.equal(popup.queried.at(-1).selector, '[data-toggle="passed"]');
  });
});

describe("side panel hand-off", () => {
  test("the popup holds no timeline, requests or consent table; Open full trace is the one primary action", () => {
    const popup = show(states.verified());
    assert.doesNotMatch(popup.html("findings"), /Timeline|Show captured data|class="raw"/);
    assert.match(popup.el("openTraceBtn").className, /\bprimary\b/);
    assert.match(popup.el("recheckBtn").className, /\bsecondary\b/);
    assert.equal(popup.el("actions").hidden, false);
  });

  test("Open full trace opens the side panel for the current tab, then closes the popup", () => {
    const popup = show(states.broken());
    popup.el("openTraceBtn").click();
    assert.deepEqual(popup.calls.sidePanel, [{ tabId: 7 }]);
    assert.equal(popup.calls.closed, 1);
    assert.equal(popup.el("traceHint").hidden, true);
  });

  test("without sidePanel.open (Chrome 114 and 115) it says where to find the panel instead", () => {
    const popup = loadPopup({ responses: [states.broken()], sidePanel: null });
    popup.el("openTraceBtn").click();
    assert.equal(popup.calls.closed, 0);
    assert.equal(popup.el("traceHint").hidden, false);
    assert.equal(popup.text("traceHint"), "Open ConsentFlow from Chrome's side panel menu to see the full trace.");
  });

  test("when Chrome refuses to open the panel, the hint shows and the popup stays open", () => {
    const sidePanel = { open: () => ({ then: (ok, fail) => fail(new Error("no user gesture")) }) };
    const popup = loadPopup({ responses: [states.broken()], sidePanel });
    popup.el("openTraceBtn").click();
    assert.equal(popup.calls.closed, 0);
    assert.equal(popup.el("traceHint").hidden, false);
  });
});

describe("remembered between opens (chrome.storage.session)", () => {
  test("expanding a disclosure stores only UI keys for this tab", () => {
    const popup = show(states.broken());
    const key = disclosures(popup.html("findings")).find((d) => d.key.startsWith("ev-")).key;
    popup.toggle("findings", key);
    assert.deepEqual(popup.calls.stored.at(-1), { key: "cf.ui.popup.7", value: { open: { [key]: true } } });
  });

  test("reopening the popup on the same tab restores expanded items; collapsing forgets them", () => {
    const session = newSession();
    const first = loadPopup({ responses: [states.broken()], session });
    const key = disclosures(first.html("findings")).find((d) => d.key.startsWith("ev-")).key;
    first.toggle("findings", key);
    first.toggle("findings", "passed");

    const again = loadPopup({ responses: [states.broken()], session });
    const open = disclosures(again.html("findings")).filter((d) => d.expanded).map((d) => d.key);
    assert.deepEqual(open.sort(), [key, "passed"].sort());

    again.toggle("findings", key);
    const third = loadPopup({ responses: [states.broken()], session });
    assert.deepEqual(disclosures(third.html("findings")).filter((d) => d.expanded).map((d) => d.key), ["passed"]);
  });

  test("another tab starts collapsed", () => {
    const session = newSession();
    const first = loadPopup({ responses: [states.broken()], session });
    first.toggle("findings", "passed");
    const other = loadPopup({ responses: [states.broken()], session, tabs: [{ id: 8, url: "https://other.example/" }] });
    assert.equal(disclosures(other.html("findings")).some((d) => d.expanded), false);
  });
});

describe("page to popup", () => {
  test("renders a page with a race condition and a tag sending before consent", () => {
    const popup = show(states.broken());
    assert.equal(popup.text("verdictTitle"), "2 consent problems on this page.");
    assert.match(popup.html("findings"), /<code>config<\/code> for G-1 ran at \+12 ms; the consent default ran at \+340 ms\./);
    assert.match(popup.html("findings"), /Requests in that 328 ms gap assume consent is granted\./);
    assert.equal(popup.el("reviewCta").hidden, false);
  });

  test("an update that arrived before the default is a broken finding", () => {
    const page = loadPage();
    page.at(5).gtag("consent", "update", { ad_storage: "granted" });
    page.at(9).gtag("consent", "default", FULL_V2);
    const popup = show(page.finishLoading().requestState());
    assert.ok(findingTitles(popup.html("findings")).includes("Consent update arrived before the default"));
    assert.match(popup.html("findings"), /Update at \+5 ms; default at \+9 ms, 4 ms later\./);
  });
});
