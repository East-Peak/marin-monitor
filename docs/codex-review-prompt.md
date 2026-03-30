# Marin Monitor Code Review & Audit Prompt

Use this prompt with Codex or another code review agent. Copy everything below the line.

---

## Code Review & Audit: Marin Monitor

You are reviewing the Marin Monitor project, a SvelteKit 2 + Svelte 5 + TypeScript local dashboard for Marin County, California. The codebase is at the root of this repository.

### Background

A large batch of features was recently added in a single intensive session. 8 new "index" panels were built (cappuccino prices, grocery basket, wine index, school tuition, fitness drop-in, vehicle registrations, and a composite "Cost of Being Marin" index), along with map layers, GitHub Actions scraper workflows, a residential IP proxy, observability infrastructure, and event parser improvements. The work was done rapidly by subagents executing plans — some code may have inconsistencies, dead code, or patterns that diverged from the established codebase conventions.

### What to Review

**Read these files first for context:**
- `CLAUDE.md` — project conventions, architecture, design constraints
- `docs/marin-indices.md` — the full spec for the indices feature
- `docs/maintenance-manifest.md` — hardcoded values inventory

**Then audit these areas:**

#### 1. Code Quality & Consistency
- Do the new panels (`src/lib/components/panels/CappuccinoPanel.svelte`, `GroceryBasketPanel.svelte`, `WineIndexPanel.svelte`, `SchoolTuitionPanel.svelte`, `FitnessPanel.svelte`, `DrivewayPanel.svelte`, `CompositePanel.svelte`) follow the same patterns as the pre-existing panels (`GasPricesPanel.svelte`, `HousingPanel.svelte`)?
- Are Svelte 5 runes used correctly everywhere? No Svelte 4 patterns (`export let`, `$:` reactive statements, `$$restProps`)?
- Are there any TypeScript `any` types that should be properly typed?
- Is error handling consistent across all scrapers and cron jobs?
- Are there duplicated utility functions that should be consolidated?

#### 2. Architecture & Patterns
- Do the new types (`src/lib/types/coffee.ts`, `grocery.ts`, `wine.ts`, `school.ts`, `fitness.ts`, `driveway.ts`, `composite.ts`) follow a consistent shape? Could they share a common base interface?
- Are the stores (`src/lib/stores/cappuccino.ts`, `grocery-basket.ts`, `wine-index.ts`, etc.) all structured the same way?
- Is the `SignalDeck.svelte` component getting too large? Should panels be loaded more dynamically?
- Are the map layer additions in `MapDataLayer.svelte` and `MapControls.svelte` clean, or is the file getting unwieldy?

#### 3. Scraper Robustness
- Check `src/lib/server/scrapers/cappuccino.ts` — does the `@sparticuz/chromium` + puppeteer-core approach look correct for Vercel serverless? (Note: this scraper actually runs via GitHub Actions now, not Vercel)
- Check `src/lib/server/scrapers/grocery-basket.ts` — is the Instacart HTML parser robust?
- Check `src/lib/server/scrapers/wine-index.ts` — does the Shopify API pagination look correct?
- Check `src/lib/server/scrapers/composite.ts` — is the blob-reading and aggregation logic sound?
- Check `src/lib/server/scrapers/activity.ts` — recent parser additions for Pacifics baseball, Marin Rowing, NorCal MTB, B-17 Racing, Dipsea race

#### 4. Standalone Scripts (GitHub Actions)
- Review `scripts/sync-cappuccino.mjs`, `sync-wine-index.mjs`, `sync-grocery-basket.mjs`, `sync-camp-prices.mjs`, `sync-ikon-pass.mjs`, `sync-dog-walker.mjs`, `sync-rivian-lease.mjs`
- Do they duplicate logic from `src/lib/server/scrapers/`? Should they share code?
- Is the `proxyFetch` helper duplicated across scripts? Should it be a shared module?
- Are blob read/write patterns consistent across all scripts?
- Error handling: do all scripts fail gracefully?

#### 5. Configuration
- `src/lib/config/coffee.ts` — 12 coffee shops with coordinates. Are coordinates accurate?
- `src/lib/config/fitness.ts` — 16 fitness studios. Same question.
- `src/lib/config/schools.ts` — 7 schools with tuition data
- `src/lib/config/composite.ts` — tier weights, baselines, static items
- `src/lib/config/panels.ts` — panel registration and ordering
- `vercel.json` — cron schedules. Are there any conflicts or missing entries?

#### 6. Testing
- Run `npx vitest run` and report results
- Are the new tests adequate? Check test files in `src/lib/config/` and `src/lib/server/scrapers/`
- Are there any panels or stores with zero test coverage?
- Are scraper edge cases tested (empty responses, malformed HTML, null prices)?

#### 7. Performance & Bundle Size
- Did adding `@sparticuz/chromium` and `puppeteer-core` significantly increase the bundle?
- Are these dependencies needed at build time or only in the GitHub Actions scripts?
- Should they be devDependencies instead of dependencies?
- Are there any large imports that could be lazy-loaded?

#### 8. Security
- Are any API keys, tokens, or secrets hardcoded? (Check for BLOB_READ_WRITE_TOKEN, CRON_SECRET, PROXY_SECRET, TAILSCALE_AUTHKEY in source)
- Is the scrape proxy (`scripts/scrape-proxy.mjs`) properly authenticated?
- Do the cron endpoints properly verify auth via `verifyCronAuth`?
- Is the health endpoint (`/api/health`) appropriately public vs. private?

#### 9. Dead Code & Cleanup
- Are there any unused imports, functions, or files?
- The `extractCappuccinoPrice` function in the server scraper — is it still used, or was it replaced by `extractPriceFromState`?
- Are there any TODO comments that should be addressed?
- Any stale config entries for businesses that have closed?

#### 10. Documentation
- Does `CLAUDE.md` need updating with the new panel types, map layers, or cron jobs?
- Are the inline code comments accurate and helpful?
- Is `docs/marin-indices.md` consistent with what was actually built?

### Output Format

For each area, provide:
1. **Issues found** (with file path and line numbers)
2. **Severity** (critical / important / minor / suggestion)
3. **Recommended fix** (specific, actionable)

Group by severity. Lead with critical issues that could cause runtime errors or security problems. End with suggestions for code cleanliness.

Also provide an overall assessment: is the codebase in good shape, or does it need a focused refactoring pass before adding more features?
