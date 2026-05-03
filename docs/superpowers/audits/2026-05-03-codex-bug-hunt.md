---
title: Marin Monitor — Codex Adversarial Bug-Hunt (Round 1)
type: audit
date: 2026-05-03
auditor: Codex (gpt-5.4, xhigh reasoning)
status: triage
scope: Pre-public-release whole-repo bug review
---

# Marin Monitor — Codex Adversarial Bug-Hunt (Round 1)

Whole-repo correctness review run as part of pre-public-release prep. Sister doc: `2026-05-03-public-readiness.md` (privacy/ToS audit). Codex was instructed to skip the ToS angle (already accepted by Stuart re: Strava + Tailscale-proxy workflows).

Codex returned 10 items rather than padding to the 15 cap, with the explicit note that it found fewer than the cap of real issues.

## Theme

The findings cluster strongly around **silent-failure modes** — places where the app *looks* healthy when an upstream is broken. None are security, privacy, or embarrassment-on-public-README issues. All are operational correctness. None block flipping the repo public.

## Punch list

### BLOCK — wallboard / dashboard can look healthy when it isn't

1. **Wrong-town weather + race on town switch.** `src/routes/+page.server.ts:15`, `src/routes/+page.svelte:135`, `src/lib/components/panels/ConditionsPanel.svelte:25`. Bootstrap is always Central Marin; later location fetches are ungated. Persisted-town users see Central Marin for minutes; slow old responses can overwrite newer town selections. **Fix:** re-fetch on hydrated-location mismatch; abort/request-id guard so only newest response commits.

2. **Blob-backed `/api/data/*` routes return `200 OK` empty on failure.** `src/routes/api/data/{cappuccino,driveway,grocery-basket}/+server.ts`. Missing blob or bad env var → blank panel ("Marin has no data") instead of an outage signal. **Fix:** return 503/404 with structured error; client renders explicit degraded-state card.

3. **Freshness pipeline conflates upload time with successful scrape time.** `src/lib/server/blob-freshness.ts:42`, `src/lib/server/scrapers/{grocery-basket.ts:457,fitness.ts:33,school-tuition.ts:39}`. Fallback datasets can be reported "fresh" even though no live scrape succeeded; `/api/health` lies. **Fix:** when `preferContent` is on, never substitute `uploadedAt` for missing `lastSuccessfulScrapeAt`; manual datasets get separate semantics.

4. **TV refresh swallows fetch failures.** `src/lib/components/tv/TvWallboard.svelte:373`. `.catch(() => null|[])` everywhere → `refresh.endRefresh()` records success during multi-hour outages while sections silently blank/stale. **Fix:** collect per-source failures; keep previous good data on error; mark refresh degraded if any batch source fails.

### FIX — internal correctness, no user-visible deception

5. **Auto-refresh reschedule reads pre-update store state.** `src/lib/stores/refresh.ts:149,287`. Toggle off can keep polling; toggle on can fail to start; interval changes keep old cadence. **Fix:** compute new values first → update state → reschedule from new values.

6. **Main dashboard has no `refreshInFlight` guard.** `src/routes/+page.svelte:99,174`. Visibility-change + auto-refresh + manual refresh can overlap → racey timestamps, slow-old-response overwrites fast-new-response. **Fix:** add the same in-flight gate TV mode uses.

7. **`staleWhileRevalidate` bypasses circuit breaker.** `src/lib/services/client.ts:78,262`. Stale-cache hit returns before breaker check; `revalidateInBackground()` calls `executeRequest()` directly. With upstream down, every stale hit hammers the failing service. **Fix:** `breaker.canRequest()` check before background revalidation; route through guarded request path.

8. **`CircuitBreaker.getState()` mutates state.** `src/lib/services/circuit-breaker.ts:126`. Calling `canRequest()` from inside `getState()` can transition OPEN → HALF_OPEN. Monitoring/debug reads consume the recovery window. **Fix:** make status reads pure; compute `canRequest`/`timeUntilRetry` from fields directly.

9. **`cache.invalidate(pattern)` ignores the pattern for localStorage.** `src/lib/services/cache.ts:215`. Any targeted clear becomes a full prefix flush → spike refetch traffic, mask debugging signals. **Fix:** persist unhashed key metadata for matching, or rename to `clear()` and add real targeted invalidation.

10. **311 category only rewrites on new SeeClickFix data.** `src/lib/api/marin/load-all.ts:97`, `src/lib/api/marin/seeclickfix.ts:138`. Fetch failure leaves stale 311 incidents pinned indefinitely; outage looks like ongoing fresh issues. **Fix:** always rewrite 311 store on refresh; carry explicit error/freshness state.

## Triage decision

None of these block the public-repo flip. They're a quality punch list for the deployed app, not a sensitivity gate. Recommend: **flip public now, work this list as a normal punch list across follow-up sessions.** The "Pre-Launch Quality" section of `BACKLOG.md` already exists — add these there.

## Round 2 (optional)

Codex's option-3 plan called for a second focused pass on the scariest area. The clear cluster is the **silent-failure family** (items 1–4 + 7 + 10). A round-2 prompt would target the freshness/outage/error-surfacing pipeline end-to-end — health check, blob-freshness, TV/dashboard refresh, ServiceClient stale-while-revalidate — and ask Codex to design a unified "operational-state" model rather than spot-fixing each leak.

Recommend running round 2 *after* fixing items 1–4 (which are the easiest to land fast), so round 2 critiques the new design rather than the gaps.
