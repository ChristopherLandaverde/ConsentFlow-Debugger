#!/usr/bin/env node
// ConsentFlow headless runner: checks a live URL with the extension's own detection and
// prints the verdict as JSON (or text).
//
//   node scripts/consentflow-check.mjs <url> [--consent none|accept|deny] [--wait <ms>] [--format json|text]
//
// How it stays the extension's verdict:
// - injected.js (the extension's capture and rules) is added with addInitScript, in the top
//   frame only (the content script is not all_frames). It wraps fetch, XHR, sendBeacon and
//   dataLayer and reads Resource Timing exactly as it does in the extension.
// - State is read the way content.js reads it: a `get-state` postMessage answered by a
//   `full-state` message.
// - Findings and the verdict come from popup/findings.js, the file the popup renders.
//
// The runner itself sends nothing anywhere: the browser loads the page being checked, and
// that page makes whatever requests it makes. Exit codes: 0 VERIFIED or REVIEW, 1 BROKEN,
// 3 INCOMPLETE, capture not finished, or the requested banner click not possible,
// 2 usage error, navigation error or a runner failure (e.g. Chromium missing).
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import vm from "node:vm";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

export const SCHEMA_VERSION = "1";
export const DEFAULT_WAIT_MS = 3000;
// Overridable through options.timeouts (tests shorten them).
export const DEFAULT_TIMEOUTS = { nav: 30000, ready: 10000, banner: 5000, state: 5000 };

export const EXIT = { ok: 0, broken: 1, usage: 2, incomplete: 3 };

// Known accept / reject-all button selectors of common CMPs. Only checked on the stand-in
// banners in tests/fixtures/cmp-banner.html, not on the vendors' real banners. Playwright's
// CSS engine pierces open shadow roots, which Usercentrics renders into.
export const CMP_BUTTONS = [
  {
    cmp: "OneTrust",
    accept: ["#onetrust-accept-btn-handler"],
    deny: ["#onetrust-reject-all-handler"],
  },
  {
    cmp: "Cookiebot",
    accept: ["#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll", "#CybotCookiebotDialogBodyButtonAccept"],
    deny: ["#CybotCookiebotDialogBodyButtonDecline"],
  },
  {
    cmp: "Google Funding Choices",
    accept: ["button.fc-cta-consent"],
    deny: ["button.fc-cta-do-not-consent"],
  },
  {
    cmp: "Usercentrics",
    accept: ['[data-testid="uc-accept-all-button"]'],
    deny: ['[data-testid="uc-deny-all-button"]'],
  },
];

const USAGE = `Usage: node scripts/consentflow-check.mjs <url> [--consent none|accept|deny] [--wait <ms>] [--format json|text]

  --consent  none (default): load the page and touch nothing, so tags that fire before
             consent are caught. accept / deny: click the banner's accept-all or
             reject-all button (known selectors for OneTrust, Cookiebot, Google Funding
             Choices and Usercentrics).
  --wait     ms to keep capturing after the page loads (and again after a click). Default ${DEFAULT_WAIT_MS}.
  --format   json (default) or text.

Exit codes: 0 VERIFIED or REVIEW, 1 BROKEN, 3 INCOMPLETE, capture not finished or banner
not clicked, 2 usage error, page not loaded or runner failure.`;

export class UsageError extends Error {}

export function parseArgs(argv) {
  const opts = { url: null, consent: "none", wait: DEFAULT_WAIT_MS, format: "json" };
  const args = [...argv];
  while (args.length) {
    const arg = args.shift();
    const [flag, inline] = arg.startsWith("--") && arg.includes("=") ? arg.split(/=(.*)/s, 2) : [arg, undefined];
    const value = () => {
      const v = inline !== undefined ? inline : args.shift();
      if (v === undefined) throw new UsageError(`${flag} needs a value.`);
      return v;
    };
    if (flag === "--help" || flag === "-h") throw new UsageError("");
    else if (flag === "--consent") {
      opts.consent = value();
      if (!["none", "accept", "deny"].includes(opts.consent)) throw new UsageError(`--consent must be none, accept or deny, not "${opts.consent}".`);
    } else if (flag === "--wait") {
      const v = value();
      if (!/^\d+$/.test(v)) throw new UsageError(`--wait must be a whole number of milliseconds, not "${v}".`);
      opts.wait = Number(v);
    } else if (flag === "--format") {
      opts.format = value();
      if (!["json", "text"].includes(opts.format)) throw new UsageError(`--format must be json or text, not "${opts.format}".`);
    } else if (flag.startsWith("-")) throw new UsageError(`Unknown option ${flag}.`);
    else if (opts.url) throw new UsageError(`Only one URL can be checked at a time.`);
    else opts.url = arg;
  }
  if (!opts.url) throw new UsageError("A URL is required.");
  let parsed;
  try {
    parsed = new URL(opts.url);
  } catch {
    throw new UsageError(`Not a valid URL: ${opts.url}`);
  }
  if (!["http:", "https:"].includes(parsed.protocol)) throw new UsageError("Only http and https URLs can be checked.");
  opts.url = parsed.href;
  return opts;
}

// ─── The popup's findings and verdict code (popup/findings.js), unchanged ─────────────
let findingsApi = null;
function findingsEngine() {
  if (!findingsApi) {
    const context = vm.createContext({});
    vm.runInContext(read("popup/findings.js"), context, { filename: "popup/findings.js" });
    findingsApi = context.CFFindings;
  }
  return findingsApi;
}
const plain = (value) => JSON.parse(JSON.stringify(value));

// ─── Capture ────────────────────────────────────────────────────────────────────────
export class NavigationError extends Error {}

// Playwright enforces some timeouts inside the page, so a page whose main thread is blocked
// can stall a wait forever. Every wait on the page is raced against a Node-side timer.
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function deadline(promise, ms, fallback) {
  let timer;
  const late = new Promise((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms + 1000);
  });
  try {
    return await Promise.race([Promise.resolve(promise).catch(() => fallback), late]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Load the page with the extension's capture script and return the state injected.js
 * reports, as the popup would receive it.
 * @param {string} url
 * @param {object} [options]
 * @param {"none"|"accept"|"deny"} [options.consent]
 * @param {number} [options.wait]
 * @param {Partial<typeof DEFAULT_TIMEOUTS>} [options.timeouts]
 * @param {(context: import('playwright').BrowserContext) => Promise<void>} [options.route]
 *   install request routes before navigation (tests stub third-party hosts with it)
 * @returns {Promise<{state: object|null, capture: "complete"|"not_ready"|"no_response",
 *   finalUrl: string, consentInteraction: string, consentButton: object|null,
 *   navigatedAfterConsent: boolean|null}>}
 */
export async function capture(url, options = {}) {
  const consent = options.consent || "none";
  const wait = options.wait ?? DEFAULT_WAIT_MS;
  const timeouts = { ...DEFAULT_TIMEOUTS, ...options.timeouts };
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    if (options.route) await options.route(context);
    // Top frame only, like the content script (all_frames: false).
    await context.addInitScript({ content: `if (window === window.top) {\n${read("injected.js")}\n}` });
    const page = await context.newPage();

    let response;
    try {
      response = await page.goto(url, { waitUntil: "commit", timeout: timeouts.nav });
    } catch (e) {
      throw new NavigationError(`Could not load ${url}: ${e.message.split("\n")[0]}`);
    }
    if (response && response.status() >= 400) {
      throw new NavigationError(`${url} answered HTTP ${response.status()}.`);
    }
    await deadline(page.waitForLoadState("load", { timeout: timeouts.nav }), timeouts.nav);
    await deadline(
      page.waitForFunction(() => window.__cfDebug && window.__cfDebug.ready, null, { timeout: timeouts.ready }),
      timeouts.ready,
    );
    await sleep(wait);

    let interaction = { consentInteraction: "not_requested", consentButton: null, navigatedAfterConsent: null };
    if (consent !== "none") {
      let navigated = false;
      const onNavigate = (frame) => {
        if (frame === page.mainFrame()) navigated = true;
      };
      interaction = await clickBanner(page, consent, timeouts.banner, () => page.on("framenavigated", onNavigate));
      if (interaction.consentInteraction === "clicked") {
        await sleep(wait);
        page.off("framenavigated", onNavigate);
        interaction.navigatedAfterConsent = navigated;
      }
    }

    const state = await readState(page, timeouts.state);
    const status = !state ? "no_response" : state.ready ? "complete" : "not_ready";
    return { state, capture: status, finalUrl: page.url(), ...interaction };
  } finally {
    await deadline(browser.close(), 5000);
  }
}

async function clickBanner(page, consent, timeout, beforeClick) {
  const notClicked = (kind, button = null) => ({ consentInteraction: kind, consentButton: button, navigatedAfterConsent: null });
  const candidates = CMP_BUTTONS.flatMap((c) => c[consent].map((selector) => ({ cmp: c.cmp, selector })));
  const any = candidates.map((c) => c.selector).join(", ");
  const shown = await deadline(
    page.locator(any).filter({ visible: true }).first().waitFor({ state: "attached", timeout }).then(() => true),
    timeout,
    false,
  );
  if (!shown) return notClicked("not_found");
  for (const c of candidates) {
    // A hidden duplicate (a second, unused banner) must not hide a visible button.
    const button = page.locator(c.selector).filter({ visible: true }).first();
    if (!(await deadline(button.count(), timeout, 0))) continue;
    const found = { cmp: c.cmp, selector: c.selector };
    beforeClick();
    // Covered by another element, detached or never enabled: report it, don't guess.
    const clicked = await deadline(button.click({ timeout }).then(() => true), timeout, false);
    if (!clicked) return notClicked("click_failed", found);
    return { consentInteraction: "clicked", consentButton: found, navigatedAfterConsent: null };
  }
  return notClicked("not_found");
}

// The content.js protocol: post get-state, take the matching full-state reply. Raced against a
// Node-side timer, so a page whose main thread is blocked can't hang the run.
function readState(page, timeout) {
  return deadline(
    page.evaluate(
      (ms) =>
        new Promise((resolve) => {
          const requestId = "cli_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
          function onMessage(event) {
            const d = event.data;
            if (!d || d.source !== "cf-debug-injected" || d.type !== "full-state" || d.requestId !== requestId) return;
            window.removeEventListener("message", onMessage);
            resolve(d.payload);
          }
          window.addEventListener("message", onMessage);
          window.postMessage({ source: "cf-debug-content", type: "get-state", requestId }, "*");
          setTimeout(() => resolve(null), ms);
        }),
      timeout,
    ),
    timeout,
    null,
  );
}

// ─── Report ─────────────────────────────────────────────────────────────────────────
const FINDING_FIELDS = ["id", "status", "title", "observed", "consequence", "fix", "verify", "evidence"];

function requestSummary(hit) {
  return {
    ms: Math.round(hit.ms),
    method: hit.method,
    vendor: hit.vendor,
    host: hit.host,
    path: hit.url,
    tag: hit.tag ?? null,
    tagId: hit.tagId ?? null,
    gcs: hit.gcs ?? null,
    gcd: hit.gcd ?? null,
    consentAtRequest: hit.consentAtRequest ?? {},
  };
}

/**
 * Build the JSON report from captured state with the popup's own findings code. When the
 * capture didn't finish (no reply, or injected.js never completed its first pass) there is
 * no verdict: `verdict` is null and `findings` empty, and `capture` says why.
 */
export function buildReport(state, meta) {
  const F = findingsEngine();
  const complete = !!(state && state.ready);
  const findings = complete ? F.buildFindings(state) : null;
  const verdict = complete ? plain(F.computeVerdict(state, findings)) : null;
  return {
    schemaVersion: SCHEMA_VERSION,
    tool: "consentflow",
    url: meta.url,
    finalUrl: meta.finalUrl ?? meta.url,
    capture: complete ? "complete" : state ? "not_ready" : "no_response",
    consentMode: meta.consentMode,
    consentInteraction: meta.consentInteraction,
    consentButton: meta.consentButton ?? null,
    navigatedAfterConsent: meta.navigatedAfterConsent ?? null,
    verdict: verdict && {
      status: verdict.status,
      label: verdict.label,
      title: verdict.title,
      detail: verdict.detail,
      counts: verdict.counts,
    },
    findings: complete ? plain(findings).map((f) => Object.fromEntries(FINDING_FIELDS.map((k) => [k, f[k] ?? null]))) : [],
    requests: ((state && state.networkHits) || []).map(requestSummary),
  };
}

// The requested scenario not being run (capture unfinished, banner not clicked) wins over
// the verdict: a BROKEN from a run that didn't do what was asked still exits 3.
export function exitCodeFor(report) {
  if (report.capture !== "complete" || !report.verdict) return EXIT.incomplete;
  if (["not_found", "click_failed"].includes(report.consentInteraction)) return EXIT.incomplete;
  if (report.verdict.status === "broken") return EXIT.broken;
  if (report.verdict.status === "incomplete") return EXIT.incomplete;
  return EXIT.ok;
}

export function formatText(report) {
  const head = report.verdict
    ? [`${report.verdict.label}  ${report.verdict.title}`, report.verdict.detail]
    : [`No verdict: capture ${report.capture}.`, "ConsentFlow's capture did not finish its first pass on this page."];
  const lines = [...head, `${report.finalUrl} · consent: ${report.consentMode}` +
    (report.consentMode === "none" ? "" : ` (${report.consentInteraction}${report.consentButton ? `: ${report.consentButton.cmp}` : ""})`), ""];
  for (const f of report.findings) {
    lines.push(`[${f.status}] ${f.title}`);
    if (f.status !== "verified") {
      lines.push(`  ${f.observed}`);
      for (const step of f.fix || []) lines.push(`  fix: ${step}`);
    }
  }
  lines.push("", `${report.requests.length} vendor request${report.requests.length === 1 ? "" : "s"} captured.`);
  return lines.join("\n");
}

/** Check one URL and return the report (the CLI prints it). */
export async function check(url, options = {}) {
  const consent = options.consent || "none";
  const result = await capture(url, options);
  return buildReport(result.state, {
    url,
    finalUrl: result.finalUrl,
    consentMode: consent,
    consentInteraction: result.consentInteraction,
    consentButton: result.consentButton,
    navigatedAfterConsent: result.navigatedAfterConsent,
  });
}

export async function main(argv, { stdout = process.stdout, stderr = process.stderr, route, timeouts } = {}) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (e) {
    if (!(e instanceof UsageError)) throw e;
    stderr.write((e.message ? `${e.message}\n\n` : "") + USAGE + "\n");
    return EXIT.usage;
  }
  let report;
  try {
    report = await check(opts.url, { consent: opts.consent, wait: opts.wait, route, timeouts });
  } catch (e) {
    // First line only: Playwright appends its call log to error messages.
    stderr.write(`consentflow: ${String((e && e.message) || e).split("\n")[0]}\n`);
    return EXIT.usage;
  }
  stdout.write((opts.format === "text" ? formatText(report) : JSON.stringify(report, null, 2)) + "\n");
  return exitCodeFor(report);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}
