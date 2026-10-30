# Privacy and permissions

The [README](../README.md#privacy-and-permissions) has the summary. This page has the full detail.

Nothing leaves your browser. The extension's own code makes no network requests: it has no
analytics, no remote configuration and no server. It stores no captured data: that lives only in
the inspected page's memory and the open popup or side panel, and is gone when the page is
closed or reloaded. The only thing it stores is UI state (which items you expanded and which
side-panel tab you picked, per tab) in `chrome.storage.session`, which Chrome keeps in memory,
never syncs, and clears when the browser closes; a tab's entries are removed when the tab closes.

Two things to know:

- The capture script runs in the page's own JavaScript context (it has to, to see
  `dataLayer` and `gtag`). Its state is exposed as `window.__cfDebug` and relayed to the
  content script with `window.postMessage`, so scripts on the inspected page can read what
  the extension captured about that page.
- To capture network requests it wraps `fetch`, `XMLHttpRequest.prototype.open` and
  `navigator.sendBeacon`, and it wraps `dataLayer.push`. If the page has no `gtag` function
  yet, it defines one that forwards to `dataLayer`, as the standard gtag snippet does. Calls are
  passed through unchanged. Image and iframe requests to Google hosts are read from the page's
  Resource Timing entries with a `PerformanceObserver`, which needs no permission and sees only
  each resource's URL and timing. For every captured request it keeps the host and the path up
  to the first `;`, never the query string or Floodlight's `;` parameters.

What each manifest entry is for:

| Manifest entry | Why |
|---|---|
| `content_scripts` on `http://*/*` and `https://*/*`, at `document_start` | Consent defaults are often set before GTM loads, so the capture script has to be in place before any page script runs. Chrome will warn that the extension can "read and change all your data on all websites" because of this. |
| `web_accessible_resources`: `injected.js` | Lets the content script load `injected.js` into the page's context via a `<script>` tag. |
| `activeTab` | Access to the current tab when you click the toolbar icon. |
| `scripting` | Lets the background worker inject `content.js` into a tab that was already open before the extension was installed or reloaded. |
| `sidePanel` | The side panel (**Open full trace**) that shows the timeline, requests and consent state beside the page. |
| `storage` | `chrome.storage.session` only, for UI state: expanded items and the selected side-panel tab. No captured data, nothing persistent, nothing synced. |

See [SECURITY.md](../SECURITY.md) for the full security model and how to report a
vulnerability privately.
