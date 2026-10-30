// popup/findings.js: the one verdict every summary is built from, and the finding copy
// (observed / consequence / fix / verify / evidence) for every rule and tag verdict.
// States come from the real injected.js, so the copy is tested against real rule output.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { loadFindings } from "./helpers/findings.mjs";
import { loadPage } from "./helpers/page.mjs";

const { buildFindings, computeVerdict, tagCopy } = loadFindings();

const GA4 = "https://region1.google-analytics.com/g/collect";
const GTAG = "https://www.googletagmanager.com/gtag/js?id=G-1";
const FULL_V2 = {
  ad_storage: "denied",
  analytics_storage: "denied",
  ad_user_data: "denied",
  ad_personalization: "denied",
};

// ─── Scenarios: each drives rules and tags into specific statuses ───────────
const scenarios = {
  bare() {
    return loadPage().finishLoading().requestState();
  },
  noConsentModeWithTags() {
    const page = loadPage({ scripts: [GTAG], globals: { fbq() {} } });
    page.at(10).push(["config", "G-1"]);
    page.at(30).window.fetch(`${GA4}?en=page_view`);
    page.at(40).window.fetch("https://www.facebook.com/tr?ev=PageView");
    return page.finishLoading().requestState();
  },
  // Consent default and config, no request and no banner choice: the GA4 demo page case.
  zeroRequests() {
    const page = loadPage({ scripts: [GTAG] });
    page.at(5).gtag("consent", "default", FULL_V2);
    page.at(20).push(["config", "G-1"]);
    return page.finishLoading().requestState();
  },
  configRace() {
    const page = loadPage({ scripts: [GTAG] });
    page.at(12).push(["config", "G-RACE"]);
    page.at(340).gtag("consent", "default", FULL_V2);
    return page.finishLoading().requestState();
  },
  configNoDefault() {
    const page = loadPage();
    page.at(12).push(["config", "G-1"]);
    return page.finishLoading().requestState();
  },
  reviewOnly() {
    const page = loadPage({ globals: { Cookiebot: {} } });
    page.at(1).gtag("consent", "default", { ad_storage: "denied", analytics_storage: "denied" });
    page.gtag("consent", "default", { ad_storage: "granted" });
    page.at(10).push(["config", "G-1"]);
    page.at(50).window.fetch(`${GA4}?gcs=G100`);
    page.at(800).gtag("consent", "update", { analytics_storage: "granted", ad_storage: "granted" });
    return page.finishLoading().requestState();
  },
  allPass() {
    const page = loadPage({ scripts: [GTAG], globals: { OneTrust: {} } });
    page.at(1).gtag("consent", "default", { ...FULL_V2, wait_for_update: 500 });
    page.at(10).push(["config", "G-1"]);
    page.at(900).gtag("consent", "update", { analytics_storage: "granted" });
    page.at(950).window.fetch(`${GA4}?gcs=G101`);
    return page.finishLoading().requestState();
  },
  // Every check passes except the ones that cannot apply here (no CMP recognized).
  notApplicableOnly() {
    const page = loadPage({ scripts: [GTAG] });
    page.at(1).gtag("consent", "default", FULL_V2);
    page.at(10).push(["config", "G-1"]);
    page.at(900).gtag("consent", "update", { analytics_storage: "granted" });
    page.at(950).window.fetch(`${GA4}?gcs=G101`);
    return page.finishLoading().requestState();
  },
  violations() {
    const page = loadPage({ scripts: [GTAG], globals: { fbq() {}, hj() {}, ttq: {} } });
    page.at(1).gtag("consent", "default", FULL_V2);
    page.at(10).push(["config", "G-1"]);
    page.at(410).window.fetch("https://www.facebook.com/tr?ev=PageView");
    page.at(1200).window.fetch("https://www.facebook.com/tr?ev=ViewContent");
    page.at(500).window.fetch(`${GA4}?gcs=G111`);
    return page.finishLoading().requestState();
  },
  updateBeforeDefault() {
    const page = loadPage();
    page.at(5).gtag("consent", "update", { ad_storage: "granted" });
    page.at(9).gtag("consent", "default", FULL_V2);
    return page.finishLoading().requestState();
  },
  updateOnly() {
    const page = loadPage();
    page.at(5).gtag("consent", "update", { ad_storage: "granted" });
    return page.finishLoading().requestState();
  },
  idleTag() {
    const page = loadPage({ globals: { hj() {} } });
    page.at(1).gtag("consent", "default", { ...FULL_V2, analytics_storage: "granted" });
    return page.finishLoading().requestState();
  },
};

const all = Object.fromEntries(Object.entries(scenarios).map(([k, fn]) => [k, fn()]));
const allFindings = Object.values(all).flatMap((state) => buildFindings(state));
const statuses = ["broken", "review", "not_checked", "verified"];

// Every sentence in a finding, for copy checks.
const sentencesOf = (f) =>
  [f.title, f.observed, f.consequence, ...f.fix, f.verify].flatMap((field) =>
    field.split(/(?<=[.?])\s+/).filter(Boolean),
  );

describe("computeVerdict", () => {
  test("with zero Google requests it reads 'Not enough data yet', never 'No issues'", () => {
    const v = computeVerdict(all.zeroRequests);
    assert.equal(v.status, "incomplete");
    assert.match(v.title, /^Not enough data yet\./);
    assert.doesNotMatch(`${v.title} ${v.detail}`, /no issues/i);
    assert.match(v.detail, /^\d+ of \d+ checks ran and passed\./);
    assert.match(v.detail, /Accept or reject the cookie banner, then reopen ConsentFlow\./);
  });

  test("a page without a consent default is broken and says so in one sentence", () => {
    const v = computeVerdict(all.bare);
    assert.equal(v.status, "broken");
    assert.equal(v.title, "This page has no Consent Mode.");
    assert.equal(v.label, "× BROKEN");
  });

  test("counts broken findings in the sentence", () => {
    assert.equal(computeVerdict(all.configRace).title, "1 consent problem on this page.");
    const v = computeVerdict(all.violations);
    assert.equal(v.status, "broken");
    assert.match(v.title, /^\d+ consent problems on this page\.$/);
    assert.equal(v.counts.broken, buildFindings(all.violations).filter((f) => f.status === "broken").length);
  });

  test("warnings without failures are 'review'", () => {
    const v = computeVerdict(all.reviewOnly);
    assert.equal(v.status, "review");
    assert.equal(v.label, "! REVIEW");
    assert.match(v.title, /to review on this page\.$/);
  });

  test("all checks passed is verified", () => {
    const v = computeVerdict(all.allPass);
    assert.equal(v.status, "verified");
    assert.equal(v.label, "✓ VERIFIED");
    assert.equal(v.title, "Consent is wired correctly on this page.");
    assert.equal(v.detail, `All ${v.counts.total} checks passed on this page load.`);
  });

  test("checks that cannot apply keep the verdict incomplete without asking for more data", () => {
    const v = computeVerdict(all.notApplicableOnly);
    assert.equal(v.status, "incomplete");
    assert.equal(v.title, "No problems in the checks that ran.");
    assert.match(v.detail, /couldn't run on this page\./);
  });

  test("nothing says verified or no issues while any check fails, warns or did not run", () => {
    for (const [name, state] of Object.entries(all)) {
      const v = computeVerdict(state);
      const c = v.counts;
      if (c.broken) assert.equal(v.status, "broken", name);
      else if (c.review) assert.equal(v.status, "review", name);
      else if (c.notChecked) assert.equal(v.status, "incomplete", name);
      else assert.equal(v.status, "verified", name);
      assert.equal(c.total, c.broken + c.review + c.notChecked + c.verified, name);
    }
  });

  test("offers the review link only when something is broken or needs review", () => {
    assert.equal(computeVerdict(all.violations).showReviewCta, true);
    assert.equal(computeVerdict(all.reviewOnly).showReviewCta, true);
    assert.equal(computeVerdict(all.zeroRequests).showReviewCta, false);
    assert.equal(computeVerdict(all.allPass).showReviewCta, false);
  });
});

describe("buildFindings", () => {
  test("orders broken, then review, then not checked, then verified", () => {
    for (const [name, state] of Object.entries(all)) {
      const order = buildFindings(state).map((f) => statuses.indexOf(f.status));
      assert.deepEqual(order, [...order].sort((a, b) => a - b), name);
    }
  });

  test("within a severity, the earliest observed problem comes first", () => {
    const broken = buildFindings(all.violations).filter((f) => f.status === "broken");
    const times = broken.map((f) => f.firstMs).filter((ms) => ms !== null);
    assert.deepEqual(times, [...times].sort((a, b) => a - b));
  });

  test("one finding per rule and per tag, with tags without Consent Mode folded into the missing default", () => {
    const findings = buildFindings(all.noConsentModeWithTags);
    assert.equal(findings.filter((f) => f.kind === "rule").length, 8);
    assert.equal(findings.filter((f) => f.kind === "tag").length, 0);
    const top = findings[0];
    assert.equal(top.id, "consent-default-exists");
    assert.match(top.observed, /Google Analytics 4/);
    assert.match(top.observed, /Facebook Pixel/);
  });

  test("checks that could not run carry the reason and what unlocks them", () => {
    const nc = buildFindings(all.zeroRequests).filter((f) => f.status === "not_checked");
    assert.ok(nc.length >= 2);
    for (const f of nc) {
      assert.match(f.needs, /^[a-z_]+$/, f.id);
      assert.ok(f.reason.length > 0, f.id);
    }
    assert.ok(nc.some((f) => f.needs === "google_request"));
  });

  test("maps tag verdicts to statuses: violation broken, blocked and firing verified, idle not checked", () => {
    const byName = (state) => Object.fromEntries(buildFindings(state).filter((f) => f.kind === "tag").map((f) => [f.tag, f.status]));
    assert.equal(byName(all.violations)["Facebook Pixel"], "broken");
    assert.equal(byName(all.violations)["Hotjar"], "verified");
    assert.equal(byName(all.allPass)["Google Analytics 4"], "verified");
    assert.equal(byName(all.idleTag)["Hotjar"], "not_checked");
  });

  test("a violation names the vendor, the request count, the denied type and when it started", () => {
    const meta = buildFindings(all.violations).find((f) => f.tag === "Facebook Pixel");
    assert.equal(meta.title, "Facebook Pixel sent 2 requests while ad_storage was denied");
    assert.match(meta.observed, /\+410 ms/);
    assert.deepEqual(
      meta.evidence.map((r) => r.label),
      ["Requests while denied", "First at", "Sent to", "Needs consent"],
    );
  });

  test("the config race reports both times and the gap", () => {
    const race = buildFindings(all.configRace).find((f) => f.id === "consent-default-before-config");
    assert.equal(race.status, "broken");
    assert.equal(race.observed, "`config` for G-RACE ran at +12 ms; the consent default ran at +340 ms.");
    assert.equal(race.consequence, "Requests in that 328 ms gap assume consent is granted.");
  });
});

describe("finding copy model (#14)", () => {
  test("every finding from every scenario has observed, consequence, fix, verify and evidence", () => {
    assert.ok(allFindings.length > 60);
    for (const f of allFindings) {
      const who = `${f.id} (${f.status})`;
      assert.ok(statuses.includes(f.status), who);
      for (const field of ["title", "observed", "consequence", "verify"]) {
        assert.equal(typeof f[field], "string", `${who} ${field}`);
        assert.ok(f[field].trim().length > 0, `${who} has a ${field}`);
      }
      assert.ok(Array.isArray(f.fix) && f.fix.length > 0, `${who} has a fix`);
      for (const step of f.fix) assert.ok(step.trim().length > 0, `${who} fix step`);
      assert.ok(Array.isArray(f.evidence) && f.evidence.length > 0, `${who} has evidence`);
      for (const row of f.evidence) assert.ok(row.label && String(row.value).length > 0, `${who} evidence row`);
    }
  });

  test("covers all 8 rules in every status they can reach", () => {
    const seen = new Set(allFindings.filter((f) => f.kind === "rule").map((f) => `${f.id}:${f.status}`));
    const expected = [
      "consent-default-exists:broken",
      "consent-default-exists:verified",
      "consent-default-before-config:broken",
      "consent-default-before-config:verified",
      "consent-default-before-config:not_checked",
      "v2-types-present:review",
      "v2-types-present:verified",
      "v2-types-present:not_checked",
      "wait-for-update:review",
      "wait-for-update:verified",
      "wait-for-update:not_checked",
      "consent-update-received:verified",
      "consent-update-received:not_checked",
      "gcs-consistency:broken",
      "gcs-consistency:verified",
      "gcs-consistency:not_checked",
      "no-duplicate-defaults:review",
      "no-duplicate-defaults:verified",
      "no-duplicate-defaults:not_checked",
      "default-before-update:broken",
      "default-before-update:verified",
      "default-before-update:not_checked",
    ];
    for (const key of expected) assert.ok(seen.has(key), `no scenario produced ${key}`);
  });

  test("covers every tag verdict, including the one folded into the missing default", () => {
    const state = all.noConsentModeWithTags;
    for (const verdict of ["violation", "blocked", "firing", "idle", "no_consent_mode"]) {
      for (const type of ["analytics", "advertising", "tag_manager"]) {
        const f = tagCopy(
          {
            name: "Test tag",
            type,
            vendor: "facebook",
            consentTypes: ["ad_storage"],
            requestCount: 3,
            preConsentCount: verdict === "violation" ? 2 : 0,
            firstPreConsentMs: verdict === "violation" ? 40 : null,
            deniedTypes: verdict === "violation" ? ["ad_storage"] : [],
            hosts: ["www.facebook.com"],
            verdict,
          },
          state,
        );
        const who = `${verdict}/${type}`;
        for (const field of ["title", "observed", "consequence", "verify"]) assert.ok(f[field].length > 0, `${who} ${field}`);
        assert.ok(f.fix.length > 0 && f.fix.every((s) => s.length > 0), `${who} fix`);
        assert.ok(f.evidence.length > 0, `${who} evidence`);
      }
    }
  });

  test("every fix names a concrete change, never a bare 'check your' or 'ensure'", () => {
    for (const f of allFindings) {
      for (const step of f.fix) {
        assert.doesNotMatch(step, /\b(check your|review your|ensure|make sure)\b/i, `${f.id}: ${step}`);
      }
    }
  });

  test("no blame words, shouting, exclamation marks or raw rule prefixes", () => {
    for (const f of allFindings) {
      const text = [f.title, f.observed, f.consequence, ...f.fix, f.verify, f.reason || ""].join(" ");
      assert.doesNotMatch(text, /\b(invalid|incorrect|wrong)\b|!|CRITICAL|VIOLATION|RACE CONDITION/, f.id);
    }
  });

  test("sentences stay at 18 words or fewer", () => {
    for (const f of allFindings) {
      for (const sentence of sentencesOf(f)) {
        const words = sentence.split(/\s+/).filter(Boolean).length;
        assert.ok(words <= 18, `${f.id}: "${sentence}" has ${words} words`);
      }
    }
  });

  test("verdict sentences stay short too", () => {
    for (const state of Object.values(all)) {
      const v = computeVerdict(state);
      for (const sentence of `${v.title} ${v.detail}`.split(/(?<=\.)\s+/)) {
        assert.ok(sentence.split(/\s+/).length <= 18, sentence);
      }
    }
  });
});
