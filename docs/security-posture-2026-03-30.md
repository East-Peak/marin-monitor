# Security Posture

Date: 2026-03-30
Status: active

## What Was Hardened

- Browser-facing write endpoints now require trusted same-origin browser context and JSON content types:
  - `src/routes/api/feedback/+server.ts`
  - `src/routes/api/ad-click/+server.ts`
- Browser-facing write endpoints now have lightweight abuse controls:
  - IP-based in-memory rate limiting
  - feedback honeypot field
  - redacted client identifiers in stored feedback/logging
- Secret comparisons moved to timing-safe checks:
  - `src/lib/server/cron-auth.ts`
  - `scripts/scrape-proxy.mjs`
- The scrape proxy is tighter:
  - no browser CORS preflight path
  - only `GET` and `HEAD` forwarding
  - request timeout clamped
  - dangerous forwarded headers stripped
  - authenticated responses marked `no-store`
- Response headers are stronger in `src/hooks.server.ts`:
  - `Strict-Transport-Security`
  - `Cross-Origin-Opener-Policy`
  - `Cross-Origin-Resource-Policy`
- GitHub Actions now run with narrower defaults:
  - `permissions: contents: read`
  - `actions/checkout` no longer persists credentials
  - shallow fetch only
  - proxy endpoint is configured by secret rather than a raw Tailscale IP in workflow YAML

## Current Strengths

- Cron routes fail closed on missing `CRON_SECRET` and now use timing-safe auth comparison.
- The residential scrape proxy is host-allowlisted and no longer exposes operational detail publicly.
- CSP is present in `svelte.config.js` and the app already sends baseline hardening headers.
- Public article proxying is restricted to a fixed allowlist of local-news domains.
- Browser-facing mutation routes are few, small, and now explicitly same-origin checked.
- GitHub Actions are mostly isolated single-purpose workflows with explicit secret injection rather than broad environment inheritance.

## Current Risks

### Medium

- The scrape proxy remains a sensitive bridge into residential-origin scraping.
  - File: `scripts/scrape-proxy.mjs`
  - Risk: if `PROXY_SECRET` leaks, the proxy is still externally reachable and can be abused within the allowlisted host set.

- Feedback and ad-click endpoints still have no durable rate limiting.
  - Files:
    - `src/routes/api/feedback/+server.ts`
    - `src/routes/api/ad-click/+server.ts`
  - Risk: nuisance spam, write amplification, and blob churn are still possible.

- Freshness and scraper-success metadata is improving but not fully standardized across the full scraper fleet.
  - Risk: monitoring can still be harder to reason about than it should be.

## Recommended Next Moves

### P0

- Pin all GitHub Actions to immutable commit SHAs.
- Move `SCRAPE_PROXY_URL` in workflows from a raw Tailscale IP to a named secret or internal DNS name.
- Evaluate whether the lightweight in-memory rate limiting is enough in practice.
  - If abuse appears, add durable edge or storage-backed rate limiting.
  - If abuse persists on feedback, add Turnstile/hCaptcha.

### P1

- Add a small security helper for consistent request logging and redaction rules.
- Standardize scraper metadata on `lastSuccessfulScrapeAt` across all write paths.
- Add automated tests for same-origin enforcement on mutation endpoints.

### P2

- Keep ad copy plain-text or sanitized-only if ad content ever leaves the repo-managed workflow.

## Notes

- The `/api/article` route returns raw third-party HTML, but it is currently consumed for excerpt extraction rather than directly rendered into the DOM.
- Build output still has non-security warnings around chunk size and optional dependencies; these are operational concerns, not immediate security issues.
