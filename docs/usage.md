# Installing and using ConsentFlow Debugger

The [README](../README.md#quick-start) has the short version. This page has every install path and a full tour of the popup and side panel.

ConsentFlow Debugger is not published on the Chrome Web Store. Install it as an unpacked
extension in Chrome or another Chromium browser with Manifest V3 support.

## From source

```bash
git clone https://github.com/ChristopherLandaverde/ConsentFlow-Debugger.git
```

1. Open `chrome://extensions/`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select the cloned `ConsentFlow-Debugger` folder (the one that
   contains `manifest.json`).
4. Pin the extension from the toolbar's puzzle-piece menu so its icon is always visible.

To update, `git pull` and click the reload icon on the extension's card in
`chrome://extensions/`.

## From a release zip

When a version is published on the
[Releases page](https://github.com/ChristopherLandaverde/ConsentFlow-Debugger/releases), it
carries a zip of the extension files (`manifest.json`, `background.js`, `content.js`,
`injected.js`, `popup/`, `icons/`).

1. Download the zip and extract it to a folder you will keep.
2. Follow steps 1 to 4 above, selecting the extracted folder.

Chrome loads the extension from that folder, so don't delete it. If no zip is attached to a
release yet, install from source.

## How to use

1. Open (or reload) the page you want to check. The extension starts capturing at
   `document_start`, before Google Tag Manager loads, so a reload gives the complete picture.
   No page of your own handy? The landing page's [measurement test section](https://consentflow-psi.vercel.app/#measurement-playground)
   loads a disposable GTM container.
2. Click the ConsentFlow Debugger icon. The popup shows, top to bottom:
   - **The verdict**: one sentence with its status, `× BROKEN`, `! REVIEW`, `– INCOMPLETE` or
     `✓ VERIFIED`. With too little data it says "Not enough data yet." and names the next step.
   - **Problems**, most severe first, each with what was observed, why it matters, how to fix
     it and how to verify the fix. **Show evidence** lists the timings, requests and values
     behind it.
   - **Checks that need more data**, with what each needs and what to do next.
   - **Passed checks**, collapsed into one row.
   - **Open full trace**, which opens the side panel for this tab (below), and **Reload and
     recheck**, which reloads the tab and captures from the start.
3. Click **Open full trace**, then interact with the consent banner (accept, reject,
   customise). The side panel stays open beside the page and updates every 2 seconds without
   resetting your scroll position, focus or what you expanded. Its tabs:
   - **Findings**: the same verdict and findings as the popup.
   - **Timeline**: consent commands, `config` calls, GTM load and vendor requests in ms after
     page start, with what each consent command changed. Other dataLayer events are one click
     away.
   - **Requests**: for each vendor request, the consent it carried (for Google, its `gcs`
     consent state and `gcd` consent detail) next to the consent on the page when it was sent,
     flagged `× mismatch` when they differ. Raw `gcs`/`gcd` values are behind a toggle.
   - **Consent**: the current consent state, denied first, and the recognized CMP.

   The panel follows the active tab in its window. The popup also refreshes every 4 seconds
   while open, and both remember what you expanded (and the panel's selected tab) for each tab
   until the browser closes.

The toolbar icon shows the number of broken findings on the current tab in red (at most 4
characters, `999+` above 999). It is cleared when nothing is broken; hover the icon for the
verdict sentence. **Open full trace** needs Chrome 116 or later; on Chrome 114 and 115, open
ConsentFlow from Chrome's side panel menu instead.

When something is broken or needs review, a "Discuss a system review ↗" link appears below
everything else. Clicking it opens `https://focosys.io/review` in a new tab; no page data is
sent with it.
