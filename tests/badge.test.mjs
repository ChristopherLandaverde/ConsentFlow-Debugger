// The toolbar badge: popup/findings.js badgeFor() (text, colors, tooltip), background.js
// (which tab it is set on, when it is cleared, forgetting a closed tab's UI state) and
// content.js (what it reports, and only when it changes).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import vm from "node:vm";
import { loadFindings } from "./helpers/findings.mjs";
import { states } from "./helpers/states.mjs";

const { badgeText, badgeFor, computeVerdict } = loadFindings();
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const plain = (v) => JSON.parse(JSON.stringify(v));

// WCAG relative-luminance contrast, as in the ux-standards checklist.
function ratio(a, b) {
  const L = (h) => {
    const [r, g, bl] = [0, 2, 4].map((i) => parseInt(h.slice(1 + i, 3 + i), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [L(a), L(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

describe("badgeText", () => {
  test("is the count, at most 4 characters, and empty when nothing is broken", () => {
    assert.equal(badgeText(0), "");
    assert.equal(badgeText(1), "1");
    assert.equal(badgeText(42), "42");
    assert.equal(badgeText(999), "999");
    assert.equal(badgeText(1000), "999+");
    assert.equal(badgeText(123456), "999+");
    assert.equal(badgeText(-3), "");
    assert.equal(badgeText(undefined), "");
    assert.equal(badgeText("x"), "");
    for (const n of [1, 9, 99, 999, 1000, 1e9]) assert.ok(badgeText(n).length <= 4);
  });
});

describe("badgeFor", () => {
  test("broken pages show the broken count; the tooltip is the popup's verdict sentence", () => {
    const verdict = computeVerdict(states.broken());
    const badge = badgeFor(verdict);
    assert.equal(badge.text, String(verdict.counts.broken));
    assert.equal(badge.text, "2");
    assert.equal(badge.title, "ConsentFlow Debugger: 2 consent problems on this page.");
  });

  test("is cleared on the all-clear, and when only review or not-checked items remain", () => {
    for (const make of [states.verified, states.review, states.zeroRequests]) {
      const verdict = computeVerdict(make());
      assert.equal(badgeFor(verdict).text, "", verdict.status);
      assert.match(badgeFor(verdict).title, new RegExp(`^ConsentFlow Debugger: ${verdict.title.replace(".", "\\.")}$`));
    }
  });

  test("no verdict (page not read yet) means no badge and the plain name", () => {
    assert.deepEqual(badgeFor(null).text, "");
    assert.equal(badgeFor(null).title, "ConsentFlow Debugger");
  });

  test("colors are brand tokens with text contrast of at least 4.5:1", () => {
    const badge = badgeFor(computeVerdict(states.broken()));
    assert.equal(badge.background, "#B83A2D"); // --state-exception
    assert.equal(badge.color, "#F3F0E6"); // --surface-paper
    assert.ok(ratio(badge.background, badge.color) >= 4.5);
  });
});

// ─── background.js ────────────────────────────────────────────
function loadBackground({ session = new Map(), textColor = true } = {}) {
  const calls = [];
  const listeners = { message: [], removed: [] };
  const action = {
    setBadgeText: (d) => calls.push(["text", plain(d)]),
    setBadgeBackgroundColor: (d) => calls.push(["background", plain(d)]),
    setTitle: (d) => calls.push(["title", plain(d)]),
  };
  if (textColor) action.setBadgeTextColor = (d) => calls.push(["color", plain(d)]);
  const chrome = {
    action,
    runtime: { onMessage: { addListener: (fn) => listeners.message.push(fn) } },
    tabs: { onRemoved: { addListener: (fn) => listeners.removed.push(fn) } },
    storage: { session: { get() {}, set() {}, remove: (keys) => [].concat(keys).forEach((k) => session.delete(k)) } },
  };
  const context = vm.createContext({ chrome });
  context.importScripts = (...files) => files.forEach((f) => vm.runInContext(read(f), context, { filename: f }));
  vm.runInContext(read("background.js"), context, { filename: "background.js" });
  const send = (message, tabId = 7, sender = { tab: { id: tabId } }) => listeners.message.forEach((fn) => fn(message, sender, () => {}));
  return { calls, send, session, removed: listeners.removed };
}

const summary = (state) => ({ ready: true, validation: state.validation, tagImpact: state.tagImpact });

describe("background.js badge", () => {
  test("sets the count, colors and verdict tooltip on the reporting tab only", () => {
    const bg = loadBackground();
    bg.send({ action: "pageState", state: summary(states.broken()) }, 12);
    assert.deepEqual(bg.calls, [
      ["text", { tabId: 12, text: "2" }],
      ["background", { tabId: 12, color: "#B83A2D" }],
      ["color", { tabId: 12, color: "#F3F0E6" }],
      ["title", { tabId: 12, title: "ConsentFlow Debugger: 2 consent problems on this page." }],
    ]);
  });

  test("clears the badge when a new page starts and when the page is verified", () => {
    const bg = loadBackground();
    bg.send({ action: "pageStart" });
    assert.deepEqual(bg.calls[0], ["text", { tabId: 7, text: "" }]);
    assert.deepEqual(bg.calls.at(-1), ["title", { tabId: 7, title: "ConsentFlow Debugger" }]);
    bg.calls.length = 0;
    bg.send({ action: "pageState", state: summary(states.verified()) });
    assert.deepEqual(bg.calls[0], ["text", { tabId: 7, text: "" }]);
  });

  test("works on Chrome versions without setBadgeTextColor", () => {
    const bg = loadBackground({ textColor: false });
    bg.send({ action: "pageState", state: summary(states.broken()) });
    assert.deepEqual(bg.calls.map((c) => c[0]), ["text", "background", "title"]);
  });

  test("ignores messages that don't come from a tab", () => {
    const bg = loadBackground();
    bg.send({ action: "pageState", state: summary(states.broken()) }, 7, {});
    assert.equal(bg.calls.length, 0);
  });

  test("forgets a closed tab's popup and panel UI state", () => {
    const session = new Map([["cf.ui.popup.7", {}], ["cf.ui.panel.7", {}], ["cf.ui.panel.8", {}]]);
    const bg = loadBackground({ session });
    bg.removed.forEach((fn) => fn(7));
    assert.deepEqual([...session.keys()], ["cf.ui.panel.8"]);
  });
});

// ─── content.js ───────────────────────────────────────────────
function loadContent() {
  const sent = [];
  const windowListeners = [];
  const runtimeListeners = [];
  const intervals = [];
  const window = {
    addEventListener: (type, fn) => type === "message" && windowListeners.push(fn),
    postMessage() {},
  };
  const chrome = {
    runtime: {
      getURL: (p) => `chrome-extension://id/${p}`,
      sendMessage: (m, cb) => { sent.push(plain(m)); cb && cb(); },
      onMessage: { addListener: (fn) => runtimeListeners.push(fn) },
      lastError: undefined,
    },
  };
  const document = {
    visibilityState: "visible",
    createElement: () => ({}),
    head: { appendChild() {} },
  };
  const context = vm.createContext({
    window, chrome, document,
    location: { hostname: "shop.example" },
    setTimeout() {},
    setInterval: (fn, ms) => intervals.push({ fn, ms }),
  });
  vm.runInContext(read("content.js"), context, { filename: "content.js" });
  const post = (payload) => windowListeners.forEach((fn) => fn({ data: { source: "cf-debug-injected", type: "full-state", payload } }));
  const ask = () => {
    let reply;
    runtimeListeners.forEach((fn) => fn({ action: "getState" }, {}, (r) => (reply = r)));
    return reply;
  };
  return { sent, post, ask, intervals };
}

describe("content.js reporting", () => {
  test("announces a new page, then sends rule and tag results only when they change", () => {
    const content = loadContent();
    assert.deepEqual(content.sent, [{ action: "pageStart" }]);
    const state = states.broken();
    content.post(state);
    content.post(structuredClone(state));
    assert.equal(content.sent.length, 2);
    assert.deepEqual(Object.keys(content.sent[1].state).sort(), ["ready", "tagImpact", "validation"]);
    assert.equal(content.sent[1].action, "pageState");
    content.post(states.verified());
    assert.equal(content.sent.length, 3);
  });

  test("sends nothing before the page's first pass is done", () => {
    const content = loadContent();
    content.post({ ready: false });
    assert.equal(content.sent.length, 1);
  });

  test("adds the page's host to the state it gives the popup and side panel", () => {
    const content = loadContent();
    content.post(states.broken());
    assert.deepEqual(plain(content.ask().page), { host: "shop.example" });
  });

  test("re-reads the page every 3 seconds while the tab is visible", () => {
    assert.deepEqual(loadContent().intervals.map((i) => i.ms), [3000]);
  });
});
