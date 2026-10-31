<p align="center">
  <img src="icons/icon-128.png" width="96" height="96" alt="ConsentFlow Debugger logo">
</p>

<h1 align="center">ConsentFlow Debugger</h1>

<p align="center">
  <strong>Tags fire before consent on live pages. Find them and get the fix from the extension, the CLI or your AI agent.</strong>
</p>

<p align="center">
  8 Consent Mode rules · 10 tags judged request by request · MCP server for Claude, Cursor and any MCP client · the extension sends nothing anywhere
</p>

<p align="center">
  <a href="https://github.com/ChristopherLandaverde/ConsentFlow-Debugger/actions/workflows/ci.yml"><img src="https://github.com/ChristopherLandaverde/ConsentFlow-Debugger/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI"></a>
  <a href="#agentic"><img src="https://img.shields.io/badge/agentic-L1%C2%B7L2%C2%B7L3-036461" alt="agentic: L1 · L2 · L3"></a>
  <a href="manifest.json"><img src="https://img.shields.io/github/manifest-json/v/ChristopherLandaverde/ConsentFlow-Debugger?color=036461&label=version" alt="Version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/ChristopherLandaverde/ConsentFlow-Debugger?color=036461" alt="License: MIT"></a>
</p>

<p align="center">
  <a href="#quick-start">Quick start</a> · <a href="#agentic">For agents</a> · <a href="#what-you-get">What you get</a> · <a href="#known-limits">Known limits</a> · <a href="#privacy-and-permissions">Privacy</a> · <a href="https://consentflow-psi.vercel.app">Landing page</a>
</p>

ConsentFlow Debugger is a free, open-source Chrome extension for analytics engineers, QA
testers and consultants. It checks Google Consent Mode on the live page in one click and gives
the fix for each problem. Your AI agent can run the same checks through a local MCP server:
check a URL, explain a finding, list the rules. Every tool is read-only; fixing the tags or
the CMP stays with you.

A Consent Mode setup can look right in GTM preview and still be wrong on the live page: the
consent default lands a few hundred milliseconds after `config`, a pixel fires before the
banner is answered, or the v2 fields `ad_user_data` and `ad_personalization` are missing.
Google's own guide is blunt about the first one: "If your consent code is called out of
order, consent defaults won't work"
([source](https://developers.google.com/tag-platform/security/guides/consent)). The cost is
requests sent for visitors who said no, and consent signals that Google's
[conversion modelling](https://support.google.com/google-ads/answer/10000067) relies on
being wrong. ConsentFlow shows you this on the page itself, with the timings and requests as
evidence.

<p align="center">
  <img src="docs/media/fix-demo.gif" width="880" alt="Four captioned frames from real Chromium with the unpacked extension loaded. 1: the bundled broken sample page, whose source runs gtag config at 60 ms and the consent default at 390 ms; the ConsentFlow popup, opened from the toolbar, shows BROKEN, 2 consent problems, and the finding Google tag configured before the consent default: config at +57 ms, consent default at +388 ms, a 332 ms gap, with the fix and how to verify it. 2: the fix, before and after source side by side: the consent default moved above config. 3: the correctly wired sample page; the popup shows VERIFIED, consent is wired correctly, all 9 checks passed. 4: the side panel opened with Open full trace, Timeline tab: consent default at +58 ms, Google tag config at +118 ms.">
  <br><sub>A Consent Mode bug caught, fixed and confirmed, on the two sample pages bundled in <code>tests/fixtures/</code>. The fixed sample also differs in more than the fix (a OneTrust stub, a consent update, no Meta Pixel), so frame 3 is the same checks on a correctly wired page.</sub>
</p>

## Agentic

<p align="center">
  <img src="docs/media/agentic-stack.svg" width="880" alt="ConsentFlow Debugger's agentic stack, four layers. 1, engine (the base layer): injected.js detection and the popup/findings.js verdict model, 8 Consent Mode rules, 10 vendor tags plus GTM. 2, tools, read-only (L1 machine-readable, L3 live read, fixture-verified): the CLI node scripts/consentflow-check.mjs with --consent none, accept or deny, and the MCP tools check_url, explain_finding and list_checks. 3, your agent (L2 agent-callable): Claude, Cursor or any MCP client, which picks the tool and explains the result but never computes a verdict. 4, you approve: nothing writes; findings are evidence for you to act on (L4 not built).">
</p>

The extension's engine also runs headless, so an agent can check a page the way you would with
the popup. The agent picks the tool and explains the result; the verdict and every number come
from `popup/findings.js`.

| Ask your agent… | Tool | Reads | Writes |
|---|---|---|---|
| "Check `http://localhost:8000/popup-states.html?s=broken` and explain the first problem." | `check_url` | The page, loaded in its own headless Chromium: consent commands and requests to known ad and analytics vendors | Nothing |
| "Click Reject all on the banner at staging.example.com. Does anything still fire?" | `check_url` with `consent: "deny"` | The same, after clicking the reject-all button of OneTrust, Cookiebot, Google Funding Choices or Usercentrics | Nothing on your site; the click happens in that throwaway browser |
| "Why does `consent-default-before-config` matter, and where is it judged?" | `explain_finding` | The finding's copy and the `popup/findings.js` lines that build it | Nothing |
| "Which tags can send cookieless pings without counting as a violation?" | `list_checks` | The 8 rules and 11 tags in `injected.js` (only GA4, Google Ads and Floodlight can get `review`) | Nothing |

Agentic levels: L1 machine-readable · L2 agent-callable · L3 live read · L4 proposes changes
for you to approve. ConsentFlow: L1 (JSON report with `schemaVersion` and exit codes) · L2 (MCP
server) · L3 (fixture-verified: tested on the bundled sample pages and stand-in CMP banners, not
yet on a public site or a vendor's real banner). It has no L4: nothing writes.

Planned: an L3 scenario matrix (several pages and consent states in one run) and a recorded run
on a real public site, which drops the fixture-verified label.

Details: [Use it from an agent / CLI](#use-it-from-an-agent--cli) (the JSON report, options and
exit codes) · [MCP server](#mcp-server-ask-your-agent) (setup for Claude Code, Claude Desktop
and Cursor, errors, and what goes where).

## Who it's for

- **Analytics engineers** verifying a Consent Mode change on staging or production before they call it done.
- **QA testers** reproducing a consent bug and filing it with the timings and requests as evidence.
- **Consultants** auditing a client's site from the browser, without access to their GTM container.

## What you get

| | |
|---|---|
| **A verdict in one sentence** | `× BROKEN`, `! REVIEW`, `– INCOMPLETE` or `✓ VERIFIED`, with the most severe problem underneath. Checks that couldn't run say so and why; they never count as passed. |
| **Every tag judged by the consent at the moment it sent** | A tag that sent a request while its consent was `denied` is a violation, even if the visitor accepted later. Google's cookieless pings under advanced Consent Mode are flagged for review instead. Each request is judged only against the tag that sent it, read from its tag ID or endpoint, so a GA4 hit is never blamed on Google Ads. Covers GA4, Google Ads, Floodlight, Meta Pixel, LinkedIn, TikTok, Hotjar, Clarity, Pinterest and Snapchat, and the tags inside a GTM container. |
| **Ordering and setup mistakes, timed in milliseconds** | `config` before the consent default, an `update` before the default, a missing default, duplicate defaults, missing v2 fields, no `wait_for_update` when a CMP is present. |
| **A fix and a way to check it** | Every finding says what was observed, why it matters, how to fix it (page source and GTM) and what to look for after you reload. |
| **Google's consent signals decoded** | `gcs` and `gcd` on each Google request, side by side with the consent the page had when it was sent, flagged when they disagree. |

The full detection reference, including all eight rules and the tag verdicts, is in
[docs/detection.md](docs/detection.md).

## Quick start

Not published on the Chrome Web Store: you load it unpacked, with no build step. Requires
Chrome or another Chromium browser with Manifest V3 (Chrome 114+ for the side panel), and
Python 3.7+ to serve the sample pages.

```bash
git clone https://github.com/ChristopherLandaverde/ConsentFlow-Debugger.git
cd ConsentFlow-Debugger
python3 -m http.server 8000 -d tests/fixtures
```

1. In `chrome://extensions/`, turn on **Developer mode**, click **Load unpacked** and select
   the `ConsentFlow-Debugger` folder (the one with `manifest.json`).
2. Open <http://localhost:8000/popup-states.html?s=broken> and click the ConsentFlow icon.
   You should see `× BROKEN`, "2 consent problems on this page", starting with "Google tag
   configured before the consent default".
3. Open <http://localhost:8000/popup-states.html?s=verified>: the popup says "Consent is
   wired correctly on this page."
4. Now reload a page of your own and click the icon. Click **Open full trace** for the
   timeline, every request and the consent state in a side panel.

Content scripts don't run on `file://` pages, which is why the samples are served over
HTTP. No local server? The landing page's
[measurement test section](https://consentflow-psi.vercel.app/#measurement-playground) loads
a disposable GTM container. To update, `git pull` and click reload on the extension's card.
Release-zip install and a full tour of the popup and side panel, with screenshots:
[docs/usage.md](docs/usage.md).

## Use it from an agent / CLI

`scripts/consentflow-check.mjs` checks a URL in headless Chromium with the extension's own
code and prints the verdict as JSON, so a script, CI job or coding agent can read it. It adds
`injected.js` to the page before any page script runs (top frame only, like the extension),
reads the state the way `content.js` does, and builds the verdict and findings with
`popup/findings.js`, the file the popup renders. Verified on the bundled fixtures served
locally; not yet run against a public site.

```bash
npm ci --ignore-scripts
npx playwright install chromium   # once: the browser the runner drives
python3 -m http.server 8000 -d tests/fixtures &
node scripts/consentflow-check.mjs "http://localhost:8000/popup-states.html?s=broken" \
  | jq '{schemaVersion, tool, consentMode, verdict: .verdict.label, title: .verdict.title, first: .findings[0], requests: (.requests | length)}'
```

Output from that run (exit code 1). The `+ms` timings are measured on each load, so they
vary from run to run:

```json
{
  "schemaVersion": "1",
  "tool": "consentflow",
  "consentMode": "none",
  "verdict": "× BROKEN",
  "title": "2 consent problems on this page.",
  "first": {
    "id": "consent-default-before-config",
    "status": "broken",
    "title": "Google tag configured before the consent default",
    "observed": "`config` for G-FIXTURE ran at +73 ms; the consent default ran at +398 ms.",
    "consequence": "Requests in that 325 ms gap assume consent is granted.",
    "fix": [
      "Move the consent default above the Google tag snippet in the page source.",
      "In GTM, fire the consent default on the Consent Initialization – All Pages trigger."
    ],
    "verify": "Reload. The consent default should come before `config` in the timeline.",
    "evidence": [
      { "label": "First config", "value": "G-FIXTURE at +73 ms" },
      { "label": "Consent default", "value": "+398 ms" },
      { "label": "Gap", "value": "325 ms" }
    ]
  },
  "requests": 2
}
```

The full report is `{ schemaVersion, tool, url, finalUrl, capture, consentMode,
consentInteraction, consentButton, navigatedAfterConsent, verdict, findings, requests }`.
`capture` is `complete` when ConsentFlow finished its first pass on the page; if it didn't
(`not_ready`, or `no_response` when the page stopped answering), `verdict` is `null` and
`findings` is empty, because there is nothing to judge. Each finding has `id`, `status`, `title`,
`observed`, `consequence`, `fix`, `verify` and `evidence`; each request has when it was sent,
its vendor, host, path, the tag it is attributed to, `gcs` / `gcd`, and the consent on the
page at that moment. `--format text` prints the same verdict as lines instead.

| Option | |
|---|---|
| `--consent none` (default) | Load the page and touch nothing. This is the mode that catches tags firing before consent. |
| `--consent accept` / `deny` | Click the accept-all or reject-all button of OneTrust, Cookiebot, Google Funding Choices or Usercentrics, using known button selectors. Each is tested only on a stand-in banner (`tests/fixtures/cmp-banner.html`), not on the vendor's real one. With none of those buttons on the page it reports `"consentInteraction": "not_found"` and clicks nothing; a button it can't click (covered by another element, say) is `"click_failed"`. If a new document loads during the wait after the click (a navigation or reload), `navigatedAfterConsent` is `true` and the capture covers that new page load. A URL change without a new document (`pushState`, a hash change) leaves it `false`. |
| `--wait <ms>` | How long to keep capturing after the page loads, and again after a click. Default 3000. |

Exit codes: `0` VERIFIED or REVIEW; `1` BROKEN; `3` INCOMPLETE, a capture that didn't
finish, or a requested banner click that didn't happen (`not_found` or `click_failed`, even
when the page is also BROKEN, since the scenario you asked for wasn't run); `2` bad arguments,
a page that couldn't be loaded or answered HTTP 400 or above, or the runner itself failing
(for example, Chromium not installed).

Run time: a normal page takes a few seconds plus `--wait` (twice `--wait` after a click).
Every step has a time limit, so with the defaults a run that hits all of them ends within about
57 s for `--consent none` and 71 s for `accept` / `deny`, plus browser start-up: 31 s to load
the page, 11 s for ConsentFlow's first pass, the 3 s wait, 6 s to read the state and 6 s to close
the browser, and for a click up to 11 s more for the banner and another 3 s wait.

What it doesn't do: it checks one page load from wherever you run it, so visitor regions are
not simulated (a CMP that shows its banner only in the EU may not show it to a run from
elsewhere); only the four CMPs above can be clicked, and their selectors have not been checked
against the real banners; capture starts slightly earlier than in the extension, whose
script loads asynchronously; and the [known limits](#known-limits) below apply as they do in
the extension. The runner sends nothing anywhere itself: the browser loads the page you
name, and that page makes its own requests as it would for any visitor.

### MCP server: ask your agent

`scripts/consentflow-mcp.mjs` is a local stdio [MCP](https://modelcontextprotocol.io) server
over the same runner, so Claude Code, Claude Desktop, Cursor or any MCP client can check a page
and explain what it found. It runs from source on your machine; it is not published to npm or
an MCP registry. All three tools are read-only:

| Tool | Input | Returns |
|---|---|---|
| `check_url` | `url` (http or https only), `consent?` `none` / `accept` / `deny`, `waitMs?` (0 to 60000) | The runner's JSON report above, unchanged. |
| `explain_finding` | `id`, e.g. `consent-default-before-config` or `tag:Facebook Pixel` | The finding's statuses, the observed / consequence / fix / verify / evidence copy `popup/findings.js` gives where it quotes no measured value, and the `findings.js` source (file, lines, code) that builds the rest. |
| `list_checks` | none | The 8 rules and 11 tags the engine knows, read from `injected.js`, each with the statuses it can give and its source location. Only GA4, Google Ads and Floodlight can get `review` (a cookieless ping under advanced Consent Mode); for any other tag, a request sent while its consent was denied is `broken`. |

The verdict and every number come from `popup/findings.js` through the runner; the server only
checks input and shapes errors. Errors come back as tool errors with
`{ "error": { "code", "message" } }`: `invalid_url` (anything but http/https, such as `file:`,
`data:` or `chrome:`), `navigation_failed`, `capture_not_ready` / `capture_no_response`
(with the report, which has no verdict), `runner_failed` (for example, Chromium not installed),
`busy` (more than 2 `check_url` runs at once; each starts its own Chromium) and
`unknown_finding`. Input that doesn't match a tool's schema (an unknown `consent` value, a
negative `waitMs`, no `url`) is refused by the MCP SDK before the tool runs: a tool error whose
text starts `MCP error -32602: Input validation error`. A requested banner click that didn't
happen is not an error: the report comes back with `consentInteraction` `not_found` or
`click_failed`. Stdout carries JSON-RPC only; every log goes to stderr.

**What goes where.** The server sends nothing anywhere itself, and Chromium loads the page you
name as the CLI does. What the tools return (the report, with the page's URL, findings and
request hosts and paths) goes to your MCP client, and through it to the model behind your
agent and that model's provider. Don't check pages whose URLs or requests you can't share with
that provider. Three more things to know:

- `check_url` loads any http(s) URL from your machine, including `localhost` and private
  network addresses. That is how you check a local or staging build, but it also means an agent
  following instructions planted in content it read (a prompt injection) could make your
  machine load an internal page. What comes back is limited to the report: `finalUrl`, the
  findings, and the host and path of each request to a known ad or analytics vendor, not page
  content.
- Strings taken from the page (tag and config IDs, CMP names, request hosts and paths, the final
  URL) reach the model as they are, unfiltered.
- The URL is echoed back as given (normalized), so credentials or tokens in it (`user:pass@`,
  a `?token=` query) go to the model too. Don't pass URLs that carry secrets.

Setup, after `npm ci --ignore-scripts` and `npx playwright install chromium` in this repo.
Use absolute paths. If you use nvm, `node` may not be on the PATH the client starts servers
with, so give the absolute path from `which node`.

Claude Code (all projects):

```bash
claude mcp add -s user consentflow -- "$(which node)" "$PWD/scripts/consentflow-mcp.mjs"
claude mcp list   # consentflow: … - Connected

# If Playwright's browsers are not in the default cache (see below):
claude mcp add -s user consentflow -e PLAYWRIGHT_BROWSERS_PATH=/path/to/browsers -- "$(which node)" "$PWD/scripts/consentflow-mcp.mjs"
```

Claude Desktop (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS,
`%APPDATA%\Claude\claude_desktop_config.json` on Windows) and Cursor (`~/.cursor/mcp.json`)
take the same block:

```json
{
  "mcpServers": {
    "consentflow": {
      "command": "/Users/you/.nvm/versions/node/v22.12.0/bin/node",
      "args": ["/Users/you/ConsentFlow-Debugger/scripts/consentflow-mcp.mjs"]
    }
  }
}
```

MCP clients start servers with a reduced environment. If Playwright's browsers are somewhere
other than the default cache (`PLAYWRIGHT_BROWSERS_PATH` is set in your shell), add
`"env": { "PLAYWRIGHT_BROWSERS_PATH": "/that/path" }` to the block, or use the second
`claude mcp add` command above (`-e` goes after the server name); without it `check_url` returns
`runner_failed` with Playwright's "Executable doesn't exist" message.

Then ask, for example: "Use consentflow to check http://localhost:8000/popup-states.html?s=broken
and explain the first problem."

<details>
<summary>Tool calls from a real session on the bundled broken fixture (local, <code>python3 -m http.server 8000 -d tests/fixtures</code>), trimmed</summary>

Recorded while building the server: an MCP client (the SDK's `Client` over stdio) started
`node scripts/consentflow-mcp.mjs` and made these calls. Results are cut down to the fields
shown; the `+ms` timings vary per load.

```text
→ tools/list
← check_url, explain_finding, list_checks

→ tools/call check_url {"url": "http://localhost:8000/popup-states.html?s=broken"}
← isError: false
  verdict: {"status": "broken", "label": "× BROKEN", "title": "2 consent problems on this page.",
            "detail": "Also 4 checks not run yet.",
            "counts": {"broken": 2, "review": 0, "notChecked": 4, "verified": 4, "total": 10}}
  findings[].id/status: consent-default-before-config broken · tag:Facebook Pixel broken ·
            consent-update-received, gcs-consistency, default-before-update, wait-for-update not_checked ·
            consent-default-exists, v2-types-present, no-duplicate-defaults, tag:Google Analytics 4 verified
  findings[0]: "observed": "`config` for G-FIXTURE ran at +61 ms; the consent default ran at +391 ms."
               "consequence": "Requests in that 330 ms gap assume consent is granted."
               "evidence": First config = G-FIXTURE at +61 ms · Consent default = +391 ms · Gap = 330 ms
  requests: 2

→ tools/call explain_finding {"id": "tag:Facebook Pixel"}
← statuses: broken, verified, not_checked
  verdicts: violation, blocked, firing, idle
  copy.blocked: {"status": "verified", "title": "Facebook Pixel held back while ad_storage is denied",
                 "observed": "`ad_storage` is denied, and no requests to Meta went out.", …}
  copySource: popup/findings.js lines 431-552, covers violation, firing

→ tools/call check_url {"url": "file:///etc/passwd"}
← isError: true
  {"error": {"code": "invalid_url", "message": "Only http and https URLs can be checked.", "url": "file:///etc/passwd"}}

→ tools/call list_checks {}
← 8 rules, 11 tags; cookielessPings true for Google Analytics 4, Google Ads, Floodlight
```

</details>

## Known limits

- Requests are captured when made through `fetch`, `XMLHttpRequest` or
  `navigator.sendBeacon`. Image and iframe requests are seen only for Google hosts (Floodlight
  activity tags, some Google Ads hits), through the page's Resource Timing entries, which
  appear once the load finishes; one that never finishes may be missed. Other vendors' image
  pixels and all script loads are not seen, so a vendor that only uses `<img>` beacons can show
  as `IDLE` or `BLOCKED` while it is in fact sending data.
- Google's cookieless pings under advanced Consent Mode are a `! REVIEW` finding, not a
  violation, when the request's own `gcs` / `gcd` reports its storage type as denied and it
  carries no advertising cookie ID (`auid`, `auiddc`, `gclaw`). ConsentFlow can't see request
  headers or read cookies, so for GA4 it trusts the request's own `gcs`. The rule is in
  [docs/detection.md](docs/detection.md#cookieless-pings-advanced-consent-mode).
- A Google request with no tag ID on an endpoint several Google tags share (such as
  `ad.doubleclick.net/ccm/s/collect`) is listed as "Not tied to a tag" in the side panel's
  Requests view and changes no verdict. See
  [docs/detection.md](docs/detection.md#which-tag-sent-a-request).
- Only the top-level frame is inspected; iframes are not.
- State is kept per page load. Reload the page to start a fresh capture.
- If a tab was already open when the extension was installed or reloaded, the content script
  is injected on demand but misses everything that happened earlier. Reload the tab.
- The timeline keeps the latest 300 events and the latest 200 network requests.

## Privacy and permissions

Nothing leaves your browser. The extension's own code makes no network requests: it has no
analytics, no remote configuration and no server. It stores no captured data: that lives only
in the inspected page's memory and the open popup or side panel, and is gone when the page is
closed or reloaded. The only thing it stores is UI state (what you expanded, which side-panel
tab you picked) in `chrome.storage.session`, which Chrome keeps in memory and clears when the
browser closes.

This is about the extension. The [headless runner and MCP server](#use-it-from-an-agent--cli)
run outside the browser; through MCP, what they report reaches the model behind your agent
([what goes where](#mcp-server-ask-your-agent)).

Two things to know:

- The capture script runs in the page's own JavaScript context (it has to, to see
  `dataLayer` and `gtag`), so scripts on the inspected page can read what the extension
  captured about that page (`window.__cfDebug`).
- It wraps `fetch`, `XMLHttpRequest.prototype.open`, `navigator.sendBeacon` and
  `dataLayer.push` to observe them, and defines `gtag` if the page has none. Calls are passed
  through unchanged. It also reads the page's Resource Timing entries (a `PerformanceObserver`)
  for the URLs of image and iframe loads to Google hosts.

| Permission | Why |
|---|---|
| Content script on all `http`/`https` pages at `document_start` | Consent defaults are often set before GTM loads, so capture must start first. Chrome warns it can "read and change all your data on all websites" because of this. |
| `activeTab`, `scripting` | Reach the current tab, and inject into tabs opened before the extension was installed. |
| `sidePanel` | The **Open full trace** side panel. |
| `storage` | `chrome.storage.session` for UI state only. |

When something is broken or needs review, a "Discuss a system review ↗" link appears below
all findings; it opens `https://focosys.io/review` and sends no page data. Full detail:
[docs/privacy.md](docs/privacy.md) and [SECURITY.md](SECURITY.md).

## How it works

`injected.js` runs in the page, captures consent commands and vendor requests, and runs the
rules; `content.js` relays its state to the popup and side panel; `background.js` sets the
toolbar badge. File roles and a sequence diagram: [docs/architecture.md](docs/architecture.md).
This repo also holds the landing page ([docs/website.md](docs/website.md)) and some legacy
Cookiebot helper scripts that are not part of the extension.

## Development

Requires Node.js 22. The extension has no dependencies. The dev dependencies are Playwright,
which runs the headless runner's tests in Chromium, and the MCP SDK and zod for the MCP server.

```bash
npm ci --ignore-scripts
npx playwright install chromium   # once, for the runner's tests
npm test           # runs the real injected.js and popup code in node:vm
npm run validate   # required files, manifest content script, node --check
```

What the tests cover and what they don't: [docs/development.md](docs/development.md).

## Contributing

Issues and pull requests are welcome. Branch from `main`, keep `content.js` talking to
`injected.js` only through `window.postMessage`, run the three commands above, and say in the
PR which pages you checked with the extension loaded. If you change what a rule or verdict
means, explain the Consent Mode behaviour it is based on. More in
[docs/development.md](docs/development.md#contributing-in-detail).

## License

MIT. See [LICENSE](LICENSE).

Built by [Christopher Landaverde](https://focosys.io).
