# Telling a GTM web container apart from plain gtag.js

Research for [#21](https://github.com/ChristopherLandaverde/ConsentFlow-Debugger/issues/21), October 2026.
Research only: no detection code was changed. Changing detection changes verdicts, so
Christopher decides (see the recommendation at the end).

## The question

`detectTags()` in `injected.js` reports a "Google Tag Manager" tag when
`window.google_tag_manager` exists or a script `src` contains `googletagmanager.com/gtm.js`.
That tag needs `analytics_storage` and `ad_storage`, and it is judged against every request to
a Google endpoint. If plain gtag.js also defines `window.google_tag_manager`, then a site with
only GA4 has its GA4 hits judged against `ad_storage`. A correctly consented page (analytics
granted, ads denied) then shows × BROKEN.

## Short answer

- **gtag.js defines `window.google_tag_manager`.** Measured in Chromium with Google's real
  scripts, so the current rule matches every gtag.js page.
- **The reliable page-side signal is the ID the loader registered.** Each loaded tag or
  container adds a key to `window.google_tag_manager` named after its ID. A GTM web container
  registers a `GTM-` key. gtag.js registers its `G-` / `AW-` key. This held when the scripts
  came from a first-party path. Google does not document the object, so this is observed
  behaviour, not a contract.
- **Matching the script URL host misses first-party serving.** Server-side tagging and the
  Google tag gateway serve gtm.js from the site's own domain and from a path the site chooses.
- **Google is merging the two products.** Since 2026 Google calls a Google tag (`G-`/`AW-`
  loaded via `/gtag/js`) a "container" too, but it may run only Google tags. A `GTM-` ID is
  still the only kind that runs any tag type.

## Sources (primary)

| # | Claim | Source |
|---|---|---|
| S1 | New Google tags get a `GT-` ID; container IDs begin with `GTM-` | [Tag platform: existing tags](https://developers.google.com/tag-platform/devguides/existing): "Each newly created Google tag gets a GT prefix", "The container ID begins with 'GTM-'." |
| S2 | One Google tag can have several IDs (`GT-`, `G-`, `AW-`), "used interchangeably" | [Tag Manager Help 12326985](https://support.google.com/tagmanager/answer/12326985) |
| S3 | Official GTM web snippet pushes `{'gtm.start': …, event: 'gtm.js'}` and loads `googletagmanager.com/gtm.js?id=` | [Tag Manager Help 14847097](https://support.google.com/tagmanager/answer/14847097) |
| S4 | Official gtag.js snippet loads `gtag/js?id=TAG_ID`, then `gtag('js', …)`, `gtag('config', TAG_ID)` | [Install the Google tag](https://developers.google.com/tag-platform/gtagjs/install) |
| S5 | Server-side tagging can serve gtm.js and gtag.js from the site's own server, "updating the script source URL on the website to point to the custom server" | [Dependency serving](https://developers.google.com/tag-platform/tag-manager/server-side/dependency-serving) |
| S6 | The custom server can be a subdomain or a path on the site, such as `https://www.example.com/metrics` | [Custom domain](https://developers.google.com/tag-platform/tag-manager/server-side/custom-domain) |
| S7 | Google tag gateway "loads the Google tag from your first-party domain". The site chooses the measurement path | [Gateway setup guide](https://developers.google.com/tag-platform/tag-manager/gateway/setup-guide), [Tag Manager Help 16061641](https://support.google.com/tagmanager/answer/16061641) |
| S8 | "Your Google tags will be upgraded to fully capable Google Tag Manager containers… This upgrade will not change the in-page behavior of the Google tags". Containers now send to Google destinations directly; "previously" GTM loaded gtag.js to do that | [Tag Manager Help 17079602](https://support.google.com/tagmanager/answer/17079602) (Aug 2026), [release notes 4620708](https://support.google.com/tagmanager/answer/4620708) |
| S9 | `GTM-` containers allow all tag types. Containers loaded with a `G-`/`AW-` ID are limited to Google tags | [Tag Manager Help 17070049](https://support.google.com/tagmanager/answer/17070049), [release notes 4620708](https://support.google.com/tagmanager/answer/4620708) (Jul 9, 2026) |
| S10 | Loading `G-`/`AW-`/`DC-` IDs through `gtm.js` is unsupported: use `gtm.js` for `GTM-` IDs and `/gtag/js` for the others | [Tag Manager Help 17231523](https://support.google.com/tagmanager/answer/17231523) |
| S11 | No Google page documents `window.google_tag_manager` or its keys | Searched developers.google.com/tag-platform and support.google.com/tagmanager; nothing found |

Blog posts were not used.

## What the page actually sees (measured)

Method: a local page loaded Google's real `gtag/js` and `gtm.js` from `www.googletagmanager.com`
in Playwright Chromium 151 (headless). It used placeholder IDs, for which Google still serves a
script. After 3 s it read `Object.keys(window.google_tag_manager)`, the `dataLayer` events and
the script tags. For the first-party variants, the same scripts were proxied from a same-origin
path (`/metrics/loader.js`, `/metrics/g.js`), as a custom domain or tag gateway would serve them.
Probe script: `probe21.mjs` (not committed; it is reproducible from this description).

| Page | `google_tag_manager` defined | ID keys | `dataLayer` events | Script `src` |
|---|---|---|---|---|
| gtag.js, `G-FIXTURE123` | yes | `G-FIXTURE123` | `js`, `config`, `gtm.dom`, `gtm.load` | `…/gtag/js?id=G-…` |
| gtag.js, `AW-123456789` | yes | `AW-123456789` | `js`, `config`, `gtm.dom`, `gtm.load` | `…/gtag/js?id=AW-…` |
| gtag.js, `G-` + `AW-` | yes | `G-…`, `AW-…` | as above | two `…/gtag/js?id=…` (one with `&cx=c`) |
| GTM, `GTM-FIXTURE` | yes | `GTM-FIXTURE` | `gtm.js`, `gtm.dom`, `gtm.load` | `…/gtm.js?id=GTM-…` |
| GTM + gtag.js | yes | `GTM-FIXTURE`, `G-FIXTURE123` | `gtm.js`, `js`, `config`, … | `gtm.js` and `gtag/js` |
| GTM from `/metrics/loader.js` | yes | `GTM-FIXTURE` | `gtm.js`, `gtm.dom`, `gtm.load` | `http://127.0.0.1/metrics/loader.js?id=GTM-…` |
| gtag.js from `/metrics/g.js` | yes | `G-FIXTURE123` | `js`, `config`, … | `http://127.0.0.1/metrics/g.js?id=G-…` |

Every ID key holds an object with the same shape (`dataLayer`, `callback`, `bootstrap`),
whichever loader created it. The other keys (`dataLayer`, `mb`, `r`, `sequence`, `tcf`, …) are
shared runtime internals.

What the measurements show:
- The current rule (`!!window.google_tag_manager`) is true on every gtag.js page.
- `GTM-` keys appear only when a GTM container ran, including from a first-party path.
- A `googletagmanager.com/gtm.js` src match misses the first-party GTM page (S5–S7).
- `gtm.dom` / `gtm.load` are pushed by gtag.js too, so they are not GTM signals. The
  `{event: 'gtm.js'}` object appeared in `window.dataLayer` only on GTM pages. It comes from the
  GTM snippet (S3), but a hand-edited snippet can drop it.
- `&cx=c&gtm=…` on a `gtag/js` URL appeared when gtag.js loaded a second destination, with no
  GTM on the page. So it is not a GTM signal either.

### What ConsentFlow reports today

Fixture `tests/fixtures/gtag-vs-gtm.html`: consent default all denied, update
`analytics_storage: granted` before any Google script loads. That is a correctly consented
page with ads denied. Results with the unpacked extension in headed Chromium, popup read
after 5 s:

| Scenario | Tags detected | Verdict |
|---|---|---|
| `gtag` | GA4, **Google Tag Manager** | × BROKEN: "Google Tag Manager sent 1 request while ad_storage was denied" + GCS mismatch |
| `gtag-ads` | GA4, **Google Tag Manager** | × BROKEN (same two findings) |
| `gtm` | Google Tag Manager | – INCOMPLETE (no Google request yet; the placeholder container has no tags) |
| `gtm-gtag` | GA4, Google Tag Manager | × BROKEN (same two findings) |

The GCS mismatch is a separate bug. The GA4 hit carried `gcs=G101` (ads denied, analytics
granted). `decodeGCS()` reads the third character as `analytics_storage`, but Google's
server-side transformation guide treats both `G100` and `G110` as "analytics denied". So the
**fourth** character is `analytics_storage` and the third is `ad_storage`
([Transformations](https://developers.google.com/tag-platform/tag-manager/server-side/transformations)).
`decodeGCD()` also has no mapping for the `r` state seen in `gcd=13p3r3p3p5l1`. Not filed
as its own issue yet (raised on #21); fixing #21 alone does not turn these pages green.

## Edge cases

- **gtag.js loaded through a GTM container.** Before 2026, a GA4 tag in GTM loaded `gtag/js`
  (S8), so pages had both `GTM-` and `G-` keys. Both tags are really there, and detecting both
  is correct. Since the 2026 change containers send to Google destinations directly (S8), so
  this combination will be rarer.
- **Server-side GTM / custom domain / tag gateway.** The host and path are site-chosen (S5–S7),
  so no `src` pattern is reliable. The `GTM-` key survived first-party serving in the
  measurement above. The server container's own `GTM-` ID runs on the server, not the page, so
  it never appears.
- **Google tags upgraded to "containers" (`G-`/`AW-`/`GT-` via `/gtag/js`).** Google calls them
  containers now (S8), but they can run only Google tags (S9). For consent judgement they are
  Google tags, not GTM.
- **`GT-` IDs** are Google tags, not GTM containers (S1). A `/^GTM-/` test must not match them,
  and it doesn't, because `GT-` lacks the `M`.
- **Timing.** The `GTM-` key appears only after gtm.js has executed. Detection runs 500 ms after
  DOMContentLoaded and again every 3 s (and on every read once #22 lands), so a slow container
  is picked up on a later pass.
- **Undocumented object.** Google could rename `google_tag_manager` or its keys (S11). The `src`
  fallback and a test fixture keep that visible.

## Recommendation

Detection rule for the "Google Tag Manager" tag:

```js
function hasGtmContainer() {
  var gtm = window.google_tag_manager;
  if (gtm && Object.keys(gtm).some(function (k) { return /^GTM-[A-Z0-9]+$/.test(k); })) return true;
  // Fallback before gtm.js has run, any host or path: a gtm.js-style loader with a GTM- id.
  return !!document.querySelector('script[src*="id=GTM-"]');
}
```

What changes:
- **gtag.js-only sites:** no "Google Tag Manager" tag. Their GA4 hits are no longer judged
  against `ad_storage`, so the false × BROKEN tag finding goes away. They stay BROKEN on the
  bundled fixture until the `gcs` decoding bug is fixed.
- **Sites with a real GTM container:** unchanged, including first-party serving (better: the old
  `src` test missed those, though the global caught them).
- **Side effect to decide on with it:** on gtag.js sites with an `AW-` ID, the false GTM tag was
  the only entry that judged Google requests against `ad_storage`. "Google Ads" is detected only
  from `googleadservices.com` / `googlesyndication.com` scripts, which gtag.js does not add. To
  keep Ads requests judged, also detect Google Ads from `AW-` (and Floodlight from `DC-`) keys in
  `google_tag_manager`.

Not covered by this rule: a page with a real GTM container still has its GA4 hits judged
against `ad_storage`, because each Google tag is judged against every request to a Google
endpoint (the `gtm-gtag` row above). That is a verdict-model question (judge each request by
its endpoint, or treat GTM as a loader with no consent type of its own), not a detection one.
