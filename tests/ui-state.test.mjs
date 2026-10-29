// popup/ui-state.js: what the popup and side panel keep in chrome.storage.session.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../popup/ui-state.js", import.meta.url), "utf8");
const plain = (v) => JSON.parse(JSON.stringify(v));

function load(chrome) {
  const context = vm.createContext(chrome === undefined ? {} : { chrome });
  vm.runInContext(source, context);
  return context.CFUiState;
}

function fakeSession() {
  const store = new Map();
  return {
    store,
    chrome: {
      storage: {
        session: {
          get: (k, cb) => cb(store.has(k) ? { [k]: structuredClone(store.get(k)) } : {}),
          set: (items) => Object.entries(items).forEach(([k, v]) => store.set(k, structuredClone(v))),
          remove: (keys) => [].concat(keys).forEach((k) => store.delete(k)),
        },
      },
    },
  };
}

describe("sanitize", () => {
  const S = load();
  test("keeps only expanded, well-formed disclosure ids and a known view", () => {
    const out = plain(S.sanitize({ open: { "ev-a": true, "b c": true, "nc-x": false, d: "yes" }, view: "timeline", extra: 1 }, ["findings", "timeline"]));
    assert.deepEqual(out, { open: { "ev-a": true }, view: "timeline" });
  });
  test("falls back to the first view and an empty set for anything else", () => {
    assert.deepEqual(plain(S.sanitize("garbage", ["findings", "timeline"])), { open: {}, view: "findings" });
    assert.deepEqual(plain(S.sanitize({ view: "devtools" }, ["findings"])), { open: {}, view: "findings" });
    assert.deepEqual(plain(S.sanitize(null, null)), { open: {} });
  });
  test("caps the number of stored items", () => {
    const open = Object.fromEntries(Array.from({ length: 150 }, (_, i) => [`k${i}`, true]));
    assert.equal(Object.keys(S.sanitize({ open }).open).length, 100);
  });
});

describe("toggle", () => {
  const S = load();
  test("expands, then drops the key when collapsed, keeping the view", () => {
    const a = S.toggle({ open: {}, view: "requests" }, "req-raw");
    assert.deepEqual(plain(a), { open: { "req-raw": true }, view: "requests" });
    assert.deepEqual(plain(S.toggle(a, "req-raw")), { open: {}, view: "requests" });
  });
  test("does not mutate its input", () => {
    const state = { open: { a: true } };
    S.toggle(state, "b");
    assert.deepEqual(state, { open: { a: true } });
  });
});

describe("chrome.storage.session", () => {
  test("save and load round-trip per surface and tab", () => {
    const { chrome, store } = fakeSession();
    const S = load(chrome);
    S.save("panel", 7, { open: { "ev-x": true }, view: "consent" });
    S.save("popup", 7, { open: { passed: true } });
    assert.deepEqual([...store.keys()].sort(), ["cf.ui.panel.7", "cf.ui.popup.7"]);
    let got;
    S.load("panel", 7, ["findings", "consent"], (s) => (got = plain(s)));
    assert.deepEqual(got, { open: { "ev-x": true }, view: "consent" });
    S.load("panel", 8, ["findings", "consent"], (s) => (got = plain(s)));
    assert.deepEqual(got, { open: {}, view: "findings" });
  });
  test("forgetTab removes both surfaces for that tab only", () => {
    const { chrome, store } = fakeSession();
    const S = load(chrome);
    S.save("panel", 7, { open: {}, view: "findings" });
    S.save("popup", 7, { open: {} });
    S.save("popup", 9, { open: {} });
    S.forgetTab(7);
    assert.deepEqual([...store.keys()], ["cf.ui.popup.9"]);
  });
  test("without chrome.storage.session (or a tab) it uses defaults and stores nothing", () => {
    const S = load(undefined);
    let got;
    S.load("popup", 7, null, (s) => (got = plain(s)));
    assert.deepEqual(got, { open: {} });
    assert.doesNotThrow(() => S.save("popup", 7, { open: { a: true } }));
    const { chrome, store } = fakeSession();
    load(chrome).save("popup", null, { open: { a: true } });
    assert.equal(store.size, 0);
  });
  test("a throwing storage area does not break the surface", () => {
    const S = load({ storage: { session: { get() { throw new Error("x"); }, set() { throw new Error("x"); }, remove() { throw new Error("x"); } } } });
    let got;
    S.load("popup", 7, null, (s) => (got = plain(s)));
    assert.deepEqual(got, { open: {} });
    assert.doesNotThrow(() => S.save("popup", 7, { open: {} }));
    assert.doesNotThrow(() => S.forgetTab(7));
  });
});
