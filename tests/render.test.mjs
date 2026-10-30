// popup/render.js: the pure helpers behind the side panel's timeline and requests tables.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import vm from "node:vm";

const context = vm.createContext({});
vm.runInContext(readFileSync(new URL("../popup/render.js", import.meta.url), "utf8"), context);
const R = context.CFRender;
const plain = (v) => JSON.parse(JSON.stringify(v));

describe("consentChanges", () => {
  test("a default lists every type it sets, denied first; region and wait_for_update are not consent", () => {
    const out = plain(R.consentChanges([
      { id: 1, type: "consent_default", detail: { analytics_storage: "granted", ad_storage: "denied", wait_for_update: 500, region: ["DE"] } },
    ]));
    assert.deepEqual(out, { 1: [{ key: "ad_storage", from: null, to: "denied" }, { key: "analytics_storage", from: null, to: "granted" }] });
  });
  test("an update lists only what it changed, from and to", () => {
    const out = plain(R.consentChanges([
      { id: 1, type: "consent_default", detail: { ad_storage: "denied", analytics_storage: "denied" } },
      { id: 2, type: "config", detail: {} },
      { id: 3, type: "consent_update", detail: { ad_storage: "denied", analytics_storage: "granted" } },
      { id: 4, type: "consent_update", detail: { analytics_storage: "granted" } },
    ]));
    assert.deepEqual(out[3], [{ key: "analytics_storage", from: "denied", to: "granted" }]);
    assert.deepEqual(out[4], []);
    assert.equal(out[2], undefined);
  });
  test("handles a missing timeline", () => {
    assert.deepEqual(plain(R.consentChanges(undefined)), {});
  });
});

describe("requestConsentRows", () => {
  test("pairs what the request carried with the page's consent and flags disagreement", () => {
    const rows = plain(R.requestConsentRows({
      requestConsent: { ad_storage: "granted", analytics_storage: "denied" },
      consentAtRequest: { ad_storage: "denied", analytics_storage: "denied", ad_user_data: "denied" },
    }));
    assert.deepEqual(rows, [
      { key: "ad_storage", carried: "granted", onPage: "denied", mismatch: true },
      { key: "analytics_storage", carried: "denied", onPage: "denied", mismatch: false },
      { key: "ad_user_data", carried: null, onPage: "denied", mismatch: false },
    ]);
  });
  test("keeps an undocumented gcd letter with the row, even when nothing else is known (#32)", () => {
    const rows = plain(R.requestConsentRows({
      requestConsent: { analytics_storage: "granted" },
      gcdUnknown: { analytics_storage: "r", ad_user_data: "r" },
      consentAtRequest: { analytics_storage: "granted" },
    }));
    assert.deepEqual(rows, [
      { key: "analytics_storage", carried: "granted", onPage: "granted", mismatch: false, gcdLetter: "r" },
      { key: "ad_user_data", carried: null, onPage: null, mismatch: false, gcdLetter: "r" },
    ]);
  });

  test("a request with no consent either way has no rows", () => {
    assert.deepEqual(plain(R.requestConsentRows({ host: "www.facebook.com" })), []);
  });
});

describe("escaping", () => {
  test("esc covers markup and both quote styles; fmt only turns backticks into code", () => {
    assert.equal(R.esc(`<a href="x" title='y'>&</a>`), "&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;");
    assert.equal(R.fmt("set `<b>` now"), "set <code>&lt;b&gt;</code> now");
  });
  test("disclosure buttons escape their key and label", () => {
    assert.match(R.disclosureButton('a"b', "c", false, "<x>"), /data-toggle="a&quot;b".*&lt;x&gt;/);
  });
  test("unknown consent values are escaped", () => {
    assert.equal(R.consentValue("<i>"), '<span class="cv">&lt;i&gt;</span>');
  });
});
