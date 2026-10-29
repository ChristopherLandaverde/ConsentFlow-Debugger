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
and their guides are legacy and not part of the extension. `backup_20250726_170514/` holds an
abandoned test suite that milestone C1 will salvage.

## Commands

Node.js 22. No dependencies.

```bash
npm ci --ignore-scripts
npm test           # node --test tests/static-validation.test.mjs
npm run validate   # node scripts/validate.mjs: required files, manifest content script, node --check
```

Run all three before every commit. CI (`.github/workflows/ci.yml`) runs the same scripts plus
`npm audit --audit-level=moderate`.

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
- `background.js` only injects `content.js` on demand. `popup/` renders state and escapes
  every page-derived string with `esc()` before inserting HTML.
- The extension makes no network requests and stores nothing. Keep it that way; any change
  to permissions or data handling needs a `needs-decision` issue.
- Plain ES5/ES2017-style scripts, no modules, no bundler, no dependencies in the extension.
- Icons: `icons/icon.svg` is the source; regenerate PNGs with
  `for s in 16 32 48 128; do rsvg-convert -w $s -h $s icons/icon.svg -o icons/icon-$s.png; done`.
- Changing detection rules or verdict meanings changes what the data means: open a
  `needs-decision` issue first.
- README claims must be true of the code. Never describe the extension as available on the
  Chrome Web Store.

## Testing, honestly

`npm test` is a static test of source text: one assertion group covers the extension's
`postMessage` boundary, the rest cover the landing page and a secret scan. `test:architecture`,
`test:integration`, `test:e2e`, `test:performance` and `lint:security` all run that same file,
and `lint` runs the validator. There are no behavioral tests for `injected.js` or the popup
yet; adding them is milestone C1. Until then, verify behavior by loading the extension and
checking real pages with and without Consent Mode, and say in the PR what you checked.
