// scripts/consentflow-check.mjs: the headless runner, run in real Chromium (Playwright) on
// the bundled fixtures, served by a local HTTP server. Every request to another host is
// answered locally with 204, so nothing leaves the machine; injected.js records requests
// before they are sent, so the stub doesn't change what is captured.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createReadStream, existsSync } from "node:fs";
import { createServer } from "node:http";
import { after, before, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { buildReport, capture, check, exitCodeFor, main } from "../scripts/consentflow-check.mjs";
import { loadFindings } from "./helpers/findings.mjs";
import { loadPopup } from "./helpers/popup-dom.mjs";
import { states } from "./helpers/states.mjs";

const FIXTURES = fileURLToPath(new URL("./fixtures/", import.meta.url));
const SCRIPT = fileURLToPath(new URL("../scripts/consentflow-check.mjs", import.meta.url));
const WAIT = 2000;

let server;
let origin;

before(async () => {
  server = createServer((req, res) => {
    const path = new URL(req.url, "http://x").pathname.replace(/^\/+/, "");
    const file = FIXTURES + path;
    if (!/^[\w-]+\.html$/.test(path) || !existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    createReadStream(file).pipe(res);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

// Third-party hosts are stubbed: only the local fixture server is really reached.
const offline = async (context) => {
  await context.route(
    (url) => url.origin !== origin,
    (route) => route.fulfill({ status: 204, body: "" }),
  );
};
// Every finding title the popup rendered, in order: problems (h2.finding-title), checks that
// didn't run (p.nc-title) and passed checks (p.passed-title), tags and hidden labels stripped.
function renderedTitles(html) {
  const re = /<(h2|p)\b[^>]*class="(?:finding-title|nc-title|passed-title)"[^>]*>(.*?)<\/\1>/g;
  return [...html.matchAll(re)].map((m) =>
    m[2]
      .replace(/<span[^>]*(?:visually-hidden|aria-hidden="true")[^>]*>.*?<\/span>/g, "")
      .replace(/<[^>]+>/g, "")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, "&"),
  );
}

const run = (page, options = {}) => check(`${origin}/${page}`, { wait: WAIT, route: offline, ...options });

describe("verdicts on the bundled fixtures", () => {
  test("the broken sample is BROKEN, led by the config-before-default finding", async () => {
    const report = await run("popup-states.html?s=broken");
    assert.equal(report.verdict.status, "broken");
    assert.equal(report.verdict.label, "× BROKEN");
    assert.equal(report.verdict.title, "2 consent problems on this page.");
    const broken = report.findings.filter((f) => f.status === "broken");
    assert.deepEqual(
      broken.map((f) => f.id),
      ["consent-default-before-config", "tag:Facebook Pixel"],
    );
    assert.equal(broken[0].title, "Google tag configured before the consent default");
    assert.match(broken[0].observed, /^`config` for G-FIXTURE ran at \+\d+ ms; the consent default ran at \+\d+ ms\.$/);
    assert.equal(broken[1].title, "Facebook Pixel sent 2 requests while ad_storage was denied");
    assert.deepEqual(
      report.requests.map((r) => [r.vendor, r.host, r.path, r.tag]),
      [
        ["facebook", "www.facebook.com", "/tr", "Facebook Pixel"],
        ["facebook", "www.facebook.com", "/tr", "Facebook Pixel"],
      ],
    );
    assert.equal(report.requests[0].consentAtRequest.ad_storage, "denied");
    assert.equal(exitCodeFor(report), 1);
  });

  test("the verified sample is VERIFIED with all 9 checks passed", async () => {
    const report = await run("popup-states.html?s=verified");
    assert.equal(report.verdict.status, "verified");
    assert.equal(report.verdict.label, "✓ VERIFIED");
    assert.equal(report.verdict.detail, "All 9 checks passed on this page load.");
    assert.ok(report.findings.every((f) => f.status === "verified"));
    assert.deepEqual(
      report.requests.map((r) => [r.tag, r.tagId, r.gcs]),
      [["Google Analytics 4", "G-FIXTURE", "G101"]],
    );
    assert.equal(exitCodeFor(report), 0);
  });

  test("a page with Consent Mode but no consent update yet is INCOMPLETE (exit 3)", async () => {
    const report = await run("popup-states.html?s=zero");
    assert.equal(report.verdict.status, "incomplete");
    assert.equal(exitCodeFor(report), 3);
  });
});

describe("JSON schema", () => {
  test("the report shape is pinned (schemaVersion 1)", async () => {
    const report = await run("popup-states.html?s=broken");
    assert.deepEqual(Object.keys(report), [
      "schemaVersion",
      "tool",
      "url",
      "consentMode",
      "consentInteraction",
      "consentButton",
      "verdict",
      "findings",
      "requests",
    ]);
    assert.equal(report.schemaVersion, "1");
    assert.equal(report.tool, "consentflow");
    assert.equal(report.url, `${origin}/popup-states.html?s=broken`);
    assert.equal(report.consentMode, "none");
    assert.equal(report.consentInteraction, "not_requested");
    assert.equal(report.consentButton, null);

    assert.deepEqual(Object.keys(report.verdict), ["status", "label", "title", "detail", "counts"]);
    assert.ok(["broken", "review", "incomplete", "verified"].includes(report.verdict.status));
    assert.deepEqual(Object.keys(report.verdict.counts), ["broken", "review", "notChecked", "verified", "total"]);
    assert.equal(report.verdict.counts.total, report.findings.length);

    assert.ok(report.findings.length > 0);
    for (const f of report.findings) {
      assert.deepEqual(Object.keys(f), ["id", "status", "title", "observed", "consequence", "fix", "verify", "evidence"]);
      assert.ok(["broken", "review", "not_checked", "verified"].includes(f.status), f.status);
      for (const k of ["id", "title", "observed", "consequence", "verify"]) assert.equal(typeof f[k], "string", `${f.id}.${k}`);
      assert.ok(Array.isArray(f.fix) && f.fix.length > 0 && f.fix.every((s) => typeof s === "string"), f.id);
      assert.ok(Array.isArray(f.evidence) && f.evidence.length > 0, f.id);
      for (const e of f.evidence) assert.deepEqual(Object.keys(e), ["label", "value"]);
    }

    assert.ok(report.requests.length > 0);
    for (const r of report.requests) {
      assert.deepEqual(Object.keys(r), ["ms", "method", "vendor", "host", "path", "tag", "tagId", "gcs", "gcd", "consentAtRequest"]);
      assert.equal(typeof r.ms, "number");
      assert.equal(typeof r.consentAtRequest, "object");
    }
    // Round-trips as JSON with nothing lost.
    assert.deepEqual(JSON.parse(JSON.stringify(report)), report);
  });
});

describe("equivalence with the popup", () => {
  test("the popup renders the same verdict and findings, in the same order, from the runner's capture", async () => {
    const url = `${origin}/popup-states.html?s=broken`;
    const { state } = await capture(url, { wait: WAIT, route: offline });
    const report = buildReport(state, { url, consentMode: "none", consentInteraction: "not_requested", consentButton: null });
    const popup = loadPopup({ responses: [state] });
    assert.equal(popup.text("verdictLabel"), report.verdict.label);
    assert.equal(popup.text("verdictTitle"), report.verdict.title);
    assert.equal(popup.text("verdictDetail"), report.verdict.detail);
    assert.deepEqual(
      renderedTitles(popup.html("findings")),
      report.findings.map((f) => f.title),
    );
  });

  test("the broken fixture gives the findings the popup tests expect for the same capture", async () => {
    const report = await run("popup-states.html?s=broken");
    const expected = loadFindings().buildFindings(states.broken());
    assert.deepEqual(
      report.findings.map((f) => [f.id, f.status, f.title]),
      expected.map((f) => [f.id, f.status, f.title]),
    );
    // tests/popup.test.mjs: "the most severe finding comes first …"
    assert.equal(report.findings[0].title, "Google tag configured before the consent default");
    assert.equal(report.findings[1].title, "Facebook Pixel sent 2 requests while ad_storage was denied");
  });

  test("the verified fixture matches the popup tests' verified state", async () => {
    const report = await run("popup-states.html?s=verified");
    const expected = loadFindings().buildFindings(states.verified());
    assert.deepEqual(
      report.findings.map((f) => [f.id, f.status, f.title]).sort(),
      expected.map((f) => [f.id, f.status, f.title]).sort(),
    );
  });
});

describe("--consent", () => {
  test("accept clicks the OneTrust accept button and captures the update and the hit after it", async () => {
    const report = await run("cmp-banner.html", { consent: "accept" });
    assert.equal(report.consentMode, "accept");
    assert.equal(report.consentInteraction, "clicked");
    assert.deepEqual(report.consentButton, { cmp: "OneTrust", selector: "#onetrust-accept-btn-handler" });
    assert.equal(report.verdict.status, "verified");
    assert.equal(report.requests.length, 1);
    assert.equal(report.requests[0].consentAtRequest.analytics_storage, "granted");
  });

  test("deny clicks the OneTrust reject-all button", async () => {
    const report = await run("cmp-banner.html", { consent: "deny" });
    assert.equal(report.consentInteraction, "clicked");
    assert.deepEqual(report.consentButton, { cmp: "OneTrust", selector: "#onetrust-reject-all-handler" });
    assert.equal(report.findings.find((f) => f.id === "consent-update-received").status, "verified");
    assert.equal(report.requests.length, 0);
  });

  test("none touches nothing, so the banner's choice is never captured", async () => {
    const report = await run("cmp-banner.html");
    assert.equal(report.consentInteraction, "not_requested");
    assert.equal(report.findings.find((f) => f.id === "consent-update-received").status, "not_checked");
  });

  test("with no known CMP button on the page it reports not_found and exits 3, without guessing", async () => {
    const report = await run("popup-states.html?s=verified", { consent: "accept" });
    assert.equal(report.consentInteraction, "not_found");
    assert.equal(report.consentButton, null);
    assert.equal(exitCodeFor(report), 3);
  });
});

describe("CLI", () => {
  const sink = () => {
    const out = { text: "", write: (s) => (out.text += s) };
    return out;
  };

  test("prints JSON and exits 1 on the broken fixture", async () => {
    const stdout = sink();
    const code = await main([`${origin}/popup-states.html?s=broken`, "--wait", String(WAIT)], { stdout, stderr: sink(), route: offline });
    assert.equal(code, 1);
    assert.equal(JSON.parse(stdout.text).verdict.status, "broken");
  });

  test("--format text prints the verdict line first and exits 0 on the verified fixture", async () => {
    const stdout = sink();
    const code = await main([`${origin}/popup-states.html?s=verified`, "--format=text", "--wait", String(WAIT)], { stdout, stderr: sink(), route: offline });
    assert.equal(code, 0);
    assert.match(stdout.text, /^✓ VERIFIED {2}Consent is wired correctly on this page\.\n/);
  });

  test("a page that can't be loaded exits 2", async () => {
    const stderr = sink();
    const code = await main([`${origin}/missing.html`, "--wait", "0"], { stdout: sink(), stderr, route: offline });
    assert.equal(code, 2);
    assert.match(stderr.text, /answered HTTP 404/);
  });

  for (const [args, message] of [
    [[], /A URL is required/],
    [["file:///etc/hosts"], /Only http and https/],
    [["https://example.com", "--consent", "maybe"], /--consent must be none, accept or deny/],
    [["https://example.com", "--wait", "soon"], /--wait must be a whole number/],
    [["https://example.com", "--format", "xml"], /--format must be json or text/],
    [["https://example.com", "--bogus"], /Unknown option --bogus/],
  ]) {
    test(`usage error exits 2: ${args.join(" ") || "(no arguments)"}`, () => {
      const result = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8" });
      assert.equal(result.status, 2);
      assert.match(result.stderr, message);
      assert.match(result.stderr, /Usage: node scripts\/consentflow-check\.mjs <url>/);
      assert.equal(result.stdout, "");
    });
  }
});
