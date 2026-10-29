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
page does with Google Consent Mode and shows it in the popup. It does not protect the page
or the user from that page.

### Permissions and why

| Manifest entry | Why |
|---|---|
| `content_scripts`: `content.js` on `http://*/*` and `https://*/*`, `run_at: document_start`, `all_frames: false` | Consent defaults are often set before Google Tag Manager loads, so capture has to start before any page script runs. This is why Chrome warns the extension can read and change data on all websites. |
| `web_accessible_resources`: `injected.js` on the same matches | Lets `content.js` load `injected.js` into the page's own JavaScript context with a `<script>` tag. A side effect: any website can request this file and so detect that the extension is installed. |
| `activeTab` | Access to the tab you are looking at when you open the popup. |
| `scripting` | Lets `background.js` inject `content.js` into a tab that was already open when the extension was installed or reloaded. |

There is no `host_permissions`, `storage`, `cookies`, `webRequest`, `tabs` or `<all_urls>`
permission.

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
- `content.js` exposes no extension API to the page. It only answers the popup's `getState`
  and `ping` messages.

The popup renders page-derived values as HTML. Most text goes through `esc()`; one known gap
is that consent values are written into a `class` attribute unescaped (tracked as a `todo`
test in `tests/popup.test.mjs`). The popup's Content Security Policy
(`default-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'`) allows only
the extension's own scripts, so injected markup cannot run script.

### No storage, no network calls of its own

- The extension stores nothing: no `chrome.storage`, `localStorage`, `sessionStorage`,
  IndexedDB or cookies. Captured state lives in the inspected page's memory and the open
  popup, and is gone when the page is reloaded or closed.
- Its code makes no network requests: no analytics, no remote configuration, no server. The
  `fetch`, `XMLHttpRequest` and `sendBeacon` wrappers only observe requests the page makes.
  The only way it opens anything remote is the popup's "Discuss a system review" link,
  which opens `https://focosys.io/review` in a new tab when you click it and sends no page
  data.

### Out of scope

The landing page (`index.html`, `measurement-playground.js`, `assets/`) and the legacy
Cookiebot helper scripts (`bookmarklet.js`, `universal-*.js`, `website-integration.js`) are
not part of the extension. Reports about them are still welcome through the same channel.
