# AGENTS.md

Guidance for coding agents working in this repository. The portfolio-wide rules live in
`portfolio-ops/AGENTS.md`; this file wins on anything specific to this repo.

## What this is

ConsentFlow Debugger is a Chrome extension (Manifest V3, plain JavaScript, no build step)
that inspects Google Consent Mode v2 on the current page: consent default/update commands,
GCS/GCD decoding, race conditions, CMP and tag detection, and tag firing violations. It is
not on the Chrome Web Store; publishing there is parked until Christopher decides otherwise.

The repo also holds the landing page (`index.html`, `measurement-playground.js`, `assets/`),
documented in `docs/website.md`. The Cookiebot helper scripts (`bookmarklet.js`,
`universal-bookmarklet.js`, `universal-cookiebot-integration.js`, `website-integration.js`)
and their guides are legacy and not part of the extension.

## Commands

Node.js 22. The extension has no dependencies; the only dev dependency is `playwright`, for
the headless runner's tests (its Chromium: `npx playwright install chromium`).

```bash
npm ci --ignore-scripts
npm test           # node --test "tests/*.test.mjs"
npm run validate   # node scripts/validate.mjs: required files, manifest content script, node --check
```

Run all three before every commit. CI (`.github/workflows/ci.yml`) is one job that runs them
plus `npx playwright install --with-deps chromium` and `npm audit --audit-level=moderate`.

`scripts/consentflow-check.mjs` is the headless runner (README, "Use it from an agent / CLI"):
Playwright Chromium with `injected.js` added by `addInitScript`, state read through the same
`get-state` message `content.js` uses, verdict from `popup/findings.js`. Keep it reusing those
files unchanged; it must never send captured data anywhere.

## Loading the extension

1. `chrome://extensions/`, turn on Developer mode.
2. **Load unpacked**, select the repo root (the folder with `manifest.json`).
3. After editing, click reload on the extension card, then reload the target tab (the capture
   script must run at `document_start`).
4. Debug `injected.js` in the page's DevTools (state is on `window.__cfDebug`), `content.js`
   in the page's DevTools under the extension's content-script context, `background.js` via
   the card's "service worker" link, and the popup by right-clicking it and choosing Inspect.

## Layout and conventions

- `injected.js` runs in the page context: capture, decoding, detection, rules, verdicts.
- `content.js` runs in the isolated world. It talks to `injected.js` only via
  `window.postMessage` with `source: 'cf-debug-injected'` / `'cf-debug-content'`; a test
  enforces this boundary. Don't expose extension APIs to the page.
- `background.js` injects `content.js` on demand, sets the toolbar badge and forgets closed
  tabs' UI state. `popup/` and `sidepanel/` render state and escape page-derived text with
  `esc()` (`popup/render.js`) before inserting HTML, including inside attributes. Escape
  anything new you render.
- The extension makes no network requests and stores no captured data. The only storage is
  UI state in `chrome.storage.session` (`popup/ui-state.js`, approved in #15). Keep it that
  way; any change to permissions or data handling needs a `needs-decision` issue, and
  `scripts/validate.mjs` lists the permitted permissions.
- Plain ES5/ES2017-style scripts, no modules, no bundler, no dependencies in the extension.
- Icons: `icons/icon.svg` is the source; regenerate PNGs with
  `for s in 16 32 48 128; do rsvg-convert -w $s -h $s icons/icon.svg -o icons/icon-$s.png; done`.
- Changing detection rules or verdict meanings changes what the data means: open a
  `needs-decision` issue first.
- README claims must be true of the code. Never describe the extension as available on the
  Chrome Web Store.

## Testing

`npm test` loads the real `injected.js` and `popup/popup.js` into `node:vm` contexts.
`tests/helpers/page.mjs` stands in for the page (window as global, `document` script tags and
DOMContentLoaded, `fetch`, `sendBeacon`, `XMLHttpRequest`, `postMessage`) and lets the test set
`performance.now()` and fire timers; `tests/helpers/popup-dom.mjs` builds a stub DOM from
`popup/popup.html` or `sidepanel/panel.html` and a stub `chrome` API (including
`chrome.storage.session`). No source changes or dependencies were needed, so
keep the extension files loadable that way: plain scripts, browser globals only.

- Change behavior in `injected.js` or the popup: add or update a test in the matching
  `tests/*.test.mjs` file. Assert on observable output (`window.__cfDebug`, the `get-state`
  reply, rendered HTML), not on internals.
- A known bug can be recorded as a `node:test` `todo` test until it is fixed; fixing it means
  removing the flag. There are none today.
- `tests/badge.test.mjs` loads `background.js` and `content.js` with stubbed `chrome` for the
  badge pipeline. Not covered: real Chrome (side panel opening, badge drawing). For changes there,
  load the extension unpacked, check real pages with and without Consent Mode, and say in the
  PR what you checked.

## Merging

Standing permission from the owner (Christopher Landaverde, 2026-10-30): agents merge their own pull requests, user-visible ones included, without asking, when all of these hold:
- CI is green on GitHub on the PR's latest commit (`gh pr checks <n>`; local runs don't count).
- An agent other than the author reviewed the diff and posted `Blocking findings: none`.
- The PR merges cleanly into `main`.

Merge with `gh pr merge <n> --squash --delete-branch`, then confirm `main` CI passes. Still stop and ask for: releases, tags, store or package publishing, deploys, repo settings or visibility, spending money, and deleting anything you didn't create. Never push directly to `main` or force-push a shared branch.
