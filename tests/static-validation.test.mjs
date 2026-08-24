import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const html = readFileSync("index.html", "utf8");
const contentScript = readFileSync("content.js", "utf8");
const playgroundScript = readFileSync("measurement-playground.js", "utf8");
const checklist = readFileSync("assets/consentflow-measurement-checklist.pdf");

test("the content script preserves the page-isolation message boundary", () => {
  assert.doesNotMatch(contentScript, /window\.ConsentInspector/);
  assert.match(contentScript, /postMessage/);
});

test("the landing page installs the disposable GTM container", () => {
  assert.match(html, /googletagmanager\.com\/gtm\.js/);
  assert.match(html, /googletagmanager\.com\/ns\.html/);
  assert.equal(html.match(/GTM-PCJ3Q5RK/g)?.length, 2);
});

test("the smoke form emits one metadata-only event contract", () => {
  assert.match(html, /id="workflow-smoke-form"/);
  assert.match(html, /type="email"[^>]*required/);
  assert.match(html, /id="workflow-smoke-success"[^>]*role="status"[^>]*hidden/);
  assert.match(html, /event: 'gtm_observability_smoke_success'/);
  assert.match(html, /form_id: form\.id/);
  assert.match(html, /form_name: form\.getAttribute\('aria-label'\)/);
  assert.match(html, /let signaled = false/);
  assert.match(html, /if \(signaled\) return/);
  assert.doesNotMatch(html, /input\.value|FormData|workflow-smoke-email['"]\)\.value/);
});

test("the landing page exposes every enhanced-measurement target", () => {
  assert.match(html, /id="measurement-playground"/);
  assert.match(html, /href="#measurement-playground"[^>]*>Measurement Test<\/a>/);
  assert.match(html, /id="measurement-spa-button"/);
  assert.match(html, /id="measurement-scroll-marker"/);
  assert.match(html, /id="measurement-outbound"[^>]*href="https:\/\/support\.google\.com\/analytics\//);
  assert.match(html, /id="measurement-search-form"[^>]*action="\/"[^>]*method="get"/);
  assert.match(html, /name="q"/);
  assert.match(html, /youtube\.com\/embed\/[A-Za-z0-9_-]+\?enablejsapi=1/);
  assert.match(html, /id="measurement-download"[^>]*href="assets\/consentflow-measurement-checklist\.pdf"[^>]*download/);
  assert.match(html, /id="measurement-form"[^>]*action="assets\/measurement-form-result\.html"[^>]*method="get"[^>]*target="measurement-form-target"/);
  assert.match(html, /type="hidden"[^>]*name="measurement_scenario"[^>]*value="native-form"/);
  assert.match(html, /name="measurement_test_token"[^>]*type="text"/);
  assert.match(html, /pattern="measurement-test"/);
  assert.match(html, /autocomplete="off"/);
  assert.match(html, /name="measurement-form-target"[^>]*src="assets\/measurement-form-result\.html"[^>]*hidden/);
  assert.match(html, /<script src="measurement-playground\.js"><\/script>/);
});

test("the playground uses natural browser interactions without collecting values", () => {
  assert.match(playgroundScript, /history\.pushState/);
  assert.match(playgroundScript, /measurement-form-target/);
  assert.doesNotMatch(playgroundScript, /gtag|dataLayer|FormData|\.value/);
  const searchForm = html.match(/<form id="measurement-search-form"[\s\S]*?<\/form>/)?.[0];
  const interactionForm = html.match(/<form id="measurement-form"[\s\S]*?<\/form>/)?.[0];
  assert.ok(searchForm);
  assert.ok(interactionForm);
  assert.doesNotMatch(searchForm, /<input|<textarea/);
  assert.doesNotMatch(interactionForm, /type="(?:email|tel|url)"|<textarea/);
  assert.doesNotMatch(interactionForm, /name="(?:email|name|phone|message)"/);
});

test("the measurement checklist is a real PDF", () => {
  assert.equal(checklist.subarray(0, 5).toString("ascii"), "%PDF-");
  assert.ok(checklist.length > 1_000, "measurement checklist PDF must contain useful content");
});

test("the static landing page remains within its size budget", () => {
  assert.ok(statSync("index.html").size < 100_000, "index.html must remain below 100 KB");
});

test("the source tree does not contain common committed-secret signatures", () => {
  const files = [];
  const collect = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if ([".git", ".vercel", "node_modules"].includes(entry.name) || entry.name.startsWith(".env")) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) collect(path);
      else if (entry.isFile()) files.push(path);
    }
  };
  collect(".");
  const secret = /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|ghp_[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{20,}|sk-[A-Za-z0-9]{20,}|VERCEL_OIDC_TOKEN\s*=/;
  for (const file of files) {
    const value = readFileSync(file);
    if (value.includes(0)) continue;
    assert.doesNotMatch(value.toString("utf8"), secret, `${file} contains a secret-like value`);
  }
});
