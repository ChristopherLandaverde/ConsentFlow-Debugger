// scripts/consentflow-mcp.mjs: the MCP server (L2). Tools are called through the SDK's own
// client, in process over the in-memory transport and once as a real stdio child process.
// Fixtures are served locally and every other host is stubbed with 204, as in
// tests/consentflow-check.test.mjs, so nothing leaves the machine.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createReadStream, existsSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { after, before, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { main } from "../scripts/consentflow-check.mjs";
import { createServer } from "../scripts/mcp/server.mjs";

const FIXTURES = fileURLToPath(new URL("./fixtures/", import.meta.url));
const ENTRY = fileURLToPath(new URL("../scripts/consentflow-mcp.mjs", import.meta.url));
const NOISE = fileURLToPath(new URL("./helpers/stdout-noise.mjs", import.meta.url));
const WAIT = 2000;

// A page with a consent default and a dataLayer, and nothing that reaches another host: the
// stdio test runs the real server, which has no host stub.
const LOCAL_ONLY = `<!doctype html><title>local</title><script>
window.dataLayer = window.dataLayer || [];
function gtag(){ dataLayer.push(arguments); }
gtag('consent', 'default', { ad_storage: 'denied', analytics_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
</script>`;

let http;
let origin;

before(async () => {
  http = createHttpServer((req, res) => {
    const path = new URL(req.url, "http://x").pathname.replace(/^\/+/, "");
    if (path === "slow.js") return; // never answered: see tests/consentflow-check.test.mjs
    if (path === "local-only.html") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(LOCAL_ONLY);
      return;
    }
    const file = FIXTURES + path;
    if (!/^[\w-]+\.html$/.test(path) || !existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    createReadStream(file).pipe(res);
  });
  await new Promise((resolve) => http.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${http.address().port}`;
});
after(() => {
  http.closeAllConnections();
  http.close();
});

const offline = async (context) => {
  await context.route(
    (url) => url.origin !== origin,
    (route) => route.fulfill({ status: 204, body: "" }),
  );
};

async function connect(options = { route: offline }) {
  const server = createServer(options);
  const client = new Client({ name: "consentflow-test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, close: () => Promise.all([client.close(), server.close()]) };
}

// Timings are measured per page load: zero the `ms` fields and the "+N ms" / "N ms" in copy.
function withoutTimings(value) {
  if (Array.isArray(value)) return value.map(withoutTimings);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, k === "ms" ? 0 : withoutTimings(v)]));
  }
  return typeof value === "string" ? value.replace(/\+?\d+ ms\b/g, "N ms") : value;
}

async function cliReport(url) {
  const out = { text: "", write: (s) => (out.text += s) };
  await main([url, "--wait", String(WAIT)], { stdout: out, stderr: { write() {} }, route: offline });
  return JSON.parse(out.text);
}

let mcp;
before(async () => {
  mcp = await connect();
});
after(() => mcp.close());

describe("tools/list", () => {
  test("lists the three read-only tools", async () => {
    const { tools } = await mcp.client.listTools();
    assert.deepEqual(tools.map((t) => t.name).sort(), ["check_url", "explain_finding", "list_checks"]);
    for (const t of tools) {
      assert.match(t.description, /^Read-only\./, t.name);
      assert.equal(t.annotations.readOnlyHint, true, t.name);
      assert.equal(t.annotations.destructiveHint, false, t.name);
    }
    const check = tools.find((t) => t.name === "check_url");
    assert.deepEqual(check.inputSchema.required, ["url"]);
    assert.deepEqual(check.inputSchema.properties.consent.enum, ["none", "accept", "deny"]);
  });
});

describe("check_url", () => {
  for (const [name, page, status] of [
    ["BROKEN", "popup-states.html?s=broken", "broken"],
    ["VERIFIED", "popup-states.html?s=verified", "verified"],
  ]) {
    test(`on the ${name} fixture it returns the CLI's JSON report, timings aside`, async () => {
      const url = `${origin}/${page}`;
      const [result, cli] = await Promise.all([
        mcp.client.callTool({ name: "check_url", arguments: { url, waitMs: WAIT } }),
        cliReport(url),
      ]);
      assert.equal(result.isError, undefined);
      assert.equal(result.structuredContent.verdict.status, status);
      assert.deepEqual(withoutTimings(result.structuredContent), withoutTimings(cli));
      // The text content is the same report, printed as the CLI prints it.
      assert.equal(result.content[0].text, JSON.stringify(result.structuredContent, null, 2));
      // Evidence on every finding.
      for (const f of result.structuredContent.findings) assert.ok(f.evidence.length > 0, f.id);
    });
  }

  for (const url of [
    "file:///etc/hosts",
    "data:text/html,<p>hi</p>",
    "chrome://settings",
    "javascript:alert(1)",
    "ftp://example.com/",
    "about:blank",
    "not a url",
  ]) {
    test(`refuses ${url}`, async () => {
      const result = await mcp.client.callTool({ name: "check_url", arguments: { url } });
      assert.equal(result.isError, true);
      assert.equal(result.structuredContent.error.code, "invalid_url");
      assert.match(result.structuredContent.error.message, /Only http and https|Not a valid URL/);
      assert.deepEqual(JSON.parse(result.content[0].text), result.structuredContent);
    });
  }

  test("input outside the schema is a tool error, not a crash", async () => {
    for (const args of [{ url: `${origin}/x.html`, consent: "maybe" }, { url: `${origin}/x.html`, waitMs: -1 }, {}]) {
      const result = await mcp.client.callTool({ name: "check_url", arguments: args });
      assert.equal(result.isError, true, JSON.stringify(args));
      assert.match(result.content[0].text, /Input validation error/);
    }
  });

  test("a page that can't be loaded is navigation_failed", async () => {
    const result = await mcp.client.callTool({ name: "check_url", arguments: { url: `${origin}/missing.html`, waitMs: 0 } });
    assert.equal(result.isError, true);
    assert.equal(result.structuredContent.error.code, "navigation_failed");
    assert.match(result.structuredContent.error.message, /answered HTTP 404/);
  });

  test("a capture that never finishes is capture_not_ready, with the report and no verdict", async () => {
    const slow = await connect({ route: offline, timeouts: { nav: 1500, ready: 1000 } });
    try {
      const result = await slow.client.callTool({
        name: "check_url",
        arguments: { url: `${origin}/popup-states.html?s=slow`, waitMs: 0 },
      });
      assert.equal(result.isError, true);
      const { error } = result.structuredContent;
      assert.equal(error.code, "capture_not_ready");
      assert.match(error.message, /There is no verdict/);
      assert.equal(error.report.capture, "not_ready");
      assert.equal(error.report.verdict, null);
    } finally {
      await slow.close();
    }
  });

  test("more concurrent runs than the cap get a busy error; the others finish", async () => {
    const capped = await connect({ route: offline, maxConcurrentChecks: 2 });
    try {
      const url = `${origin}/popup-states.html?s=verified`;
      const calls = [0, 1, 2].map(() => capped.client.callTool({ name: "check_url", arguments: { url, waitMs: 1500 } }));
      // An invalid URL sent while both slots are busy gets invalid_url, not busy.
      const bad = await capped.client.callTool({ name: "check_url", arguments: { url: "file:///etc/hosts" } });
      assert.equal(bad.structuredContent.error.code, "invalid_url");
      const results = await Promise.all(calls);
      const busy = results.filter((r) => r.isError);
      assert.equal(busy.length, 1);
      assert.equal(busy[0].structuredContent.error.code, "busy");
      assert.equal(busy[0].structuredContent.error.max, 2);
      assert.deepEqual(results.filter((r) => !r.isError).map((r) => r.structuredContent.verdict.status), ["verified", "verified"]);
      // The slots are free again once those runs finish.
      const again = await capped.client.callTool({ name: "check_url", arguments: { url, waitMs: 0 } });
      assert.equal(again.isError, undefined);
    } finally {
      await capped.close();
    }
  });

  test("a requested click that didn't happen is returned as the report, with consentInteraction not_found", async () => {
    const quick = await connect({ route: offline, timeouts: { banner: 1000 } });
    try {
      const result = await quick.client.callTool({
        name: "check_url",
        arguments: { url: `${origin}/popup-states.html?s=verified`, consent: "accept", waitMs: WAIT },
      });
      assert.equal(result.isError, undefined);
      assert.equal(result.structuredContent.consentMode, "accept");
      assert.equal(result.structuredContent.consentInteraction, "not_found");
    } finally {
      await quick.close();
    }
  });
});

describe("list_checks and explain_finding", () => {
  test("list_checks names every rule a real run reports, and the tags it judged", async () => {
    const list = (await mcp.client.callTool({ name: "list_checks", arguments: {} })).structuredContent;
    assert.equal(list.schemaVersion, "1");
    assert.deepEqual(list.rules.map((r) => r.id), [
      "consent-default-exists",
      "consent-default-before-config",
      "v2-types-present",
      "wait-for-update",
      "consent-update-received",
      "gcs-consistency",
      "no-duplicate-defaults",
      "default-before-update",
    ]);
    for (const r of list.rules) {
      assert.ok(r.name && r.description, r.id);
      assert.equal(r.source.file, "injected.js");
      assert.equal(r.needs.length > 0, r.statuses.includes("not_checked"), r.id);
    }
    assert.deepEqual(list.rules.find((r) => r.id === "wait-for-update").needs, ["consent_default", "cmp"]);
    assert.equal(list.tags.length, 11);
    const gtm = list.tags.find((t) => t.name === "Google Tag Manager");
    assert.equal(gtm.judged, false);
    assert.equal(gtm.id, null);
    assert.deepEqual(list.tags.find((t) => t.name === "Facebook Pixel"), {
      id: "tag:Facebook Pixel",
      name: "Facebook Pixel",
      type: "advertising",
      vendor: "facebook",
      consentTypes: ["ad_storage"],
      judged: true,
      statuses: ["broken", "verified", "not_checked"],
      cookielessPings: false,
      source: list.tags.find((t) => t.name === "Facebook Pixel").source,
    });

    // Only the consent-mode-aware Google tags (injected.js CONSENT_MODE_TAGS) can send cookieless
    // pings, the one tag verdict that gives review.
    for (const t of list.tags.filter((x) => x.judged)) {
      const google = ["Google Analytics 4", "Google Ads", "Floodlight"].includes(t.name);
      assert.equal(t.cookielessPings, google, t.name);
      assert.equal(t.statuses.includes("review"), google, t.name);
    }
    assert.ok(!list.tags.find((t) => t.name === "Facebook Pixel").statuses.includes("review"));

    for (const page of ["popup-states.html?s=broken", "popup-states.html?s=verified", "popup-states.html?s=zero"]) {
      const report = (await mcp.client.callTool({ name: "check_url", arguments: { url: `${origin}/${page}`, waitMs: WAIT } }))
        .structuredContent;
      const ruleFindings = report.findings.filter((f) => !f.id.startsWith("tag:"));
      assert.deepEqual(ruleFindings.map((f) => f.id).sort(), list.rules.map((r) => r.id).sort(), page);
      for (const f of ruleFindings) assert.ok(list.rules.find((r) => r.id === f.id).statuses.includes(f.status), `${page} ${f.id}`);
      for (const f of report.findings.filter((x) => x.id.startsWith("tag:"))) {
        const tag = list.tags.find((t) => t.id === f.id);
        assert.ok(tag && tag.statuses.includes(f.status), `${page} ${f.id}`);
      }
    }
  });

  test("explain_finding gives the same copy findings.js gives a real run", async () => {
    // The zero fixture has checks that couldn't run; their copy has no measured values.
    const report = (await mcp.client.callTool({
      name: "check_url",
      arguments: { url: `${origin}/popup-states.html?s=zero`, waitMs: WAIT },
    })).structuredContent;
    const notChecked = report.findings.filter((f) => f.status === "not_checked");
    assert.ok(notChecked.length > 0);
    for (const f of notChecked) {
      const result = await mcp.client.callTool({ name: "explain_finding", arguments: { id: f.id } });
      assert.equal(result.isError, undefined, f.id);
      const explained = result.structuredContent;
      const copy = f.id.startsWith("tag:") ? [explained.copy.idle] : explained.copy.not_checked;
      const match = copy.find((c) => c.observed === f.observed);
      assert.ok(match, f.id);
      const { needs, ...fields } = match;
      assert.deepEqual(fields, { status: f.status, title: f.title, observed: f.observed, consequence: f.consequence, fix: f.fix, verify: f.verify, evidence: f.evidence });
    }
  });

  test("explain_finding returns the findings.js source for copy built from measured values", async () => {
    const rule = (await mcp.client.callTool({ name: "explain_finding", arguments: { id: "consent-default-before-config" } }))
      .structuredContent;
    assert.equal(rule.kind, "rule");
    assert.equal(rule.copySource.file, "popup/findings.js");
    assert.deepEqual(rule.copySource.covers, ["broken", "verified"]);
    assert.match(rule.copySource.code, /^ {4}'consent-default-before-config': function \(r\) \{/);
    assert.match(rule.copySource.code, /Google tag configured before the consent default/);
    assert.match(rule.copySource.code, /\n {4}\},$/);
    assert.equal(rule.ruleSource.file, "injected.js");

    const tag = (await mcp.client.callTool({ name: "explain_finding", arguments: { id: "tag:Facebook Pixel" } })).structuredContent;
    assert.equal(tag.kind, "tag");
    assert.equal(tag.copy.blocked.title, "Facebook Pixel held back while ad_storage is denied");
    assert.deepEqual(tag.statuses, ["broken", "verified", "not_checked"]);
    assert.ok(!tag.verdicts.includes("cookieless"));
    assert.deepEqual(tag.copySource.covers, ["violation", "firing"]);

    const ga4 = (await mcp.client.callTool({ name: "explain_finding", arguments: { id: "tag:Google Analytics 4" } })).structuredContent;
    assert.deepEqual(ga4.statuses, ["broken", "review", "verified", "not_checked"]);
    assert.deepEqual(ga4.copySource.covers, ["violation", "cookieless", "firing"]);
    assert.match(tag.copySource.code, /^ {2}function tagCopy\(t, state\) \{/);
  });

  test("an unknown id is unknown_finding, listing the ids there are", async () => {
    for (const id of ["nope", "tag:Google Tag Manager"]) {
      const result = await mcp.client.callTool({ name: "explain_finding", arguments: { id } });
      assert.equal(result.isError, true);
      assert.equal(result.structuredContent.error.code, "unknown_finding");
      assert.ok(result.structuredContent.error.known.includes("gcs-consistency"));
      assert.ok(result.structuredContent.error.known.includes("tag:Facebook Pixel"));
    }
  });
});

describe("stdio", () => {
  test("a real server process writes nothing but JSON-RPC to stdout, even when code logs", async () => {
    // stdout-noise.mjs (loaded with --import) logs through console and process.stdout.write
    // when the first request arrives, after the server is up.
    const child = spawn(process.execPath, ["--import", NOISE, ENTRY], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    const exited = new Promise((resolve) => child.on("exit", resolve));
    try {
      await new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(`server not ready: ${stderr}`)), 15000);
        child.stderr.on("data", () => {
          if (stderr.includes("ready on stdio")) clearTimeout(t), resolve();
        });
      });
      const send = (msg) => child.stdin.write(JSON.stringify({ jsonrpc: "2.0", ...msg }) + "\n");
      const responses = new Map();
      const waitFor = (id) =>
        new Promise((resolve, reject) => {
          const t = setTimeout(() => reject(new Error(`no response ${id}; stdout: ${stdout}; stderr: ${stderr}`)), 60000);
          const poll = () => {
            for (const line of stdout.split("\n").filter(Boolean)) {
              const m = JSON.parse(line);
              if (m.id !== undefined) responses.set(m.id, m);
            }
            if (responses.has(id)) clearTimeout(t), resolve(responses.get(id));
            else setTimeout(poll, 50);
          };
          poll();
        });
      send({ id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "0" } } });
      await waitFor(1);
      send({ method: "notifications/initialized" });
      send({ id: 2, method: "tools/list" });
      send({ id: 3, method: "tools/call", params: { name: "list_checks", arguments: {} } });
      send({ id: 4, method: "tools/call", params: { name: "explain_finding", arguments: { id: "gcs-consistency" } } });
      send({ id: 5, method: "tools/call", params: { name: "check_url", arguments: { url: "file:///etc/passwd" } } });
      send({ id: 6, method: "tools/call", params: { name: "check_url", arguments: { url: `${origin}/local-only.html`, waitMs: 500 } } });
      const [list, checks, explained, refused, checked] = await Promise.all([2, 3, 4, 5, 6].map(waitFor));
      assert.equal(list.result.tools.length, 3);
      assert.equal(checks.result.structuredContent.rules.length, 8);
      assert.equal(explained.result.structuredContent.id, "gcs-consistency");
      assert.equal(refused.result.isError, true);
      assert.equal(refused.result.structuredContent.error.code, "invalid_url");
      assert.equal(checked.result.structuredContent.capture, "complete");
      assert.equal(checked.result.structuredContent.findings[0].id !== undefined, true);
    } finally {
      child.stdin.end();
      await Promise.race([exited, new Promise((r) => setTimeout(r, 5000))]);
      child.kill();
    }
    // Every stdout line is a JSON-RPC 2.0 message; the noise went to stderr.
    const lines = stdout.split("\n");
    assert.equal(lines.pop(), "");
    assert.ok(lines.length >= 6);
    for (const line of lines) assert.equal(JSON.parse(line).jsonrpc, "2.0", line);
    for (const noise of ["noise: console.log", "noise: console.info", "noise: console.debug", "noise: console.table", "noise: stdout.write"]) {
      assert.ok(!stdout.includes(noise), noise);
      assert.ok(stderr.includes(noise), noise);
    }
  });
});
