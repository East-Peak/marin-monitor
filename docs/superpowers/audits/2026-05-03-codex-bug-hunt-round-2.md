---
title: Marin Monitor — Codex Adversarial Bug-Hunt (Round 2)
type: audit
date: 2026-05-03
auditor: Codex (gpt-5.4, xhigh reasoning)
status: triage
scope: Adversarial review of the round-1 silent-failure cluster remediation
prior_round: 2026-05-03-codex-bug-hunt.md
---

# Marin Monitor — Codex Adversarial Bug-Hunt (Round 2)

Round-2 review of the round-1 remediations. All 10 round-1 findings were closed by 2026-05-03; this pass critiques the new design for what was missed. Codex returned 10 items: 5 BLOCK, 4 FIX, 1 NICE.

## Theme

The round-1 fix went all-in on the TV wallboard but stopped at that boundary. The same silent-failure modes still exist on the main dashboard and inside `loadAllNews`. Plus the redesign introduced new latent issues: schema-malformed bodies in SeeClickFix still return `[]`; HALF_OPEN concurrency leaks; fallback provenance is lost across the API/client boundary; and Strava routes weren't migrated.

## Punch list

### BLOCK — silent-failure modes still present after round 1

1. **Dashboard panels still use silent `createDataFetcher`.** `src/lib/api/marin/data-fetcher.ts:48-57`, `src/lib/components/panels/CompositePanel.svelte:116-123`, `src/lib/components/panels/HousingPanel.svelte:289-315`. After the server-side honesty rewrite, the dashboard still collapses 503s into `null`/`[]` via the silent path; `HousingPanel.error` is wired to unrelated news errors. The fix moved the TV but left the dashboard exhibiting the original "looks healthy when broken" pattern. **Fix:** migrate non-TV panels to `*WithStatus` fetchers; surface real fetch errors in `Panel.error` or a degraded badge.

2. **`loadAllNews()` flattens rejections to `[]`.** `src/lib/api/marin/load-all.ts:43-71`, `src/routes/+page.svelte:115-123`. `Promise.allSettled` results are mapped through `r.status === 'fulfilled' ? r.value : []` and the dashboard's `handleRefresh` calls `refresh.endRefresh()` with no errors regardless. Refresh history still records "success" while news/supplemental sources are down. **Fix:** thread per-adapter status out of `loadAllNews`; pass to `refresh.endRefresh(errors)` from the dashboard the way TV now does.

3. **TV preserve-on-failure has no visible degraded indicator.** `src/lib/components/tv/TvWallboard.svelte:431-543`, `src/lib/components/tv/TvWallboardHeader.svelte:17-49`, `src/lib/stores/tv.ts:311-320`. Errors are collected and recorded in refresh history, but nothing on screen tells operators that data is preserved-stale. The chyron's "All clear in Marin County" fallback can fire during outages. The remediation introduced a new silent mode: data is no longer wrong, but it's silently stale. **Fix:** visible degraded badge / "stale" pill driven by `refresh.refreshHistory[0].errors.length > 0`; suppress the "All clear" ticker fallback when the last refresh was degraded.

4. **`fetchSeeClickFixIssues` returns `[]` on malformed body.** `src/lib/api/marin/seeclickfix.ts:151-153`. After my throw-on-failure refactor I left an `if (!data.issues || !Array.isArray(data.issues)) return []` silent path. A schema break upstream → `seeClickFixSucceeded === true` → store rewritten with `[]` → looks like "quiet day" instead of preserving last good. **Fix:** throw on malformed shape; force the failure-preservation branch.

5. **`/api/health` doesn't monitor the 311 blob.** `src/routes/api/health/+server.ts:38-120`, `src/routes/api/cron/check-freshness/+server.ts:13-29`. `DATA_SOURCES` lists 14 blobs; `marin-311.json` isn't one of them. The blob can rot for days without health going degraded. **Fix:** add 311 to `DATA_SOURCES` with `expectedCadence: 'daily'`, `maxAgeDays: 1` (cron at `/api/cron/sync-311` runs every 4h).

### FIX — design gaps and second-order effects

6. **Fallback provenance is lost across the API/client boundary.** `src/routes/api/data/coffee/+server.ts:87-109`, `src/routes/api/data/housing/+server.ts:16-29`, `src/lib/api/marin/data-fetcher.ts:31-39`. I added `X-Data-Source: static-fallback` headers on three special endpoints — but `createDataFetcher` only reads the body, never the headers. Coffee's legacy path doesn't even add a marker. Status-aware callers can't distinguish live blob data from legacy/static fallback. **Fix:** promote source/fallback metadata into the typed result (e.g., `FetchResult<T> & { dataSource?: 'live' | 'static-fallback' | 'legacy' }`); emit consistently from special endpoints; surface in degraded UI.

7. **311 direct-rewrite happens AFTER the RSS-merge loop.** `src/lib/api/marin/load-all.ts:80-116`. My FIX-10 rewrite preserves 311 on failure, but it overwrites whatever the per-category RSS loop just wrote (which would include any RSS-311 items + supplemental 311 items merged in at line 81). Today there's no RSS feed for 311, so this is latent — but the moment one is added, RSS-311 items vanish. **Fix:** unify into a single rewrite that combines RSS + SeeClickFix + supplemental, OR gate the direct rewrite on absence of an RSS '311' result.

8. **HALF_OPEN concurrency leak + retry amplification.** `src/lib/services/circuit-breaker.ts:67-90`, `src/lib/services/client.ts:88-126`. `canRequest()` grants permission before `trackHalfOpenRequest()` reserves a slot, so concurrent callers each see "halfOpenRequests=0 < 1 = max" and all probe simultaneously. Plus each probe gets `retries+1` upstream hits. The "single recovery probe" invariant is broken under concurrency. **Fix:** make permit acquisition atomic (transition + counter increment in one call); skip retries when `_state === HALF_OPEN`.

9. **Strava routes still bypass `tryReadBlobText`.** `src/routes/api/data/strava-segments/+server.ts:12-31`, `src/routes/api/data/strava-leaderboard/[id]/+server.ts:16-55`, `src/lib/api/marin/strava.ts:9-42`. My migration covered 16 endpoints; these two slipped through (they have a slightly different shape — `strava-segments` and the dynamic `strava-leaderboard/[id]`). They still return 200 empty on blob failure, still call `head()` even when env var is missing. **Fix:** migrate to the shared helper; keep the existing `null`/`{}` shape on success but switch failures to 503.

### NICE — test gaps that hid the above

10. **Test suite pins simple paths but misses the regressed contracts.** `src/routes/api/data/data-endpoints.test.ts:27-31`, `src/lib/api/marin/load-all.test.ts:212-248`, `src/lib/api/marin/seeclickfix.test.ts:312-319`. Coverage exists for `serveBlobJson` happy-path and basic `loadAllNews` behavior, but: (a) no tests for the 4 special endpoints' fallback chains; (b) tests assert what `enrichItemsForRelevance` was called with, not the final 311 store contents (so the double-write at #7 doesn't surface); (c) no malformed-311-body test (#4). **Fix:** add coverage on each. Specifically the suite passing while #7 is broken is a smell.

## Triage decision

These are real, with one nuance: round 1's BLOCKs were "production lies"; round 2's BLOCKs are mostly "the lie still happens through a back door." Concrete:

- **#1, #2, #3** — same bug class as round 1 BLOCK-4, just in the dashboard / loadAllNews / TV-UI surfaces I didn't touch. These need the same fix shape (status-returning fetchers + error surfacing).
- **#4** — easy: one-line throw.
- **#5** — easy: add a `DATA_SOURCES` entry.
- **#6** — design-level: extend `FetchResult` with `dataSource` field; touches the type contract.
- **#7** — easy: gate the direct-rewrite on absence of RSS 311.
- **#8** — non-trivial: needs CircuitBreaker API rework + ServiceClient retry awareness.
- **#9** — straightforward migration, follows the same pattern.
- **#10** — test additions.

None block the public flip (already done) or affect privacy/security. They're all about whether the operational-state model is honest end-to-end.

## Round 3 (optional)

After landing #1–#5 and #7+#9, a round 3 would critique the new dashboard error UI + degraded indicator + 311 health monitoring. #6 (typed dataSource) and #8 (CircuitBreaker concurrency) are bigger architectural changes that should each get a focused critique before / after.
