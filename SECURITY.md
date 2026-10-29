# Security policy

## Supported versions

Only the latest release, currently **2.0.x** (the version in `manifest.json` on `main`),
gets security fixes. The extension is not on the Chrome Web Store; you run it as an
unpacked extension from this repository or a release zip, so updating means pulling or
downloading the new version.

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub's private vulnerability reporting:
open the repository's **Security** tab and choose **Report a vulnerability**
([direct link](https://github.com/ChristopherLandaverde/ConsentFlow-Debugger/security/advisories/new)).
Don't open a public issue for a vulnerability.

Include what you found, how to reproduce it (a test page helps), and what an attacker
could do with it. You'll get a reply on the advisory. This is a one-person open-source
project, so there is no bug bounty and no guaranteed response time.

## Security model

ConsentFlow Debugger is a debugging aid for the page you are inspecting. It reads what that
page does with Google Consent Mode and shows it in the popup, the side panel and the toolbar
badge. It does not protect the page
or the user from that page.

### Permissions and why

| Manifest entry | Why |
|---|---|
| `content_scripts`: `content.js` on `http://*/*` and `https://*/*`, `run_at: document_start`, `all_frames: false` | Consent defaults are often set before Google Tag Manager loads, so capture has to start before any page script runs. This is why Chrome warns the extension can read and change data on all websites. |
| `web_accessible_resources`: `injected.js` on the same matches | Lets `content.js` load `injected.js` into the page's own JavaScript context with a `<script>` tag. A side effect: any website can request this file and so detect that the extension is installed. |
| `activeTab` | Access to the tab you are looking at when you open the popup. |
| `scripting` | Lets `background.js` inject `content.js` into a tab that was already open when the extension was installed or reloaded. |
| `sidePanel` | The side panel that shows the timeline, requests and consent state beside the page (approved in #15). It reads state the same way the popup does, by messaging the active tab's `content.js`. |
| `storage` | `chrome.storage.session` only, for UI state (approved in #15). See "Storage" below. |

There is no `host_permissions`, `cookies`, `webRequest`, `tabs` or `<all_urls>` permission.
`scripts/validate.mjs` fails if the manifest requests any permission not on this list.

### Top frame only

`content.js` is declared with `all_frames: false`, and `background.js` injects it with
`chrome.scripting.executeScript({ target: { tabId } })`, which targets only the top frame.
Iframes are not inspected.

### What the page can see and do

`injected.js` has to run in the page's JavaScript context to see `dataLayer` and `gtag`.
That has consequences you should know about:

- It wraps `dataLayer.push`, `window.gtag`, `window.fetch`, `XMLHttpRequest.prototype.open`
  and `navigator.sendBeacon`, recording calls and passing them through unchanged. If the page
  has no `gtag` yet, it defines one that pushes to `dataLayer`, as the standard snippet does.
- Everything it captures (consent commands, config IDs, dataLayer event names, and the host,
  path, tracking ID, event name and consent parameters of vendor requests) is stored on
  `window.__cfDebug` and sent to `content.js` with `window.postMessage(..., '*')`. **Scripts on the inspected page can read all of it,**
  and they could read it anyway, since it describes that page's own behavior.
- Messages between `injected.js` and `content.js` are identified only by a `source` string
  (`cf-debug-injected` / `cf-debug-content`). A page script can send the same messages, so
  a page can make the popup show state it made up. Treat what the popup shows as
  information about the page, not as proof.
- `content.js` exposes no extension API to the page. It answers the popup's and side panel's
  `getState` and `ping` messages, and sends `background.js` the page's rule and tag results
  (not the timeline or requests) so it can set the toolbar badge. A page that forges messages
  can therefore also change the badge for its own tab.

The popup and side panel render page-derived values as HTML. Every page-derived string goes
through `esc()` (`popup/render.js`), including inside attributes. Both pages use the Content
Security Policy `default-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'`,
which allows only the extension's own scripts, so injected markup cannot run script.

### Storage

- Captured data is never stored. It lives in the inspected page's memory and the open popup or
  side panel, and is gone when the page is reloaded or closed.
- The only thing stored is UI state, in `chrome.storage.session`: for each tab, which
  disclosures are expanded in the popup and side panel, and which side-panel tab is selected.
  Entries hold disclosure ids and a view name, are validated on load, and are removed when the
  tab closes. Chrome keeps session storage in memory, does not sync it, and clears it when the
  browser closes. It stays at Chrome's default access level, so content scripts and pages
  cannot read it.
- No `chrome.storage.local`/`sync`, `localStorage`, `sessionStorage`, IndexedDB or cookies.

### No network calls of its own

- Its code makes no network requests: no analytics, no remote configuration, no server. The
  `fetch`, `XMLHttpRequest` and `sendBeacon` wrappers only observe requests the page makes.
  The only way it opens anything remote is the popup's "Discuss a system review" link,
  which opens `https://focosys.io/review` in a new tab when you click it and sends no page
  data.

### Out of scope

The landing page (`index.html`, `measurement-playground.js`, `assets/`) and the legacy
Cookiebot helper scripts (`bookmarklet.js`, `universal-*.js`, `website-integration.js`) are
not part of the extension. Reports about them are still welcome through the same channel.
