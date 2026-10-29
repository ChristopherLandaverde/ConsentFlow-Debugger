// Loads the real popup/findings.js and popup/popup.js against a minimal DOM built from
// popup/popup.html and a stubbed chrome API. Each element with an id in popup.html becomes a
// stub element with textContent, className, innerHTML, hidden and attributes; asking for an
// id that popup.html does not have throws, so a renamed element fails the tests instead of
// passing silently. Elements that popup.js creates through innerHTML are checked as HTML.
import { readFileSync } from "node:fs";
import vm from "node:vm";

const findingsJs = readFileSync(new URL("../../popup/findings.js", import.meta.url), "utf8");
const popupJs = readFileSync(new URL("../../popup/popup.js", import.meta.url), "utf8");
const popupHtml = readFileSync(new URL("../../popup/popup.html", import.meta.url), "utf8");

const escapeText = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function makeElement(attrs = {}) {
  let text = "";
  let html = "";
  const listeners = {};
  const attributes = { ...attrs };
  const el = {
    id: attrs.id,
    className: attrs.class || "",
    hidden: "hidden" in attrs,
    writes: 0,
    focused: 0,
    get innerHTML() {
      return html;
    },
    set innerHTML(value) {
      el.writes++;
      html = String(value);
    },
    get textContent() {
      return text;
    },
    set textContent(value) {
      text = String(value);
      html = escapeText(text);
    },
    setAttribute(name, value) {
      attributes[name] = String(value);
    },
    getAttribute(name) {
      return name in attributes ? attributes[name] : null;
    },
    addEventListener(type, fn) {
      (listeners[type] ||= []).push(fn);
    },
    dispatch(type, event) {
      for (const fn of listeners[type] || []) fn(event);
    },
    click() {
      el.dispatch("click", { target: el });
    },
    focus() {
      el.focused++;
    },
  };
  return el;
}

// Objects created inside the vm have another realm's prototypes; copy them for deepEqual.
const plain = (value) => JSON.parse(JSON.stringify(value));

function buildDom() {
  const byId = {};
  for (const [, attrText] of popupHtml.matchAll(/<\w+((?:\s+[\w-]+(?:="[^"]*")?)*)\s*\/?>/g)) {
    const attrs = Object.fromEntries(
      [...attrText.matchAll(/([\w-]+)(?:="([^"]*)")?/g)].map((m) => [m[1], m[2] === undefined ? "" : m[2]]),
    );
    if (!attrs.id) continue;
    byId[attrs.id] = makeElement(attrs);
  }
  const queried = [];
  const document = {
    activeElement: null,
    scrollingElement: { scrollTop: 0 },
    getElementById(id) {
      if (!byId[id]) throw new Error(`popup.html has no #${id}`);
      return byId[id];
    },
    // Elements created through innerHTML are not modelled; record the query and hand back a
    // focusable stand-in so focus restoration can be asserted.
    querySelector(selector) {
      const found = makeElement();
      queried.push({ selector, element: found });
      return found;
    },
  };
  return { document, byId, queried };
}

/**
 * @param {object} options
 * @param {Array}  options.responses  successive replies from the content script to getState
 *                                    (undefined = no reply / not injected)
 * @param {Array}  [options.tabs]     result of chrome.tabs.query
 * @param {object} [options.injectResult] reply from background.js to ensureContentScript
 * @param {number} [options.now]      Date.now() inside the popup
 */
export function loadPopup({ responses = [], tabs = [{ id: 7, url: "https://shop.example/cart" }], injectResult = { ok: true }, now = 1_000_000 } = {}) {
  const dom = buildDom();
  const calls = { sendMessage: [], runtime: [], created: [], reloaded: [] };
  const timeouts = [];
  const intervals = [];
  const replies = [...responses];
  const clock = { now };

  const chrome = {
    runtime: {
      lastError: undefined,
      sendMessage(message, cb) {
        calls.runtime.push(plain(message));
        cb && cb(injectResult);
      },
    },
    tabs: {
      query(query, cb) {
        cb(tabs);
      },
      sendMessage(tabId, message, cb) {
        calls.sendMessage.push({ tabId, message: plain(message) });
        cb(replies.length ? replies.shift() : undefined);
      },
      create(props) {
        calls.created.push(plain(props));
      },
      reload(tabId) {
        calls.reloaded.push(tabId);
      },
    },
  };

  class FakeDate extends Date {
    static now() {
      return clock.now;
    }
  }

  const context = vm.createContext({
    document: dom.document,
    chrome,
    console,
    URL,
    Date: FakeDate,
    setTimeout(fn, ms) {
      timeouts.push({ fn, ms });
    },
    setInterval(fn, ms) {
      intervals.push({ fn, ms });
    },
  });
  vm.runInContext(findingsJs, context, { filename: "findings.js" });
  vm.runInContext(popupJs, context, { filename: "popup.js" });

  return {
    ...dom,
    calls,
    timeouts,
    intervals,
    clock,
    el: (id) => dom.document.getElementById(id),
    html: (id) => dom.document.getElementById(id).innerHTML,
    text: (id) => dom.document.getElementById(id).textContent,
    runTimeouts() {
      for (const t of timeouts.splice(0)) t.fn();
    },
    /** Queue the next reply and run the 4-second refresh. */
    refresh(response) {
      replies.push(response);
      for (const i of intervals) i.fn();
    },
    /** Click a disclosure button (rendered through innerHTML) inside a container. */
    toggle(containerId, key) {
      const button = {
        getAttribute: (name) => (name === "data-toggle" ? key : null),
        closest() {
          return button;
        },
      };
      dom.document.getElementById(containerId).dispatch("click", { target: button });
    },
  };
}

/** Disclosure buttons in an HTML string: { key, expanded, label }. */
export function disclosures(html) {
  const re = /<button type="button" class="disclosure" data-toggle="([^"]+)" aria-controls="([^"]+)" aria-expanded="(true|false)">([^<]*)<\/button>/g;
  return [...html.matchAll(re)].map((m) => ({ key: m[1], controls: m[2], expanded: m[3] === "true", label: m[4] }));
}

/** Status tags in an HTML string, as their visible text ("× BROKEN"). */
export function statusTags(html) {
  const re = /<p class="status-tag [^"]*"><span aria-hidden="true">([^<]*)<\/span> ([^<]*)<\/p>/g;
  return [...html.matchAll(re)].map((m) => `${m[1]} ${m[2]}`);
}

/** Text of each finding title (h2.finding-title), tags stripped. */
export function findingTitles(html) {
  return [...html.matchAll(/<h2 id="[^"]*" class="finding-title">(.*?)<\/h2>/g)].map((m) => m[1].replace(/<[^>]+>/g, ""));
}
