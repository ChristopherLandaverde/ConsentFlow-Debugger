# What ConsentFlow Debugger detects

The full list of what the extension captures, decodes and checks. Rule logic lives in `injected.js` (validation rules, CMP and tag detection); the finding copy and verdict live in `popup/findings.js`. Known limits are in the [README](../README.md#known-limits).

## Consent Mode commands

Every `consent` `default` and `update` command that reaches
`dataLayer`, whether pushed directly or through `gtag()`, in both array and arguments-object
form, including entries already in `dataLayer` before the extension's script ran. Each one is
timestamped and the merged current consent state is shown.

## Race conditions

Three kinds:

- The first `gtag('config', ...)` call compared with the consent default. If config comes
  first, the rule fails and reports how many milliseconds late the default was.
- A consent `update` captured before any `default` (or an update on a page with no default at
  all). The rule fails: a default processed after an update can override the choice the user
  already made, and tags that fire before the default run with implicit `granted` consent.
- Requests sent before consent. Each captured request records the consent state at the moment
  it was sent, from the captured consent timeline and, for Google requests, from the request's
  own `gcs` / `gcd`. A request sent while a consent type its tag needs was `denied` counts as a
  violation even if consent was granted later, unless it is one of Google's cookieless pings
  under advanced Consent Mode ([below](#cookieless-pings-advanced-consent-mode)).

## Which requests are captured

- `fetch`, `XMLHttpRequest` and `navigator.sendBeacon` calls to a vendor host, when they are
  made.
- Image and iframe requests to Google hosts (#36). Floodlight sends its activity as an `<img>`
  (`ade.googlesyndication.com/ddm/activity/…` with `ad_storage` denied) or an `<iframe>`
  (`<id>.fls.doubleclick.net/activityi;…`), as hard-coded Floodlight tags do
  ([Campaign Manager 360 Help 2824087][fl-url]), and Google Ads sends some hits as images
  (`www.google.com/pagead/1p-user-list/<id>/`). A `PerformanceObserver` for `resource` entries
  sees them without any extra permission. An entry arrives only once the load finishes, so the
  request is placed at the entry's `startTime` and judged by the consent the page had then,
  rebuilt from the captured consent commands. A load that never finishes may not produce an
  entry. `googletagmanager.com` images are skipped: they are Google tag diagnostics, not
  measurement (#28). Other vendors' image pixels and script loads are not captured.
- For each request, the host and the path up to the first `;` are kept, never the query
  string. Floodlight puts its parameters after `;` in the path
  (`…/activity;src=1234567;…;gcs=G101;gcd=…;auiddc=…;~oref=<page URL>`). They are read like
  query parameters for `gcs`, `gcd`, `npa` and the cookie-ID check, and are not stored.

## GCS / GCD signals

For requests to Google endpoints (Google Analytics, Google Tag Manager,
Google Ads, DoubleClick, Google Syndication, and `www.google.com`'s `/pagead/`, `/ccm/` and
`/rmkt/` paths and `adservice.google.com/ddm/`), the `gcs` parameter
(`G1<ad_storage><analytics_storage>`, `1` granted, `0` denied) is decoded into
`ad_storage` / `analytics_storage`, the `gcd` parameter into `ad_storage`,
`analytics_storage`, `ad_user_data` and `ad_personalization` with default/update source, and
`npa` into personalized / non-personalized. The tracking ID (`tid`) and GA4 event name (`en`)
are shown too.

Google defines `gcs` (it carries `ad_storage` and `analytics_storage`) but not the letters of
`gcd` ([Consent mode HTTP parameters][cm-params]: `gcd` "encodes detailed consent choices").
ConsentFlow reads `l` (unset), `p` / `q` (denied by default / update) and `t` / `e` (granted by
default / update), and leaves any other letter unknown instead of guessing. Real gtag.js sends
`r` for a type granted by an update (measured: `gcs=G101` with `gcd=13p3r3p3p5l1`, and `G111`
with `13r3r3r3r5l1`). When a letter is unknown, the request's consent for `ad_storage` and
`analytics_storage` is read from `gcs`, and the side panel's Requests view shows "from `gcs`;
`gcd` letter `r` is undocumented" next to the value. `ad_user_data` and `ad_personalization`
have no `gcs` equivalent, so they show as unknown with the letter (#32).

[cm-params]: https://developers.google.com/tag-platform/security/concepts/consent-mode

## Validation rules

Eight checks, each reported as pass, fail, warn or not checked. A check
that lacked the data it needs (no `config` call, no consent update, no Google request with a
`gcs` value, no consent default, or no supported CMP) is reported as not checked with the
reason, never as a pass:

| Rule | Checks |
|---|---|
| Consent Default Exists | A `consent` `default` command is present |
| Default Before Config | The default precedes the first `config` call (race condition) |
| Consent Mode v2 Types | The default declares `ad_user_data` and `ad_personalization` |
| `wait_for_update` Configured | When a CMP is detected, the default sets `wait_for_update` |
| Consent Update Received | At least one `consent` `update` arrived |
| GCS Signal Consistency | Each decoded `gcs` value matches the consent state at the moment the request was sent |
| No Duplicate Defaults | Only one `consent` `default` was issued |
| Default Before Update | No `consent` `update` arrived before the default (race condition) |

## Tags and tag firing violations

Detects eleven tags from page globals and script URLs (Google
Analytics 4, Google Tag Manager, Google Ads, Floodlight, Meta/Facebook Pixel, LinkedIn Insight,
TikTok Pixel, Hotjar, Microsoft Clarity, Pinterest Tag, Snapchat Pixel).

Google's loaders register each tag ID they load as a key of `window.google_tag_manager`, and
plain gtag.js defines that object too, so the object alone does not mean a GTM container.
Google Tag Manager is detected only from a `GTM-` key, or from a loader script whose URL has
`id=GTM-` on any host or path (server-side tagging and the Google tag gateway serve it from
the site's own domain). The same goes for the other Google tags: gtag.js loads one tag ID per
URL (`gtag/js?id=TAG_ID`, [Install the Google tag][install]), so a loader is classified by that
ID, not by its path (#30). Google Analytics 4 is detected from a `G-` key or an `id=G-` loader,
Google Ads from an `AW-` key or an `id=AW-` loader (as well as `googleadservices.com` /
`googlesyndication.com` scripts), and Floodlight from a `DC-` key or an `id=DC-` loader. A
Google Ads-only install (`gtag/js?id=AW-…`) is Google Ads only. A `GT-` loader alone is no tag:
a `GT-` Google tag can route to several products ([Tag Manager Help 12326985][gt-ids]), and
whatever it runs registers its own `G-` / `AW-` / `DC-` key or sends its own requests.
`G-` and `GT-` IDs are Google tags, not containers. Google does not document
`window.google_tag_manager`; the evidence is in
[research/gtag-vs-gtm-detection.md](research/gtag-vs-gtm-detection.md).

Each tag is mapped to the
consent types it needs and to the requests it sent (see the next section), then given a
verdict. Each tag finding says how many of its requests were sent while required consent was
denied:

| Tag | Consent types it needs |
|---|---|
| Google Analytics 4, Hotjar, Microsoft Clarity | `analytics_storage` |
| Google Ads, Floodlight | `ad_storage`, `ad_user_data`, `ad_personalization` |
| Meta Pixel, LinkedIn, TikTok, Pinterest, Snapchat | `ad_storage` |
| Google Tag Manager | none: a container, judged through the tags it runs |

| Verdict | Meaning |
|---|---|
| `VIOLATION` | At least one request the tag sent went out while a required consent type was `denied` at that moment, and was not a cookieless ping, even if consent was granted later |
| `COOKIELESS` | Every request the tag sent while a required type was `denied` was a [cookieless ping](#cookieless-pings-advanced-consent-mode) (advanced Consent Mode) |
| `BLOCKED` | A required consent type is `denied` now and the tag sent no request while it was denied |
| `FIRING` | None of its required consent types is `denied`, and requests were captured, all sent after consent |
| `IDLE` | None of its required consent types is `denied`, and no requests were captured yet |
| `CONTAINER` | Google Tag Manager on a page with a consent default. Not a check of its own |
| `NO CONSENT MODE` | The page has no consent default at all |

In the popup, `VIOLATION` is a broken finding, `COOKIELESS` a finding to review (`! REVIEW`),
`BLOCKED` and `FIRING` count as passed checks,
`IDLE` is not checked yet, `CONTAINER` is not shown as a finding, and `NO CONSENT MODE` is
reported inside the missing-default finding.

So the number of checks in the popup's verdict ("All 9 checks passed") depends on the page:
it is the eight validation rules plus one check per detected tag other than Google Tag
Manager (`buildFindings` in `popup/findings.js`). A page with GA4 as its only detected tag has
nine, and so does a page with a GTM container that runs GA4.

### Cookieless pings (advanced Consent Mode)

With advanced Consent Mode, Google's tags load before the visitor chooses and keep sending
while consent is denied: "While consent is denied, the Google tags send cookieless pings"
([Google Ads Help 10000067][ads-cm]). Google's [Consent mode overview][cm-params] says what
changes with each type denied: with `ad_storage` denied, no advertising cookies or device
identifiers are read or written and "Requests are sent through a different domain (e.g.
pagead2.googlesyndication.com)"; with `analytics_storage` denied, tags "won't read or write
first-party analytics cookies". Pings can carry the consent state, whether the URL had ad-click
information, and a "Random number generated on each page load". Full page URLs are still
collected, "including ad-click information in URL parameters (e.g., GCLID / DCLID)".

So a request a tag sent while a consent type it needs was `denied` is judged a **cookieless
ping** when all of these hold (#34):

| # | Condition | Why |
|---|---|---|
| 1 | Google Analytics 4, Google Ads or Floodlight sent it ([attribution](#which-tag-sent-a-request)) | They are the consent-aware Google tags. Other vendors have no Consent Mode, so their requests stay violations |
| 2 | The storage type the tag needs was denied: `analytics_storage` for GA4, `ad_storage` for Google Ads and Floodlight | Cookieless means storage denied. With `ad_storage` granted and only `ad_user_data` or `ad_personalization` denied, the request used cookies |
| 3 | The request's own consent signal says that storage type is denied (`gcs`, or a known `gcd` letter) | Consent state pings carry the consent state; `gcs` transmits `ad_storage` and `analytics_storage` ([Consent mode overview][cm-params]) |
| 4 | Its own signals claim no denied type as `granted` | A request that tells Google consent was granted is not a denied-consent ping |
| 5 | It carries no `auid`, `auiddc` or `gclaw` parameter | These carry Google's advertising cookie values (`_gcl_au`, `_gcl_aw`). Measured: gtag.js sends them only while `ad_storage` is granted |

Anything else sent while denied is a violation, and the request records why: no consent
signal, consent claimed as granted, storage granted, a cookie ID, or (other vendors) no
Consent Mode. A tag whose requests while denied were all cookieless pings is `COOKIELESS`, a
`! REVIEW` finding: correct for advanced Consent Mode, and still visible for anyone whose
privacy policy counts any request before consent. One violation makes the tag `VIOLATION`; its
finding also counts the cookieless pings. The side panel's Requests view marks each request
sent while denied as "! Cookieless ping" or "× Sent while … was denied", with the reason.

Measured with Google's real gtag.js in Playwright Chromium 151 (October 2026), in one browser
profile that already had `_ga`, `_gcl_au` and `_gcl_aw` cookies from a granted visit:

| Consent | Google Ads / Floodlight request | GA4 request |
|---|---|---|
| granted | `www.google.com/ccm/collect?…&auid=<_gcl_au>&gclaw=<_gcl_aw>`, `ad.doubleclick.net/activity;…;auiddc=<_gcl_au>;…` | `cid` = the `_ga` client ID |
| denied | `pagead2.googlesyndication.com/ccm/collect?…&gcs=G101&rnd=<random>`, no `auid` / `gclaw` | `cid` new on every page load, not the `_ga` value; `gcs=G100` |

ConsentFlow does not see request headers and does not read cookies, so it cannot compare a
GA4 `cid` with `_ga`. For GA4 it relies on the request's own `gcs` and the measured behaviour
above. `gclid` / `dclid` from the page URL do not count as cookie IDs, since Google sends full
URLs while `ad_storage` is denied.

[ads-cm]: https://support.google.com/google-ads/answer/10000067

### Which tag sent a request

Google's tags share hosts: Google's [CSP guide][csp] lists `www.google.com` and
`pagead2.googlesyndication.com` for Google Analytics, Google Ads and Floodlight alike, and the
GA4 + Ads page in `tests/fixtures/gtag-vs-gtm.html` sends both tags' hits to
`pagead2.googlesyndication.com`. So a host says which vendor a request went to, not which tag
sent it. Each captured request is attributed to one tag from the request itself, in this
order, and judged only against that tag's consent types (#28):

| # | Request | Tag | Tag ID | Source |
|---|---|---|---|---|
| 1 | `gtm.js?id=GTM-…` or `gtag/js?id=G-…/AW-…/DC-…` on a Google host | the loaded tag, as a **loader** | the `id` | [Install the Google tag][install], GTM snippet ([Tag Manager Help 14847097][gtm-snippet]) |
| 2 | any other `googletagmanager.com` request (`/a?id=…`, `/td`) | not attributed | | Google tag diagnostics ([Tag Manager Help 9323295][gtm-privacy]: GTM "may collect some aggregated data about tag firing") |
| 3 | `tid=G-…` | Google Analytics 4 | the `tid` | measured: GA4's `/g/collect` |
| 3 | `tid=AW-…` | Google Ads | the `tid` | measured: `/ccm/collect` on `www.google.com` and `pagead2.googlesyndication.com` |
| 3 | `tid=DC-…` | Floodlight | the `tid` | measured: `/ccm/collect` |
| 3 | `tid=GT-…` or any other `tid` | not attributed | | A `GT-` Google tag can route to several products ([Tag Manager Help 12326985][gt-ids]) |
| 4 | `/pagead/conversion/<n>/`, `/pagead/viewthroughconversion/<n>/`, `/pagead/1p-conversion/<n>/`, `/pagead/1p-user-list/<n>/`, `/rmkt/collect/<n>/` | Google Ads | `AW-<n>` | `send_to: 'AW-CONVERSION_ID/CONVERSION_LABEL'` ([Google Ads Help 7548399][ads-send-to]); paths measured |
| 5 | `/activity;…src=<n>;…` (`ad.doubleclick.net`, `*.fls.doubleclick.net/activityi;`), `/ddm/…src=<n>;…` (`ade.googlesyndication.com`, `adservice.google.com`) | Floodlight | `DC-<n>` | "The value of the `src=` key is the advertiser ID", conversion URL is what follows `ad.doubleclick.net/activity;` ([Campaign Manager 360 Help 2824087][fl-url]); hosts from the [CSP guide][csp] |
| 6 | `/g/collect` on any host, or any request to `google-analytics.com` / `analytics.google.com` | Google Analytics 4 | the `tid`, if any | GA4 paths `/g/collect` ([server-side GA4 setup][sst-ga4]); those hosts are listed only for Google Analytics in the [CSP guide][csp] |
| 7 | anything else to a Google host, such as `ad.doubleclick.net/ccm/s/collect` (no `tid`) | not attributed | | |
| — | non-Google vendors (`facebook.com/tr`, `snap.licdn.com`, …) | that vendor's one tag | | one tag per vendor |

"Measured" means observed from Google's real gtag.js (`gtag/js?id=G-FIXTURE123`, `AW-123456789`,
`DC-1234567`, placeholder IDs) in Playwright Chromium 151, October 2026, with ads denied and
with everything granted. A GTM container's GA4 tag was observed sending the same
`/g/collect?tid=G-…` hits (blog.google, container `GTM-TRV24V`). Google does not document
`tid` or the `/ccm/collect` endpoint, so rows 3 and 7 are observed behaviour.

What follows from the table:

- **The GTM container needs no consent of its own.** Loading `gtm.js` collects nothing
  ([Tag Manager Help 9323295][gtm-privacy]: GTM "does not collect, retain, or share any
  information about visitors"). The tags inside it send their own requests, which rows 3–6
  attribute to GA4, Google Ads or Floodlight. So a GA4 hit on a GTM page is judged against
  `analytics_storage` only, and Google Tag Manager's verdict is `CONTAINER`.
- **Loader requests are listed, never judged.** Loading a tag's script is not measurement, and
  the browser loads it as a `<script>`, which is not captured anyway.
- **A tag that sent attributed requests is detected,** even if no loader or
  `google_tag_manager` key showed it. A GTM container sends GA4, Ads and Floodlight hits
  without necessarily loading gtag.js ([Tag Manager Help 17079602][gtm-direct]).
- **Requests that can't be attributed** are shown in the side panel's Requests view as
  "Not tied to a tag", with the reason, and change no verdict. A request with no tag ID on an
  endpoint several tags share (row 7) could belong to any of them; blaming one would repeat the
  bug this rule fixes. In the measurement, the only such request was
  `ad.doubleclick.net/ccm/s/collect`, sent by the Ads and Floodlight tags only when
  `ad_storage` was granted.
- Attribution is per tag type, not per ID: two GA4 IDs on one page are both judged as
  Google Analytics 4.
- GA4 requests with Google signals or advertising features (`stats.g.doubleclick.net/g/collect?tid=G-…`)
  are judged as GA4, against `analytics_storage` only.

[csp]: https://developers.google.com/tag-platform/security/guides/csp
[install]: https://developers.google.com/tag-platform/gtagjs/install
[gtm-snippet]: https://support.google.com/tagmanager/answer/14847097
[gtm-privacy]: https://support.google.com/tagmanager/answer/9323295
[gt-ids]: https://support.google.com/tagmanager/answer/12326985
[ads-send-to]: https://support.google.com/google-ads/answer/7548399
[fl-url]: https://support.google.com/campaignmanager/answer/2824087
[sst-ga4]: https://developers.google.com/tag-platform/learn/sst-fundamentals/5-sst-setup-analytics
[gtm-direct]: https://support.google.com/tagmanager/answer/17079602

## Consent management platforms

Cookiebot, OneTrust, IAB TCF (`__tcfapi`), CookieYes,
CookieConsent, Osano, Klaro and Cookie Information by their globals, plus Usercentrics and
iubenda by script URL.
