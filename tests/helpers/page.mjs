// Loads the real injected.js into a node:vm context that stands in for a web page.
//
// Only the browser surface injected.js touches is stubbed: window (as the global),
// document (readyState, script tags, DOMContentLoaded), navigator.sendBeacon, fetch,
// XMLHttpRequest, performance.now, timers and postMessage. The clock and the timers are
// driven by the test, so timings are deterministic and nothing runs in the background.
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../../injected.js", import.meta.url), "utf8");

/**
 * @param {object} [options]
 * @param {string[]} [options.scripts]   src of <script> tags on the page
 * @param {object}   [options.globals]   extra page globals (CMPs, pixels, an existing gtag...)
 * @param {Array}    [options.dataLayer] dataLayer entries pushed before injected.js runs
 * @param {string}   [options.readyState] document.readyState when injected.js runs
 */
export function loadPage(options = {}) {
  const clock = { now: 0 };
  const timeouts = [];
  const intervals = [];
  const posted = [];
  const listeners = { message: [], DOMContentLoaded: [] };
  const sent = { fetch: [], beacon: [], xhr: [] };
  const scripts = (options.scripts || []).map((src) => ({ src }));

  const document = {
    readyState: options.readyState || "loading",
    addEventListener(type, fn) {
      (listeners[type] ||= []).push(fn);
    },
    querySelectorAll(selector) {
      if (selector !== "script[src]") throw new Error(`unsupported selector ${selector}`);
      return scripts;
    },
    querySelector(selector) {
      const match = /^script\[src\*="([^"]+)"\]$/.exec(selector);
      if (!match) throw new Error(`unsupported selector ${selector}`);
      return scripts.find((s) => s.src.includes(match[1])) || null;
    },
  };

  function XMLHttpRequest() {}
  XMLHttpRequest.prototype.open = function (method, url) {
    sent.xhr.push({ method, url });
  };

  class Request {
    constructor(url) {
      this.url = url;
    }
  }

  const win = {
    document,
    location: { origin: "https://shop.example", href: "https://shop.example/" },
    navigator: {
      sendBeacon(url) {
        sent.beacon.push(url);
        return true;
      },
    },
    fetch(input) {
      sent.fetch.push(input);
      return "fetch-result";
    },
    XMLHttpRequest,
    Request,
    URL,
    performance: { now: () => clock.now },
    setTimeout(fn, ms) {
      timeouts.push({ fn, ms });
      return timeouts.length;
    },
    setInterval(fn, ms) {
      intervals.push({ fn, ms });
      return intervals.length;
    },
    addEventListener(type, fn) {
      (listeners[type] ||= []).push(fn);
    },
    postMessage(data) {
      posted.push(JSON.parse(JSON.stringify(data)));
    },
    console,
    ...options.globals,
  };
  win.window = win;
  if (options.dataLayer) win.dataLayer = [...options.dataLayer];

  const context = vm.createContext(win);
  vm.runInContext(source, context, { filename: "injected.js" });

  const page = {
    window: win,
    clock,
    posted,
    sent,
    timeouts,
    intervals,
    /** Set the page clock (ms since injected.js started) before the next call. */
    at(ms) {
      clock.now = ms;
      return page;
    },
    push(...entries) {
      return win.dataLayer.push(...entries);
    },
    gtag(...args) {
      return win.gtag(...args);
    },
    addScript(src) {
      scripts.push({ src });
    },
    /** Fire DOMContentLoaded and the pending timeouts (the 500 ms detection pass). */
    finishLoading() {
      for (const fn of listeners.DOMContentLoaded.splice(0)) fn();
      for (const t of timeouts.splice(0)) t.fn();
      return page;
    },
    /** Run one tick of the periodic re-validation interval. */
    tick() {
      for (const t of intervals) t.fn();
      return page;
    },
    /** Raw page-context state, copied into this realm. */
    debugState() {
      return JSON.parse(JSON.stringify(win.__cfDebug));
    },
    /** Deliver a window "message" event to the page's listeners. */
    deliver(data) {
      for (const fn of listeners.message) fn({ data });
    },
    /** Run injected.js a second time in the same page (e.g. content.js injected again). */
    reinject() {
      vm.runInContext(source, context, { filename: "injected.js" });
    },
    /** Ask for state the way content.js does: a get-state postMessage. */
    requestState(requestId = "req-1") {
      page.deliver({ source: "cf-debug-content", type: "get-state", requestId });
      const reply = posted.filter((m) => m.type === "full-state" && m.requestId === requestId).at(-1);
      return reply && reply.payload;
    },
    rule(id) {
      return page.requestState().validation.find((r) => r.id === id);
    },
    verdict(tagName) {
      return page.requestState().tagImpact.find((t) => t.name === tagName);
    },
  };
  return page;
}
