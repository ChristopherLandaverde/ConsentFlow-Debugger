import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const html = readFileSync("index.html", "utf8");
const contentScript = readFileSync("content.js", "utf8");

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
