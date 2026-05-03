---
title: Marin Monitor — Public-Release Readiness Audit
type: audit
date: 2026-05-03
auditor: Claude Code
status: draft
scope: Pre-public-launch sensitivity, ToS, and brag-worthiness review
---

# Marin Monitor — Public-Release Readiness Audit

Triage of findings before flipping `East-Peak/marin-monitor` (or a fork) to public visibility. Findings grouped by severity:

- **BLOCK** — must resolve before going public
- **FIX** — should resolve before going public; not a hard blocker
- **NICE** — quality-of-life polish for the brag piece
- **ACCEPT** — flagged but reasonable to ship as-is

---

## BLOCK — must resolve before going public

### B1. Strava scraper advertises a ToS violation

**File:** `src/lib/server/scrapers/strava-leaderboards.ts`, `src/lib/server/scrapers/strava-segments.ts`, plus `tests/fixtures/strava-*.html`

The repo openly scrapes Strava's public segment HTML with a custom `User-Agent: Mozilla/5.0 (compatible; MarinMonitor/1.0)`, parses leaderboards out of React props, and ships HTML fixtures captured from strava.com. Strava's ToS (Section 4) explicitly prohibits "scraping" and "automated extraction." Going public puts this behavior in front of Strava's anti-abuse team with the project name baked in.

**Options:**
1. **Recommended:** Remove Strava scraping entirely from the public repo. Strip the scraper, fixtures, KOM Tracker UI, the `src/lib/config/strava.ts` kill switch path, and the `STRAVA_*` env entries. Keep KOM Tracker as a private feature on the deployed site (data lives in env-gated cron output, not source) — or accept that KOM Tracker dies with the public release.
2. Replace with the official Strava API (OAuth) — but the API does not expose segment leaderboards, which was the point. Workspace doc confirms: "leaderboard scraping works unauthenticated."
3. Accept the risk and publish anyway. (Not recommended — Strava has gone after far smaller projects.)

### B2. GitHub Actions workflows publish a residential-IP scrape-proxy pipeline

**Files:** `.github/workflows/sync-cappuccino.yml`, `sync-coffee-index.yml`, `sync-dog-walker.yml`, `sync-grocery-basket.yml`, `sync-ikon-pass.yml` (5 of 7 workflows)

The workflows step through `tailscale/github-action` with `${{ secrets.TAILSCALE_AUTHKEY }}`, then run scrapers with `SCRAPE_PROXY_URL` / `SCRAPE_PROXY_SECRET` env vars. Commit message `fix(scrapers): add Tailscale proxy to Ikon Pass and dog walker workflows for residential IP routing` is in public history. The secrets themselves are GitHub-encrypted and won't leak — but the *workflow files* clearly document IP-evasion infrastructure and name the targets (Ikon Pass, dog walker rates, grocery, coffee shops, cappuccino vendors).

**Options:**
1. **Recommended:** Delete the five proxy-routed workflows from the public repo. Move Marin-Number-composite scraping out of CI — run it locally or on a private mirror; commit only the resulting JSON artifacts to the public repo. The dashboard still works; the harvest pipeline just isn't visible.
2. Keep workflows but rename/reframe so the residential-IP intent isn't named in commit history (revisionist; doesn't fix the existing commit `fix(scrapers): add Tailscale proxy ... for residential IP routing`).
3. `git filter-repo` the offending commits — but that rewrites public history before publication, which is reasonable here. Combine with #1 for a clean cut.

### B3. Strava's Mapbox publishable token in test fixtures

**Files:** `tests/fixtures/strava-dipsea.html:1310`, `tests/fixtures/strava-hawk-hill.html:1338`

`window._maps_api = "pk.eyJ1Ijoic3RyYXZhIi..."` — a Mapbox publishable token belonging to **Strava's** account (decoded JWT username = "strava"). It is technically already public on every strava.com segment page, so it is not a leak of *our* secret. But baking another copy into a public repo is impolite to Strava and will trigger every secret scanner that runs against the public mirror.

**Fix:** Sanitize the fixtures — replace the token with `pk.SANITIZED_FOR_PUBLIC_REPO` or similar. Tests should still pass because parsers don't validate the token.

If B1 (remove Strava entirely) is the chosen path, this resolves itself by deletion.

---

## FIX — should resolve before going public

### F1. README declares "Private project — East Peak Advisors, LLC."

**File:** `README.md:80-82`

Line 82: `Private project — East Peak Advisors, LLC.` This is the literal opposite of "public repo." Replace with an actual license section.

**Fix:** Add `LICENSE` file (recommend MIT — permissive, standard, no surprises) and replace the README License section with the standard one-liner pointing at it.

### F2. No `LICENSE` file

The repo has no `LICENSE` / `COPYING` file. GitHub's default for unlicensed public repos = "all rights reserved" = nobody can legally use any of it. Either license it (MIT preferred) or explicitly state "All rights reserved, source-available for inspection only."

### F3. Other commercial-site scrapers in `src/lib/server/scrapers/` and `scripts/`

**Files:** `wine-index.ts` (PlumpJack Shopify), `grocery-basket.ts` (Instacart), `school-tuition.ts` (private school sites), `coffee-index.shared.js` / `cappuccino.ts` (local shop sites), `fitness.ts` (yoga/pilates studios), `gas-prices.ts`, `housing.ts` (Redfin S3 public bucket), `driveway.ts` (data.ca.gov, public OK), plus `scripts/sync-*.mjs` (camp-prices, dog-walker, ikon-pass, rivian-lease).

Mixed bag:
- **Likely OK:** Redfin (uses their public S3 dump), data.ca.gov, openchargemap, NREL, Marin Open Data, town civic pages, NPS/NWS/NOAA/USGS/AirNow/511.
- **ToS-fragile:** Instacart, Ikon Pass, Rivian, dog-walker site (Rover?), camp-price aggregators, private-school admissions pages, gas-prices source (depending on whether it's GasBuddy or a public alternative).
- **Probably fine but worth checking:** PlumpJack Shopify (most Shopify storefronts allow product-API consumption), local coffee/fitness sites (low-volume, public menus).

**Fix:** For each scraper, decide: keep / remove from public / move to private cron (B2 path). The Marin Number composite is the most ToS-exposed cluster — it's also the most distinctive feature, so this is a real tradeoff.

### F4. Stuart's home-directory path leaks in tracked docs

12 tracked files contain `/Users/tammypais/...`:
- `HANDOFF.md` (line 4, 316)
- `docs/marin-indices.md` (line 743 — also exposes a LaunchAgent plist path: `/Users/tammypais/Library/LaunchAgents/com.marinmonitor.scrape-proxy.plist`)
- `docs/superpowers/plans/*.md` (10 plans, peppered throughout — mostly `cd /Users/tammypais/projects/marin-monitor && npm run ...`)

`tammypais` is just a local username, no privileged access from knowing it, but it's atypical to publish — and the plist path **explicitly names the scrape-proxy LaunchAgent**, reinforcing B2.

**Fix:** Sed/replace `/Users/tammypais/projects/marin-monitor` → `marin-monitor` (or just remove these paths from the prose since the cwd is implied). Remove the LaunchAgent path entirely.

### F5. `docs/marin-indices.md` references stuart@eastpeak.cc in operator notes

**File:** `docs/marin-indices.md:734`: `Daily freshness-check cron that emails stuart@eastpeak.cc when anything is stale or errored`

Stuart's email already appears intentionally in `Footer.svelte`, `FeedbackModal.svelte`, `CommunityPanel.svelte`, `ads.ts` (sponsor: East Peak Advisors). Those are user-facing contact info — fine, intentional. But the operator-internal note in `marin-indices.md` is different — it's documenting where alerts go. Move it out of public docs or generalize to "operator email."

### F6. `docs/superpowers/plans/*` and `docs/audit-remediation-2026-03-30.md` and `docs/security-posture-2026-03-30.md`

**Decision needed:** These are internal AI-assisted planning logs and past security audits. They show the build process — which can be a brag — but they also document past mistakes and the remediation path.

- **Plans dir** (10 files) — implementation plans with `cd /Users/tammypais/...` paths, occasional internal tone. Glamorous to a "look how I built this" reader; cluttered to a normal user.
- **`audit-remediation-2026-03-30.md`** — past Codex audit findings and how they were fixed. Could read as "look, I take security seriously" or as "here's the list of things that *were* wrong" depending on framing. (I have not read its full content; flagged for Stuart to review.)
- **`security-posture-2026-03-30.md`** — same caveat. Worth reading before deciding.

**Recommendation:** Keep the plans dir (it's a brag artifact for a public personal project), but sanitize the absolute paths (F4). For the two `*-2026-03-30.md` audit docs, read them and decide per-doc — if they enumerate known unfixed issues, exclude.

### F7. CLAUDE.md and AGENTS.md conflict + reveal internal coordination

**Files:** `CLAUDE.md:194` (workflow rules), `AGENTS.md`

- `CLAUDE.md`: "Work in feature branches, not main"
- `AGENTS.md`: "Branch strategy: push directly to main (no branches, no PRs)"
- Workspace caution-zones doc agrees with `AGENTS.md`. `CLAUDE.md` is stale.

`AGENTS.md` references `~/.openclaw/workspace/projects/marin-monitor.md` and `~/.codex/AGENTS.md` — paths that don't exist on a contributor's machine. Harmless (just dangling pointers) but reads as "this repo is part of a private agent-coordination system."

**Fix:** Reconcile the branch policy (delete the `CLAUDE.md` stale rule). Optional: in `AGENTS.md`, replace the workspace pointer with a brief inline note so contributors aren't confused by missing paths.

---

## NICE — brag-worthy polish

### N1. README data-source table is a flex; lean into it

The data-source table in README is genuinely impressive (26 RSS + 18 REST adapters + Mapbox + scrapers). Add architecture-diagram or at-a-glance count summary to the top so a casual visitor sees the scope without scrolling.

### N2. Architecture in CLAUDE.md > README

`CLAUDE.md` has the better architecture writeup (service layer, multi-stage refresh, verification levels, alert-keyword discipline). For a public repo, `CLAUDE.md` is an unusual filename — it telegraphs "AI-assisted." Two paths:
- Keep `CLAUDE.md` as-is (transparency about how it was built; a brag in 2026).
- Mirror or move the architecture content to `docs/architecture.md` and keep `CLAUDE.md` smaller.

### N3. Tests: 103 unit, 0 type errors, Codex-audited

Surface this in the README. Currently mentioned only in `CHANGELOG.md` and `BACKLOG.md`. Add a "Quality" badge row near the top.

### N4. Add a screenshot or short demo gif

Map dashboards demand a hero image. Screenshots of the main dashboard, TV mode, and the map with a layer toggled = instant brag.

### N5. The `marin-lately` satire layer + the Marin Number composite are the distinctive pieces

The dry "Cost of Being Marin" framing is the soul of the project. Lean into it in the README's intro paragraph. Currently buried in `docs/marin-indices.md`.

---

## ACCEPT — fine to ship as-is

- **Working tree dirty `.json` files** (`static/data/marin-activity.json`, `marin-police-logs.json`) — public event/police-log data; no PII. Just stale local scraper output. Either commit or revert before publishing.
- **East Peak Advisors / stuart@eastpeak.cc visible in footer, feedback modal, community panel, ads sponsor** — intentional contact info for a public site. Fine.
- **Marin Lately (satire) feed** — sourced from `marinlately.com/feed/`, third-party RSS. Project displays it labeled "satire" with dashed outlines and behind an "Enable Vibes" toggle. Punches at the broad "Marin lifestyle," not named individuals. (Risk shifts to the upstream marinlately.com author, not us.)
- **Town/county scrapers** (Belvedere, Mill Valley, Ross, Tiburon, Fairfax) — public civic pages, low-volume, polite scraping. Acceptable.
- **GitHub Actions security posture** — workflows pin all third-party action SHAs, set `permissions: contents: read`, use `persist-credentials: false`, and pass secrets only through `${{ secrets.* }}`. Well done. (Independent from B2's residential-IP issue — the security plumbing is correct.)
- **`.env` discipline** — `.gitignore` covers `.env`, `.env.*` (with `.env.example` allow-listed), `.strava-credentials.txt`, and `.vercel`. No real secrets ever committed (gitleaks + trufflehog history scan: clean modulo B3).

---

## Open question (not Claude's call)

**Org vs. personal repo.** Current remote is `East-Peak/marin-monitor` (East Peak Advisors org, presumably your sole-owner LLC). Workspace doc lists `tammy-pais/marin-monitor` (out of date or aspirational). "Make public" can mean:
1. Flip visibility on `East-Peak/marin-monitor` (publishes under the LLC).
2. Transfer or fork to a personal account (publishes under `tammy-pais` or `stuart-watson` or whatever).
3. Create a new public repo and push a sanitized branch (cleanest if you want B2/B3 history-rewrite without touching the private origin).

#3 is the cleanest if you go the `git filter-repo` route. #1 is the lowest-effort.

---

## Suggested resolution order

1. Decide B1 (Strava: remove vs. accept-and-ship).
2. Decide B2 (proxy workflows: delete vs. relocate vs. filter-repo).
3. Sanitize B3 fixtures (token replacement) — trivial.
4. F1/F2 (LICENSE + README) — trivial, do at end.
5. F4 (path sed across 12 files) — trivial.
6. F3 (per-scraper ToS judgment) — needs your call on the Marin Number cluster.
7. F5/F6/F7 — read & decide.
8. N1–N5 — polish pass after Codex review.
9. Pass to Codex (`/codex-review` × 2 — one on this audit doc, one on the repo).
10. `/ultrareview` (you trigger).

---

## Appendix: scan artifacts

- `/tmp/marin-audit/gitleaks.json` — 4 hits (2 false-positive 511 apiKey vars, 2 Strava Mapbox tokens in fixtures = B3)
- `/tmp/marin-audit/trufflehog-all.json` — 0 results on git history (excl. node_modules); 29 unverified noise hits in `node_modules/` only (Stripe test keys in stripe SDK, MongoDB docstring examples in zod tests)
- Tooling: `gitleaks 8.30.1`, `trufflehog 3.95.2` (installed via brew during this audit)
