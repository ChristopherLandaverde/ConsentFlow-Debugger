// ConsentFlow MCP server (L2): the headless runner and the findings model as read-only tools.
//
// Every verdict comes from popup/findings.js through the runner (scripts/consentflow-check.mjs);
// this file only validates input, calls the runner or the catalog, and shapes errors.
// Start it with `node scripts/consentflow-mcp.mjs` (stdio), which keeps stdout for JSON-RPC.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DEFAULT_WAIT_MS, NavigationError, UsageError, checkUrl, normalizeUrl } from "../consentflow-check.mjs";
import { UnknownFindingError, explainFinding, listChecks } from "./catalog.mjs";

export const SERVER_NAME = "consentflow";
export const SERVER_VERSION = "1.0.0";
export const MAX_WAIT_MS = 60000;
// Each check_url run starts its own Chromium; more than this many at once are refused (busy).
export const MAX_CONCURRENT_CHECKS = 2;

const json = (value) => [{ type: "text", text: JSON.stringify(value, null, 2) }];
const ok = (value) => ({ content: json(value), structuredContent: value });

/** A tool error the agent can act on: { error: { code, message, … } }, with isError set. */
export function toolError(code, message, extra = {}) {
  const value = { error: { code, message, ...extra } };
  return { isError: true, content: json(value), structuredContent: value };
}

const firstLine = (e) => String((e && e.message) || e).split("\n")[0];

/**
 * @param {object} [options] passed to the runner for every check (tests stub hosts with
 *   `route` and shorten `timeouts`, as the runner tests do), except `maxConcurrentChecks`
 */
export function createServer({ maxConcurrentChecks = MAX_CONCURRENT_CHECKS, ...options } = {}) {
  let running = 0;
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      instructions:
        "ConsentFlow checks Google Consent Mode v2 on a live page with the ConsentFlow Debugger extension's own detection code. " +
        "All tools are read-only. Verdicts, statuses and numbers come from the engine: quote them from tool results, never compute them.",
    },
  );

  server.registerTool(
    "check_url",
    {
      title: "Check a page's Consent Mode",
      description:
        "Read-only. Loads one http(s) page in headless Chromium with ConsentFlow's capture script and returns the runner's JSON report " +
        "(schemaVersion 1) unchanged: verdict (BROKEN / REVIEW / INCOMPLETE / VERIFIED), findings with observed, consequence, fix, verify " +
        "and evidence, and the vendor requests captured with the consent on the page when each was sent. " +
        "consent: none (default) touches nothing, so tags that fire before consent are caught; accept / deny click a known " +
        "OneTrust, Cookiebot, Google Funding Choices or Usercentrics button. If consentInteraction is not_found or click_failed, the " +
        "requested scenario did not run (the CLI exits 3). At most " +
        `${maxConcurrentChecks} runs at once; more return a busy error. ` +
        "It changes nothing on the site; the page itself makes its own requests as for any visitor.",
      inputSchema: {
        url: z.string().describe("The page to check. http or https only."),
        consent: z.enum(["none", "accept", "deny"]).optional().describe("Banner interaction. Default none."),
        waitMs: z
          .number()
          .int()
          .min(0)
          .max(MAX_WAIT_MS)
          .optional()
          .describe(`Milliseconds to keep capturing after load (and again after a click). Default ${DEFAULT_WAIT_MS}.`),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ url, consent = "none", waitMs = DEFAULT_WAIT_MS }) => {
      // Validate before the cap so a bad URL gets invalid_url, never busy, and never takes a slot.
      try {
        normalizeUrl(url);
      } catch (e) {
        if (e instanceof UsageError) return toolError("invalid_url", e.message, { url });
        throw e;
      }
      if (running >= maxConcurrentChecks) {
        return toolError(
          "busy",
          `${running} check_url runs are already in progress (at most ${maxConcurrentChecks} at once, each in its own browser). Retry when one finishes.`,
          { url, running, max: maxConcurrentChecks },
        );
      }
      running++;
      let report;
      try {
        report = await checkUrl(url, { ...options, consent, wait: waitMs });
      } catch (e) {
        if (e instanceof UsageError) return toolError("invalid_url", e.message, { url });
        if (e instanceof NavigationError) return toolError("navigation_failed", firstLine(e), { url });
        return toolError("runner_failed", firstLine(e), { url });
      } finally {
        running--;
      }
      if (report.capture !== "complete") {
        const message =
          report.capture === "no_response"
            ? "The page stopped answering (its main thread may be blocked), so ConsentFlow's state couldn't be read. There is no verdict."
            : "ConsentFlow's capture did not finish its first pass (it runs 500 ms after DOMContentLoaded). There is no verdict.";
        return toolError(`capture_${report.capture}`, message, { url, report });
      }
      return ok(report);
    },
  );

  server.registerTool(
    "explain_finding",
    {
      title: "Explain a finding",
      description:
        "Read-only. Returns ConsentFlow's copy model for one finding id (as in check_url findings[].id or list_checks): the statuses it " +
        "can have, the observed / consequence / fix / verify / evidence copy popup/findings.js produces for statuses that quote no measured " +
        "value, and the findings.js source (file, lines, code) that builds the rest. Evidence: the source location in injected.js and popup/findings.js.",
      inputSchema: { id: z.string().describe('A finding id, e.g. "consent-default-before-config" or "tag:Facebook Pixel".') },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ id }) => {
      try {
        return ok(explainFinding(id));
      } catch (e) {
        if (e instanceof UnknownFindingError) return toolError("unknown_finding", e.message, { id, known: e.known });
        throw e;
      }
    },
  );

  server.registerTool(
    "list_checks",
    {
      title: "List ConsentFlow's checks",
      description:
        `Read-only. Lists the checks the engine runs, read from injected.js: the ${listChecks().rules.length} Consent Mode rules (id, name, description, the ` +
        `statuses each can give, the data a check that can't run is waiting for) and the tags it detects and judges by their requests. ` +
        "Each entry carries its source location as evidence.",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => ok(listChecks()),
  );

  return server;
}
