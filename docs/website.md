# ConsentFlow website

This repository also holds the public landing page for the extension. It is separate from
the extension itself: nothing in this document is loaded by Chrome when you install
ConsentFlow Debugger.

| File | Purpose |
|---|---|
| `index.html` | Landing page, deployed at <https://consentflow-psi.vercel.app> |
| `measurement-playground.js` | Script for the landing page's measurement test section |
| `assets/consentflow-measurement-checklist.pdf` | Real PDF used as the download target |
| `assets/measurement-form-result.html` | Target page for the native form test |

The landing page loads Google Tag Manager (`GTM-PCJ3Q5RK`). The extension does not.

## Website deployment

The production landing page is checked in as `index.html` and deployed through the Vercel
project `consentflow`. It preserves the public ConsentFlow page and installs Google Tag
Manager container `GTM-PCJ3Q5RK` in the standard script and noscript positions.

Use a preview before changing the production alias:

```bash
vercel deploy --yes --target preview
vercel curl https://<preview-url>
```

Confirm the preview contains `GTM-PCJ3Q5RK` and preserves the landing-page title and
navigation. Production promotion is an explicit operation:

```bash
vercel deploy --prod --yes
```

After promotion, verify `https://consentflow-psi.vercel.app` loads the container and that
the disposable `#workflow-smoke-form` behaves as follows:

- Native validation blocks empty and invalid email values without emitting an event.
- One valid submission reveals the success message and pushes exactly one
  `gtm_observability_smoke_success` event.
- The event contains only `form_id` and `form_name`; the entered value is never read or
  included in analytics.

Vercel credentials, `.vercel/`, and `.env*` files must remain uncommitted.

## Website measurement playground

The landing page includes a clearly labelled test section with natural browser targets for
GA4 enhanced measurement:

- Page load and SPA history page views
- 90% scroll depth
- Outbound link clicks
- Fixed-term site search
- YouTube video engagement with `enablejsapi=1`
- A real PDF download
- Native form start and submit using the fixed `measurement-test` token

The playground never calls `gtag` or pushes manual analytics events. It exists to prove the
connected GA4 configuration through browser collection requests. The separate workflow
smoke form retains its custom `gtm_observability_smoke_success` contract.

These contracts are checked by `tests/static-validation.test.mjs` (see the README's
testing section).
