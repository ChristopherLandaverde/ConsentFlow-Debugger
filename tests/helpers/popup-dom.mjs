// Loads the real popup/popup.js against a minimal DOM built from popup/popup.html and a
// stubbed chrome API. Each element with an id in popup.html becomes a stub element with
// textContent, className, innerHTML and classList; asking for an id that popup.html does
// not have throws, so a renamed element fails the tests instead of passing silently.
//
// esc() in popup.js relies on the browser escaping text when it is read back as HTML.
// The stub does the same as Chrome's serializer for text nodes: &, <, > and U+00A0.
import { readFileSync } from "node:fs";
import vm from "node:vm";

const popupJs = readFileSync(new URL("../../popup/popup.js", import.meta.url), "utf8");
const popupHtml = readFileSync(new URL("../../popup/popup.html", import.meta.url), "utf8");

const escapeText = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/ /g, "&nbsp;");

function makeElement(attrs = {}) {
  let text = "";
  const listeners = {};
  const el = {
    id: attrs.id,
    className: attrs.class || "",
    innerHTML: "",
    dataset: attrs["data-tab"] ? { tab: attrs["data-tab"] } : {},
    children: {},
    get textContent() {
      return text;
    },
    set textContent(value) {
      text = String(value);
      el.innerHTML = escapeText(text);
    },
    classList: {
      add(c) {
        if (!el.classList.contains(c)) el.className = (el.className + " " + c).trim();
      },
      remove(c) {
        el.className = el.className
          .split(/\s+/)
          .filter((x) => x && x !== c)
          .join(" ");
      },
      contains(c) {
        return el.className.split(/\s+/).includes(c);
      },
    },
    addEventListener(type, fn) {
      (listeners[type] ||= []).push(fn);
    },
    click() {
      for (const fn of listeners.click || []) fn({ target: el });
    },
    querySelector(selector) {
      const child = el.children[selector];
      if (!child) throw new Error(`#${el.id} has no ${selector}`);
      return child;
    },
  };
  return el;
}

// Objects created inside the vm have another realm's prototypes; copy them for deepEqual.
const plain = (value) => JSON.parse(JSON.stringify(value));

function buildDom() {
  const byId = {};
  const tabs = [];
  const panels = [];
  for (const [, attrText] of popupHtml.matchAll(/<\w+((?:\s+[\w-]+="[^"]*")*)\s*\/?>/g)) {
    const attrs = Object.fromEntries([...attrText.matchAll(/([\w-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
    const classes = (attrs.class || "").split(/\s+/);
    if (!attrs.id && !classes.includes("tab")) continue;
    const el = makeElement(attrs);
    if (attrs.id) byId[attrs.id] = el;
    if (classes.includes("tab")) tabs.push(el);
    if (classes.includes("panel")) panels.push(el);
    if (classes.includes("score-item")) el.children[".score-num"] = makeElement({ class: "score-num" });
  }
  const document = {
    getElementById(id) {
      if (!byId[id]) throw new Error(`popup.html has no #${id}`);
      return byId[id];
    },
    querySelectorAll(selector) {
      if (selector === ".tab") return tabs;
      if (selector === ".panel") return panels;
      throw new Error(`unsupported selector ${selector}`);
    },
    createElement: () => makeElement(),
  };
  return { document, byId, tabs, panels };
}

/**
 * @param {object} options
 * @param {Array}  options.responses  successive replies from the content script to getState
 *                                    (undefined = no reply / not injected)
 * @param {Array}  [options.tabs]     result of chrome.tabs.query
 */
export function loadPopup({ responses = [], tabs = [{ id: 7 }] } = {}) {
  const dom = buildDom();
  const calls = { sendMessage: [], runtime: [], created: [] };
  const timeouts = [];
  const intervals = [];
  const replies = [...responses];

  const chrome = {
    runtime: {
      lastError: undefined,
      sendMessage(message, cb) {
        calls.runtime.push(plain(message));
        cb && cb({ ok: true });
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
    },
  };

  const context = vm.createContext({
    document: dom.document,
    chrome,
    console,
    setTimeout(fn, ms) {
      timeouts.push({ fn, ms });
    },
    setInterval(fn, ms) {
      intervals.push({ fn, ms });
    },
  });
  vm.runInContext(popupJs, context, { filename: "popup.js" });

  return {
    ...dom,
    calls,
    timeouts,
    intervals,
    el: (id) => dom.document.getElementById(id),
    html: (id) => dom.document.getElementById(id).innerHTML,
    runTimeouts() {
      for (const t of timeouts.splice(0)) t.fn();
    },
    /** Queue the next reply and run the 4-second refresh. */
    refresh(response) {
      replies.push(response);
      for (const i of intervals) i.fn();
    },
  };
}

/** Text of each element in an HTML string whose class list starts with `cls`. */
export function texts(html, cls) {
  const re = new RegExp(`<span class="${cls}[^"]*">([^<]*)</span>`, "g");
  return [...html.matchAll(re)].map((m) => m[1]);
}

/** The modifier classes of each `<div class="<cls> ...">` in an HTML string. */
export function modifiers(html, cls) {
  const re = new RegExp(`<div class="${cls} ([^"]*)">`, "g");
  return [...html.matchAll(re)].map((m) => m[1]);
}
