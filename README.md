# ConsentFlow Debugger

**Debug GTM Consent Mode v2 in real time.**

[![Version](https://img.shields.io/badge/version-2.0.0-036461.svg)](https://github.com/ChristopherLandaverde/ConsentFlow-Debugger)
[![License](https://img.shields.io/badge/license-MIT-036461.svg)](LICENSE)
[![Website](https://img.shields.io/badge/website-consentflow-036461.svg)](https://consentflow-psi.vercel.app)

Free, open-source Chrome extension for developers, analysts, and compliance teams who need to debug and validate Google Tag Manager Consent Mode implementations. Detect race conditions, missing defaults, GCS/GCD mismatches, and tag firing violations before they cost you data and compliance.

**All processing runs entirely in your browser — no data ever leaves your machine.**

---

## Features

**Real-Time Consent Monitoring** — Watch consent state changes as they happen. See `analytics_storage`, `ad_storage`, and all consent types update live.

**Violation Detection** — Automatically catch tags firing without proper consent, missing default commands, and race conditions before they become compliance issues.

**GCS/GCD Signal Decoding** — Decode Google Consent Signals from network requests. See exactly what consent data Google is receiving.

**Consent Simulation** — Test different consent scenarios without touching real cookies. See before/after tag behavior instantly.

**18+ Validation Rules** — Automated checks catch implementation issues with pass/fail/warn results and actionable recommendations.

**Multi-Vendor Tag Impact** — Analyze tag behavior across GA4, Google Ads, Meta, LinkedIn, TikTok, Hotjar, Clarity, and more.

---

## Quick Start

1. **Download** — Clone or download this repository.
2. **Load the extension** — Open `chrome://extensions/`, enable Developer Mode, click "Load unpacked", and select this directory.
3. **Visit any page with GTM** — ConsentFlow automatically detects the container.
4. **Debug** — Click the extension icon to see consent state, tag violations, validation results, and GCS/GCD signals live.

---

## Who It's For

**Analytics Engineers** — Validate that your GTM consent implementation is firing correctly and not leaking data before consent is granted.

**Compliance & Legal Teams** — Verify that your site respects user consent choices and meets GDPR/ePrivacy requirements at the tag level.

**QA Teams** — Catch consent-related bugs before they reach production. Simulate scenarios and validate tag behavior systematically.

**Agency & Freelance Consultants** — Audit client implementations quickly. Export findings and deliver actionable consent reports.

---

## Supported Platforms

| Platform | Status |
|----------|--------|
| Google Tag Manager | Supported |
| Google Analytics 4 | Supported |
| Google Ads | Supported |
| Meta (Facebook) Pixel | Supported |
| LinkedIn Insight Tag | Supported |
| TikTok Pixel | Supported |
| Hotjar | Supported |
| Microsoft Clarity | Supported |
| Pinterest Tag | Supported |
| Snapchat Pixel | Supported |
| Cookiebot (CMP) | Supported |

## Browser Compatibility

- Chrome 88+
- Edge 88+
- Brave (Chromium-based)

---

## Privacy & Security

- **100% client-side** — No data collection, no external servers, no accounts.
- **Encrypted storage** — Sensitive debugging data encrypted using AES-256-GCM.
- **Content Security Policy** — Full CSP implementation with input validation.
- **Rate limited** — Protection against abuse and performance issues.

---

## Contributing

```bash
git clone https://github.com/ChristopherLandaverde/ConsentFlow-Debugger.git
cd ConsentFlow-Debugger

# Load in Chrome:
# 1. Open chrome://extensions/
# 2. Enable Developer Mode
# 3. Click "Load unpacked"
# 4. Select this directory
```

---

## License

MIT — see [LICENSE](LICENSE) for details.

Built by [Christopher Landaverde](https://focosys.io)

## Website deployment

The production landing page is checked in as `index.html` and deployed through the Vercel project `consentflow`. It preserves the public ConsentFlow page and installs Google Tag Manager container `GTM-PCJ3Q5RK` in the standard script and noscript positions.

Use a preview before changing the production alias:

```bash
vercel deploy --yes --target preview
vercel curl https://<preview-url>
```

Confirm the preview contains `GTM-PCJ3Q5RK` and preserves the landing-page title and navigation. Production promotion is an explicit operation:

```bash
vercel deploy --prod --yes
```

After promotion, verify `https://consentflow-psi.vercel.app` loads the container and that clicking Features sends a GA4 `navigation_click` event. Vercel credentials, `.vercel/`, and `.env*` files must remain uncommitted.
