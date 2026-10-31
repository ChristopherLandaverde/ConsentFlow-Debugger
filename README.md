<p align="center">
  <img src="icons/icon-128.png" width="96" height="96" alt="ConsentFlow Debugger logo">
</p>

<h1 align="center">ConsentFlow Debugger</h1>

<p align="center">
  <strong>Find the tags that fire before consent on any live page, and get the fix.</strong>
</p>

<p align="center">
  8 Consent Mode rules · 10 tags judged request by request · 10 consent platforms (CMPs) recognised · nothing leaves your browser
</p>

<p align="center">
  <a href="https://github.com/ChristopherLandaverde/ConsentFlow-Debugger/actions/workflows/ci.yml"><img src="https://github.com/ChristopherLandaverde/ConsentFlow-Debugger/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI"></a>
  <a href="manifest.json"><img src="https://img.shields.io/github/manifest-json/v/ChristopherLandaverde/ConsentFlow-Debugger?color=036461&label=version" alt="Version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/ChristopherLandaverde/ConsentFlow-Debugger?color=036461" alt="License: MIT"></a>
</p>

<p align="center">
  <a href="#quick-start">Quick start</a> · <a href="#what-you-get">What you get</a> · <a href="#known-limits">Known limits</a> · <a href="#privacy-and-permissions">Privacy</a> · <a href="https://consentflow-psi.vercel.app">Landing page</a>
</p>

A Consent Mode setup can look right in GTM preview and still be wrong on the live page: the
consent default lands a few hundred milliseconds after `config`, a pixel fires before the
banner is answered, or the v2 fields `ad_user_data` and `ad_personalization` are missing.
Google's own guide is blunt about the first one: "If your consent code is called out of
order, consent defaults won't work"
([source](https://developers.google.com/tag-platform/security/guides/consent)). The cost is
requests sent for visitors who said no, and consent signals that Google's
[conversion modelling](https://support.google.com/google-ads/answer/10000067) relies on
being wrong.

ConsentFlow Debugger is a free, open-source Chrome extension that shows you this on the page
itself, in one click, with the fix for each problem.

<p align="center">
  <img src="docs/media/fix-demo.gif" width="880" alt="Four captioned frames from real Chromium with the unpacked extension loaded. 1: the bundled broken sample page, whose source runs gtag config at 60 ms and the consent default at 390 ms; the ConsentFlow popup, opened from the toolbar, shows BROKEN, 2 consent problems, and the finding Google tag configured before the consent default: config at +57 ms, consent default at +388 ms, a 332 ms gap, with the fix and how to verify it. 2: the fix, before and after source side by side: the consent default moved above config. 3: the correctly wired sample page; the popup shows VERIFIED, consent is wired correctly, all 9 checks passed. 4: the side panel opened with Open full trace, Timeline tab: consent default at +58 ms, Google tag config at +118 ms.">
  <br><sub>A Consent Mode bug caught, fixed and confirmed, on the two sample pages bundled in <code>tests/fixtures/</code>. The fixed sample also differs in more than the fix (a OneTrust stub, a consent update, no Meta Pixel), so frame 3 is the same checks on a correctly wired page.</sub>
</p>

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
| `--consent accept` / `deny` | Click the accept-all or reject-all button of OneTrust, Cookiebot, Google Funding Choices or Usercentrics, using known button selectors. Each is tested only on a stand-in banner (`tests/fixtures/cmp-banner.html`), not on the vendor's real one. With none of those buttons on the page it reports `"consentInteraction": "not_found"` and clicks nothing; a button it can't click (covered by another element, say) is `"click_failed"`. If the page navigates or reloads after the click, `navigatedAfterConsent` is `true` and the capture covers the new page load. |
| `--wait <ms>` | How long to keep capturing after the page loads, and again after a click. Default 3000. |

Exit codes: `0` VERIFIED or REVIEW; `1` BROKEN; `3` INCOMPLETE, a capture that didn't
finish, or a requested banner click that didn't happen (`not_found` or `click_failed`, even
when the page is also BROKEN, since the scenario you asked for wasn't run); `2` bad arguments,
a page that couldn't be loaded or answered HTTP 400 or above, or the runner itself failing
(for example, Chromium not installed).

Run time: a normal page takes a few seconds plus `--wait` (twice `--wait` after a click).
Every step has a time limit, so with the defaults a run that hits all of them ends within about
56 s for `--consent none` and 70 s for `accept` / `deny`, plus browser start-up: 31 s to load
the page, 11 s for ConsentFlow's first pass, the 3 s wait, 6 s to read the state and 5 s to close
the browser, and for a click up to 11 s more for the banner and another 3 s wait.

What it doesn't do: it checks one page load from wherever you run it, so visitor regions are
not simulated (a CMP that shows its banner only in the EU may not show it to a run from
elsewhere); only the four CMPs above can be clicked, and their selectors have not been checked
against the real banners; capture starts slightly earlier than in the extension, whose
script loads asynchronously; and the [known limits](#known-limits) below apply as they do in
the extension. The runner sends nothing anywhere itself: the browser loads the page you
name, and that page makes its own requests as it would for any visitor.

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

Requires Node.js 22. The extension has no dependencies; the one dev dependency, Playwright,
runs the headless runner's tests in Chromium.

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
