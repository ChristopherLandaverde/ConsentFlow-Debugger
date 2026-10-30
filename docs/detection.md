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
  violation even if consent was granted later.

## GCS / GCD signals

For requests to Google endpoints (Google Analytics, Google Tag Manager,
Google Ads, DoubleClick, Google Syndication), the `gcs` parameter
(`G1<ad_storage><analytics_storage>`, `1` granted, `0` denied) is decoded into
`ad_storage` / `analytics_storage`, the `gcd` parameter into `ad_storage`,
`analytics_storage`, `ad_user_data` and `ad_personalization` with default/update source, and
`npa` into personalized / non-personalized. The tracking ID (`tid`) and GA4 event name (`en`)
are shown too.

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

Detects ten tags from page globals and script URLs (Google
Analytics 4, Google Tag Manager, Google Ads, Meta/Facebook Pixel, LinkedIn Insight, TikTok
Pixel, Hotjar, Microsoft Clarity, Pinterest Tag, Snapchat Pixel). Each tag is mapped to the
consent types it needs and to the requests captured for its vendor, then given a verdict. Each
tag finding says how many of its requests were sent while required consent was denied:

| Verdict | Meaning |
|---|---|
| `VIOLATION` | At least one request to the vendor was sent while a required consent type was `denied` at that moment, even if consent was granted later |
| `BLOCKED` | A required consent type is `denied` now and no request was sent while it was denied |
| `FIRING` | None of its required consent types is `denied`, and requests were captured, all sent after consent |
| `IDLE` | None of its required consent types is `denied`, and no requests were captured yet |
| `NO CONSENT MODE` | The page has no consent default at all |

In the popup, `VIOLATION` is a broken finding, `BLOCKED` and `FIRING` count as passed checks,
`IDLE` is not checked yet, and `NO CONSENT MODE` is reported inside the missing-default finding.

So the number of checks in the popup's verdict ("All 9 checks passed") depends on the page:
it is the eight validation rules plus one check per detected tag (`buildFindings` in
`popup/findings.js`). A page with GA4 as its only detected tag has nine.

## Consent management platforms

Cookiebot, OneTrust, IAB TCF (`__tcfapi`), CookieYes,
CookieConsent, Osano, Klaro and Cookie Information by their globals, plus Usercentrics and
iubenda by script URL.
