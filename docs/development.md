# Development and testing

Requires Node.js 22 (the version CI uses). There are no runtime or dev dependencies.

```bash
npm ci --ignore-scripts
npm test           # node --test "tests/*.test.mjs"
npm run validate   # node scripts/validate.mjs
```

`npm test` runs the real `injected.js`, `popup/findings.js` and `popup/popup.js` inside `node:vm` contexts with
a small stand-in for the page (`tests/helpers/page.mjs`) and for the popup's DOM and the
`chrome` API (`tests/helpers/popup-dom.mjs`). The test controls the clock and the timers,
so race-condition timings are exact. What is covered:

| File | Behavior tested |
|---|---|
| `tests/injected-capture.test.mjs` | Consent `default` / `update` capture via `gtag()`, array and arguments-object pushes, entries already in `dataLayer`, first-default-wins, update-before-default, GTM replacing `dataLayer.push`, a page replacing `gtag`, config calls, `gtm.js` and other events |
| `tests/injected-signals.test.mjs` | GCS, GCD and NPA decoding, `tid` / `en`, capture through `fetch`, `sendBeacon` and `XMLHttpRequest` (calls passed through unchanged), Google image/iframe requests from Resource Timing and Floodlight's `;` path parameters, vendor attribution, non-vendor requests ignored |
| `tests/injected-rules.test.mjs` | All eight validation rules (pass, fail, warn, not checked cases), the default-before-config and update-before-default races, CMP and tag detection, the five tag verdicts judged by consent at the time of each request, the `get-state` message and the 300/200 export limits |
| `tests/findings.test.mjs` | The verdict for every state (including "Not enough data yet" with zero Google requests), finding order, and the copy model: every rule status and tag verdict has observed, consequence, fix, verify and evidence, with a copy lint |
| `tests/popup.test.mjs` | Fetching state (including the inject-and-retry path), loading, error and content states, the verdict, findings, disclosures, the review link, live refresh keeping expanded items, scroll and focus, captured data, HTML escaping, and page-to-popup runs that feed `injected.js` output into the popup |
| `tests/static-validation.test.mjs` | The `postMessage` boundary in `content.js`, landing-page checks and a committed-secret scan |

Every test runs as a real assertion; there are no `todo` or skipped tests.

`npm run validate` confirms the extension and website files exist, that `manifest.json`
declares a content script, and that every JavaScript file passes `node --check`.

Not covered by automated tests: `content.js` and `background.js` message relaying, real
Chrome behavior (loading at `document_start`, the popup's layout and CSS) and real sites.
Check those by loading the extension unpacked and trying pages with and without Consent Mode;
`tests/fixtures/popup-states.html` is a local page that produces each popup state.

## Contributing in detail

Issues and pull requests are welcome.

1. Fork the repo and create a branch from `main`.
2. Make your change. Keep the page-context / content-script boundary: `content.js` must talk
   to `injected.js` only through `window.postMessage`.
3. Run `npm ci --ignore-scripts && npm test && npm run validate`, and add or update tests
   in `tests/` for behavior you change.
4. Load the extension unpacked, reload it after each change, and check it on a real page.
   Mention in the PR which sites or scenarios you tried.
5. Open a pull request describing what changed and why.

If you change what a rule or verdict means, explain the Consent Mode behavior it is based on.
