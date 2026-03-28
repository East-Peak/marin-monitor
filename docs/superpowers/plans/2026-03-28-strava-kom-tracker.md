# Strava KOM Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Strava segment leaderboard tracker to Marin Monitor with map polylines, a dedicated panel, TV chyron integration, and a TV carousel screen.

**Architecture:** Two data pipelines feed five UI surfaces. A weekly cron uses the Strava Explore API (OAuth) to build a segment catalog with polylines. A daily cron scrapes public segment pages (unauthenticated) for CR/QOM holders and partial leaderboards. Data flows through Vercel Blob (private) -> API routes -> client adapters, following the existing gas-prices/housing pattern exactly.

**Tech Stack:** SvelteKit 2, Svelte 5 runes, TypeScript, MapLibre GL, Vercel Blob, Vercel Cron, Vitest

**Spec:** `docs/superpowers/specs/2026-03-28-strava-kom-tracker-design.md`

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `src/lib/types/strava.ts` | All Strava type definitions |
| `src/lib/config/strava.ts` | Seed segment list, feature flag, constants |
| `src/lib/server/scrapers/strava-leaderboards.ts` | Parse public segment pages for CR/QOM + leaderboard |
| `src/lib/server/scrapers/strava-segments.ts` | Fetch segment catalog + polylines via Explore API |
| `src/lib/server/scrapers/strava-auth.ts` | OAuth token refresh helper |
| `src/routes/api/cron/sync-strava-segments/+server.ts` | Weekly cron: catalog refresh |
| `src/routes/api/cron/sync-strava-leaderboards/+server.ts` | Daily cron: leaderboard scrape |
| `src/routes/api/data/strava-segments/+server.ts` | Serve segment catalog from Blob |
| `src/routes/api/data/strava-leaderboard/[id]/+server.ts` | Serve per-segment leaderboard from Blob |
| `src/routes/api/data/strava-events/+server.ts` | Serve change events from Blob |
| `src/lib/api/marin/strava.ts` | Client-side data adapter |
| `src/lib/components/panels/LeaderboardsPanel.svelte` | Dedicated Wire Grid panel |
| `src/lib/components/panels/leaderboards/SegmentCard.svelte` | Expandable segment card |
| `src/lib/components/panels/leaderboards/RecentActivity.svelte` | Events feed tab |
| `src/lib/components/map/SegmentLayer.svelte` | Map polylines + pins + click popup |
| `src/lib/components/tv/screens/TvLeaderboardsScreen.svelte` | TV carousel screen |
| `src/lib/stores/strava.ts` | Reactive Strava data store |
| `static/data/strava-segments.json` | Static fallback (empty catalog) |
| `static/data/strava-events.json` | Static fallback (empty events) |
| `tests/fixtures/strava-hawk-hill.html` | Saved HTML fixture for parser tests |
| `tests/fixtures/strava-dipsea.html` | Saved HTML fixture for parser tests |

### Modified Files

| File | Change |
|------|--------|
| `src/lib/types/index.ts` | Re-export strava types |
| `src/lib/config/panels.ts` | Add `leaderboards` PanelId + config |
| `src/lib/config/tv.ts` | Add `leaderboards` screen + `KOM` ticker category |
| `src/lib/components/dashboard/WireGrid.svelte` | Add LeaderboardsPanel routing |
| `src/lib/components/map/MapControls.svelte` | Add Segments toggle |
| `src/lib/components/map/MapDataLayer.svelte` | Render segment polylines/pins |
| `src/lib/stores/tv.ts` | Add strava events to chyron ticker |
| `src/lib/stores/refresh.ts` | Add `strava` to tertiary stage |
| `vercel.json` | Add two cron entries |

---

## Task 1: Types + Config Foundation

**Files:**
- Create: `src/lib/types/strava.ts`
- Create: `src/lib/config/strava.ts`
- Modify: `src/lib/types/index.ts`
- Test: `src/lib/config/strava.test.ts`

- [ ] **Step 1: Write type definitions**

```typescript
// src/lib/types/strava.ts

/** Activity type for a segment */
export type StravaActivityType = 'ride' | 'run';

/** A segment in the curated catalog */
export interface StravaSegment {
	id: number;
	name: string;
	activityType: StravaActivityType;
	/** Encoded polyline string from Strava Explore API (null if not yet fetched) */
	polyline: string | null;
	/** Start coordinates [lat, lon] */
	startLatlng: [number, number];
	/** End coordinates [lat, lon] */
	endLatlng: [number, number];
	distance: number; // meters
	elevationGain: number; // meters
	avgGrade: number; // percent
	climbCategory: number; // 0 = uncategorized, 1-4 = Cat 4 to Cat 1, 5 = HC
	totalAttempts: number;
	totalAthletes: number;
}

/** CR/QOM record holder from React props */
export interface StravaRecordHolder {
	athleteId: number;
	athleteName: string;
	time: string; // e.g. "5:17"
	date: string; // e.g. "Sep 23, 2025"
	effortId: number;
	activityId: number;
}

/** A visible leaderboard row from the HTML table */
export interface StravaLeaderboardRow {
	rank: number;
	athleteName: string;
	time: string;
	speed: string | null; // km/h for rides, pace for runs
	power: string | null; // watts, cycling only
	vam: string | null;
	activityId: number; // extracted from time link href
}

/** Full leaderboard data for one segment */
export interface StravaLeaderboard {
	segmentId: number;
	segmentName: string;
	cr: StravaRecordHolder | null; // overall/men CR
	qom: StravaRecordHolder | null; // women's CR
	rows: StravaLeaderboardRow[]; // visible rows (~7, non-contiguous ranks)
	totalAttempts: number;
	totalAthletes: number;
	scrapedAt: string; // ISO timestamp
}

/** Change event generated by diff */
export interface StravaEvent {
	type: 'new_kom' | 'new_qom';
	segmentId: number;
	segmentName: string;
	athlete: string;
	time: string;
	effortId: number;
	activityId: number;
	previous: {
		athlete: string;
		time: string;
		effortId: number;
	} | null;
	detectedAt: string; // ISO timestamp
}

/** Top-level Blob shapes */
export interface StravaSegmentCatalog {
	segments: StravaSegment[];
	lastUpdated: string;
}

export interface StravaEventLog {
	events: StravaEvent[];
	lastUpdated: string;
}

/** Seed segment config entry (hand-curated) */
export interface StravaSeedSegment {
	id: number;
	name: string;
	activityType: StravaActivityType;
	startLatlng: [number, number];
}
```

- [ ] **Step 2: Write seed segment config**

```typescript
// src/lib/config/strava.ts

import type { StravaSeedSegment } from '$lib/types/strava';

/** Feature flag — set to false to disable all Strava scraping and hide UI */
export const STRAVA_ENABLED = true;

/** Blob storage keys */
export const STRAVA_SEGMENTS_BLOB = 'strava-segments.json';
export const STRAVA_EVENTS_BLOB = 'strava-events.json';
export function stravaLeaderboardBlob(segmentId: number): string {
	return `strava-leaderboard-${segmentId}.json`;
}

/** Max age for events before pruning (30 days) */
export const STRAVA_EVENT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/** Max age for chyron display (48 hours) */
export const STRAVA_CHYRON_MAX_AGE_MS = 48 * 60 * 60 * 1000;

/** Explore API bounding boxes to tile Marin County */
export const MARIN_BOUNDING_BOXES: [number, number, number, number][] = [
	// [south_lat, west_lon, north_lat, east_lon]
	[37.830, -122.750, 37.940, -122.480], // Southern Marin (Sausalito, Mill Valley, Tam)
	[37.920, -122.680, 38.020, -122.450], // Central Marin (San Rafael, Larkspur, Corte Madera)
	[38.000, -122.700, 38.080, -122.450], // Northern Marin (Novato, Petaluma border)
	[37.880, -122.800, 37.980, -122.620], // West Marin coast (Stinson, Bolinas, Pt Reyes Station)
	[37.960, -122.800, 38.080, -122.620], // Northwest (Inverness, Tomales)
];

/**
 * Hand-curated seed segments. Explore API supplements but does not replace this list.
 * Start coordinates used as pin fallback when polyline is unavailable.
 */
export const SEED_SEGMENTS: StravaSeedSegment[] = [
	// === CYCLING ===
	{ id: 229781, name: 'Hawk Hill', activityType: 'ride', startLatlng: [37.8324, -122.4990] },
	{ id: 678363, name: 'Mt. Tam via Alpine Dam', activityType: 'ride', startLatlng: [37.9200, -122.5900] },
	{ id: 765125, name: 'Camino Alto', activityType: 'ride', startLatlng: [37.8900, -122.5280] },
	{ id: 582500, name: 'Paradise Dr (Clockwise)', activityType: 'ride', startLatlng: [37.8840, -122.4570] },
	{ id: 2312682, name: 'Bolinas-Fairfax Rd Climb', activityType: 'ride', startLatlng: [37.9380, -122.6200] },
	// TODO: Add more cycling segments during implementation — aim for 15-20 total
	// Candidates: Panoramic Hwy, Ridgecrest Blvd, Fairfax-Bolinas full, White's Hill,
	// Marshall Wall, Lucas Valley Rd, Paradise Loop (full)

	// === RUNNING ===
	{ id: 907022, name: 'Dipsea / Steep Ravine', activityType: 'run', startLatlng: [37.8990, -122.6360] },
	{ id: 15160205, name: 'Dipsea (Panoramic to Muir Woods)', activityType: 'run', startLatlng: [37.8830, -122.5810] },
	// TODO: Add more running segments — aim for 8-10 total
	// Candidates: Tennessee Valley Trail, Miwok Trail, Coastal Trail,
	// Matt Davis Trail, Old Railroad Grade (running)
];
```

- [ ] **Step 3: Re-export types from index**

Add to `src/lib/types/index.ts`:
```typescript
// At the end of the file, add:
export type {
	StravaActivityType,
	StravaSegment,
	StravaRecordHolder,
	StravaLeaderboardRow,
	StravaLeaderboard,
	StravaEvent,
	StravaSegmentCatalog,
	StravaEventLog,
	StravaSeedSegment
} from './strava';
```

- [ ] **Step 4: Write config test**

```typescript
// src/lib/config/strava.test.ts
import { describe, it, expect } from 'vitest';
import { SEED_SEGMENTS, MARIN_BOUNDING_BOXES, stravaLeaderboardBlob, STRAVA_ENABLED } from './strava';

describe('strava config', () => {
	it('has unique segment IDs in seed list', () => {
		const ids = SEED_SEGMENTS.map((s) => s.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('all seed segments have valid coordinates', () => {
		for (const seg of SEED_SEGMENTS) {
			expect(seg.startLatlng[0]).toBeGreaterThan(37);
			expect(seg.startLatlng[0]).toBeLessThan(39);
			expect(seg.startLatlng[1]).toBeGreaterThan(-123);
			expect(seg.startLatlng[1]).toBeLessThan(-122);
		}
	});

	it('all seed segments have valid activity types', () => {
		for (const seg of SEED_SEGMENTS) {
			expect(['ride', 'run']).toContain(seg.activityType);
		}
	});

	it('bounding boxes cover Marin latitude range', () => {
		const allSouth = MARIN_BOUNDING_BOXES.map((b) => b[0]);
		const allNorth = MARIN_BOUNDING_BOXES.map((b) => b[2]);
		expect(Math.min(...allSouth)).toBeLessThanOrEqual(37.84);
		expect(Math.max(...allNorth)).toBeGreaterThanOrEqual(38.07);
	});

	it('generates correct blob key', () => {
		expect(stravaLeaderboardBlob(229781)).toBe('strava-leaderboard-229781.json');
	});

	it('feature flag is enabled', () => {
		expect(STRAVA_ENABLED).toBe(true);
	});
});
```

- [ ] **Step 5: Run tests**

Run: `cd /Users/tammypais/projects/marin-monitor && npx vitest run src/lib/config/strava.test.ts`
Expected: All 6 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/types/strava.ts src/lib/config/strava.ts src/lib/types/index.ts src/lib/config/strava.test.ts
git commit -m "feat(strava): add types and seed segment config"
```

---

## Task 2: Public Page Parser (Leaderboard Scraper)

**Files:**
- Create: `src/lib/server/scrapers/strava-leaderboards.ts`
- Create: `tests/fixtures/strava-hawk-hill.html`
- Create: `tests/fixtures/strava-dipsea.html`
- Test: `src/lib/server/scrapers/strava-leaderboards.test.ts`

- [ ] **Step 1: Save HTML fixtures**

Fetch and save live Strava segment pages for testing:

```bash
cd /Users/tammypais/projects/marin-monitor
mkdir -p tests/fixtures
curl -s -o tests/fixtures/strava-hawk-hill.html "https://www.strava.com/segments/229781"
curl -s -o tests/fixtures/strava-dipsea.html "https://www.strava.com/segments/907022"
```

Verify both files are non-empty and contain `SegmentDetailsSideBar`.

- [ ] **Step 2: Write failing tests for the parser**

```typescript
// src/lib/server/scrapers/strava-leaderboards.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseSegmentPage, scrapeSegmentLeaderboard } from './strava-leaderboards';

const hawkHillHtml = readFileSync(join(__dirname, '../../../../tests/fixtures/strava-hawk-hill.html'), 'utf-8');
const dipseaHtml = readFileSync(join(__dirname, '../../../../tests/fixtures/strava-dipsea.html'), 'utf-8');

describe('parseSegmentPage', () => {
	it('extracts CR from Hawk Hill React props', () => {
		const result = parseSegmentPage(229781, hawkHillHtml);
		expect(result).not.toBeNull();
		expect(result!.cr).not.toBeNull();
		expect(result!.cr!.time).toBeTruthy();
		expect(result!.cr!.athleteId).toBeGreaterThan(0);
		expect(result!.cr!.effortId).toBeGreaterThan(0);
	});

	it('extracts QOM from Hawk Hill React props', () => {
		const result = parseSegmentPage(229781, hawkHillHtml);
		expect(result!.qom).not.toBeNull();
		expect(result!.qom!.time).toBeTruthy();
		expect(result!.qom!.athleteId).toBeGreaterThan(0);
	});

	it('extracts leaderboard rows from Hawk Hill HTML table', () => {
		const result = parseSegmentPage(229781, hawkHillHtml);
		expect(result!.rows.length).toBeGreaterThan(0);
		expect(result!.rows.length).toBeLessThanOrEqual(10);
		// Rows have non-contiguous ranks (privacy gaps)
		for (const row of result!.rows) {
			expect(row.rank).toBeGreaterThan(0);
			expect(row.athleteName).toBeTruthy();
			expect(row.time).toBeTruthy();
			expect(row.activityId).toBeGreaterThan(0);
		}
	});

	it('extracts attempt counts', () => {
		const result = parseSegmentPage(229781, hawkHillHtml);
		expect(result!.totalAttempts).toBeGreaterThan(900000);
		expect(result!.totalAthletes).toBeGreaterThan(70000);
	});

	it('parses running segment (Dipsea)', () => {
		const result = parseSegmentPage(907022, dipseaHtml);
		expect(result).not.toBeNull();
		expect(result!.cr).not.toBeNull();
		expect(result!.rows.length).toBeGreaterThan(0);
	});

	it('returns null for garbage HTML', () => {
		const result = parseSegmentPage(999, '<html><body>Not a segment page</body></html>');
		expect(result).toBeNull();
	});
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd /Users/tammypais/projects/marin-monitor && npx vitest run src/lib/server/scrapers/strava-leaderboards.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the parser**

```typescript
// src/lib/server/scrapers/strava-leaderboards.ts

import type { StravaLeaderboard, StravaRecordHolder, StravaLeaderboardRow } from '$lib/types/strava';

const SEGMENT_URL = 'https://www.strava.com/segments';

/**
 * Fetch and parse a public Strava segment page (unauthenticated).
 * Returns leaderboard data or null on failure.
 */
export async function scrapeSegmentLeaderboard(segmentId: number): Promise<StravaLeaderboard | null> {
	try {
		const response = await fetch(`${SEGMENT_URL}/${segmentId}`, {
			headers: {
				'User-Agent': 'Mozilla/5.0 (compatible; MarinMonitor/1.0)',
				'Accept': 'text/html'
			}
		});
		if (!response.ok) {
			console.warn(`[strava] Segment ${segmentId}: HTTP ${response.status}`);
			return null;
		}
		const html = await response.text();
		return parseSegmentPage(segmentId, html);
	} catch (err) {
		console.warn(`[strava] Segment ${segmentId} fetch failed:`, (err as Error).message);
		return null;
	}
}

/**
 * Parse Strava segment HTML for CR/QOM (React props) and leaderboard (HTML table).
 * Exported for testing with fixtures.
 */
export function parseSegmentPage(segmentId: number, html: string): StravaLeaderboard | null {
	// Extract React props from SegmentDetailsSideBar
	const propsMatch = html.match(/data-react-class="SegmentDetailsSideBar"[^>]*data-react-props="([^"]*)"/);
	if (!propsMatch) return null;

	let props: Record<string, unknown>;
	try {
		// Props are HTML-entity-encoded JSON
		const decoded = propsMatch[1]
			.replace(/&quot;/g, '"')
			.replace(/&amp;/g, '&')
			.replace(/&lt;/g, '<')
			.replace(/&gt;/g, '>')
			.replace(/&#39;/g, "'");
		props = JSON.parse(decoded);
	} catch {
		return null;
	}

	const fastestTimes = props.fastestTimes as Record<string, unknown> | undefined;

	const cr = parseRecordHolder(fastestTimes?.men ?? fastestTimes?.overall);
	const qom = parseRecordHolder(fastestTimes?.women);

	// Extract leaderboard rows from HTML table
	const rows = parseLeaderboardTable(html);

	// Extract attempt counts from stats text like "944,948 Attempts By 72,448 People"
	const attemptsMatch = html.match(/([\d,]+)\s*Attempts?\s*By\s*([\d,]+)\s*People/i);
	const totalAttempts = attemptsMatch ? parseInt(attemptsMatch[1].replace(/,/g, ''), 10) : 0;
	const totalAthletes = attemptsMatch ? parseInt(attemptsMatch[2].replace(/,/g, ''), 10) : 0;

	// Extract segment name from page title or heading
	const nameMatch = html.match(/<h1[^>]*class="[^"]*mb-0[^"]*"[^>]*>([^<]+)<\/h1>/)
		?? html.match(/<title>([^|<]+)/);
	const segmentName = nameMatch ? nameMatch[1].trim().replace(/ \| Strava.*/, '') : `Segment ${segmentId}`;

	return {
		segmentId,
		segmentName,
		cr,
		qom,
		rows,
		totalAttempts,
		totalAthletes,
		scrapedAt: new Date().toISOString()
	};
}

function parseRecordHolder(data: unknown): StravaRecordHolder | null {
	if (!data || typeof data !== 'object') return null;
	const d = data as Record<string, unknown>;

	const athleteId = typeof d.athlete_id === 'number' ? d.athlete_id : 0;
	const effortId = typeof d.segment_effort_id === 'number' ? d.segment_effort_id
		: typeof d.id === 'number' ? d.id : 0;
	const activityId = typeof d.activity_id === 'number' ? d.activity_id : 0;
	const athleteName = typeof d.athlete_name === 'string' ? d.athlete_name : '';
	const time = typeof d.elapsed_time === 'string' ? d.elapsed_time
		: typeof d.start_date === 'string' ? '' : '';
	const date = typeof d.start_date === 'string' ? d.start_date : '';

	if (!athleteId || !effortId) return null;

	return { athleteId, athleteName, time, date, effortId, activityId };
}

function parseLeaderboardTable(html: string): StravaLeaderboardRow[] {
	const rows: StravaLeaderboardRow[] = [];

	// Match the leaderboard table
	const tableMatch = html.match(/<table[^>]*class="[^"]*table-leaderboard[^"]*"[^>]*>([\s\S]*?)<\/table>/);
	if (!tableMatch) return rows;

	// Extract each data row (skip header)
	const rowRegex = /<tr(?:\s[^>]*)?>[\s\S]*?<\/tr>/g;
	const tableBody = tableMatch[1];
	let match;
	let isFirst = true;

	while ((match = rowRegex.exec(tableBody)) !== null) {
		if (isFirst) { isFirst = false; continue; } // skip header row

		const rowHtml = match[0];

		// Rank: first <td> with a number
		const rankMatch = rowHtml.match(/<td[^>]*>\s*(\d+)\s*<\/td>/);
		const rank = rankMatch ? parseInt(rankMatch[1], 10) : 0;

		// Athlete name: text content of the athlete cell
		const nameMatch = rowHtml.match(/<td[^>]*class="[^"]*athlete[^"]*"[^>]*>([\s\S]*?)<\/td>/);
		const athleteName = nameMatch
			? nameMatch[1].replace(/<[^>]+>/g, '').trim()
			: '';

		// Time + activity ID: <a href="/activities/12345">5:27</a>
		const timeMatch = rowHtml.match(/<a\s+href="\/activities\/(\d+)"[^>]*>([^<]+)<\/a>/);
		const activityId = timeMatch ? parseInt(timeMatch[1], 10) : 0;
		const time = timeMatch ? timeMatch[2].trim() : '';

		// Speed/pace, power, VAM from remaining <td> cells
		const tdValues = [...rowHtml.matchAll(/<td[^>]*>([^<]*)<\/td>/g)]
			.map((m) => m[1].trim())
			.filter((v) => v.length > 0);

		if (rank > 0 && athleteName && time && activityId) {
			rows.push({
				rank,
				athleteName,
				time,
				speed: tdValues.length > 2 ? tdValues[2] || null : null,
				power: tdValues.length > 3 ? tdValues[3] || null : null,
				vam: tdValues.length > 4 ? tdValues[4] || null : null,
				activityId
			});
		}
	}

	return rows;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd /Users/tammypais/projects/marin-monitor && npx vitest run src/lib/server/scrapers/strava-leaderboards.test.ts`
Expected: All tests pass. If any parser assertions fail against the live HTML fixtures, adjust the regex patterns to match the actual HTML structure.

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/scrapers/strava-leaderboards.ts src/lib/server/scrapers/strava-leaderboards.test.ts tests/fixtures/
git commit -m "feat(strava): add public page parser with HTML fixtures"
```

---

## Task 3: OAuth Helper + Explore API Client

**Files:**
- Create: `src/lib/server/scrapers/strava-auth.ts`
- Create: `src/lib/server/scrapers/strava-segments.ts`
- Test: `src/lib/server/scrapers/strava-segments.test.ts`

- [ ] **Step 1: Write OAuth token refresh helper**

```typescript
// src/lib/server/scrapers/strava-auth.ts

import { env } from '$env/dynamic/private';

interface TokenResponse {
	access_token: string;
	refresh_token: string;
	expires_at: number;
	token_type: string;
}

/**
 * Get a valid Strava access token, refreshing if expired.
 *
 * Env vars required:
 * - STRAVA_CLIENT_ID
 * - STRAVA_CLIENT_SECRET
 * - STRAVA_REFRESH_TOKEN
 *
 * Returns the access token string, or throws on failure.
 *
 * Note: If the refresh token rotates (Strava does this), the new refresh token
 * is logged. Stuart must update STRAVA_REFRESH_TOKEN in Vercel env vars manually.
 * A future improvement could persist to Blob.
 */
export async function getStravaAccessToken(): Promise<string> {
	const clientId = env.STRAVA_CLIENT_ID;
	const clientSecret = env.STRAVA_CLIENT_SECRET;
	const refreshToken = env.STRAVA_REFRESH_TOKEN;

	if (!clientId || !clientSecret || !refreshToken) {
		throw new Error('[strava-auth] Missing STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, or STRAVA_REFRESH_TOKEN');
	}

	const response = await fetch('https://www.strava.com/oauth/token', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			client_id: clientId,
			client_secret: clientSecret,
			grant_type: 'refresh_token',
			refresh_token: refreshToken
		})
	});

	if (!response.ok) {
		const body = await response.text();
		throw new Error(`[strava-auth] Token refresh failed: ${response.status} — ${body}`);
	}

	const data = (await response.json()) as TokenResponse;

	// Log if refresh token rotated (operator must update env var)
	if (data.refresh_token !== refreshToken) {
		console.warn(`[strava-auth] REFRESH TOKEN ROTATED. New token: ${data.refresh_token.slice(0, 8)}...`);
		console.warn('[strava-auth] Update STRAVA_REFRESH_TOKEN in Vercel dashboard.');
	}

	return data.access_token;
}
```

- [ ] **Step 2: Write Explore API client**

```typescript
// src/lib/server/scrapers/strava-segments.ts

import { getStravaAccessToken } from './strava-auth';
import { SEED_SEGMENTS, MARIN_BOUNDING_BOXES } from '$lib/config/strava';
import type { StravaSegment, StravaSegmentCatalog } from '$lib/types/strava';

const EXPLORE_URL = 'https://www.strava.com/api/v3/segments/explore';

interface ExploreResult {
	id: number;
	name: string;
	climb_category: number;
	avg_grade: number;
	elev_difference: number;
	distance: number;
	start_latlng: [number, number];
	end_latlng: [number, number];
	points: string; // encoded polyline
}

interface ExploreResponse {
	segments: ExploreResult[];
}

/**
 * Build the full segment catalog:
 * 1. Start with the hand-curated seed list
 * 2. Query Strava Explore API for polylines and supplemental segments
 * 3. Merge: seed segments get polylines from explore; new explore segments flagged
 */
export async function buildSegmentCatalog(
	existingCatalog: StravaSegmentCatalog | null
): Promise<StravaSegmentCatalog> {
	// Start with seed segments (primary source of truth)
	const segmentMap = new Map<number, StravaSegment>();

	for (const seed of SEED_SEGMENTS) {
		// Preserve existing polyline/stats if we already have them
		const existing = existingCatalog?.segments.find((s) => s.id === seed.id);
		segmentMap.set(seed.id, {
			id: seed.id,
			name: seed.name,
			activityType: seed.activityType,
			polyline: existing?.polyline ?? null,
			startLatlng: seed.startLatlng,
			endLatlng: existing?.endLatlng ?? seed.startLatlng,
			distance: existing?.distance ?? 0,
			elevationGain: existing?.elevationGain ?? 0,
			avgGrade: existing?.avgGrade ?? 0,
			climbCategory: existing?.climbCategory ?? 0,
			totalAttempts: existing?.totalAttempts ?? 0,
			totalAthletes: existing?.totalAthletes ?? 0
		});
	}

	// Try to enrich with Explore API (may fail if OAuth is not configured)
	try {
		const accessToken = await getStravaAccessToken();
		const explored = await exploreAllBoxes(accessToken);

		for (const result of explored) {
			if (segmentMap.has(result.id)) {
				// Enrich existing seed segment with polyline and stats
				const seg = segmentMap.get(result.id)!;
				seg.polyline = result.points || seg.polyline;
				seg.startLatlng = result.start_latlng;
				seg.endLatlng = result.end_latlng;
				seg.distance = result.distance;
				seg.elevationGain = result.elev_difference;
				seg.avgGrade = result.avg_grade;
				seg.climbCategory = result.climb_category;
			}
			// Non-seed segments from explore are logged but NOT auto-added
			// They require manual curation (add to SEED_SEGMENTS to include)
		}

		const nonSeedFound = explored.filter((r) => !segmentMap.has(r.id));
		if (nonSeedFound.length > 0) {
			console.log(`[strava-segments] Explore found ${nonSeedFound.length} non-seed segments:`);
			for (const s of nonSeedFound.slice(0, 10)) {
				console.log(`  - ${s.id}: ${s.name} (cat ${s.climb_category}, ${s.distance}m)`);
			}
		}
	} catch (err) {
		console.warn('[strava-segments] Explore API unavailable, using seed list only:', (err as Error).message);
	}

	return {
		segments: [...segmentMap.values()],
		lastUpdated: new Date().toISOString()
	};
}

async function exploreAllBoxes(accessToken: string): Promise<ExploreResult[]> {
	const allResults = new Map<number, ExploreResult>();

	for (const [south, west, north, east] of MARIN_BOUNDING_BOXES) {
		// Explore for both rides and runs
		for (const activityType of ['riding', 'running'] as const) {
			try {
				const url = new URL(EXPLORE_URL);
				url.searchParams.set('bounds', `${south},${west},${north},${east}`);
				url.searchParams.set('activity_type', activityType);

				const response = await fetch(url.toString(), {
					headers: { Authorization: `Bearer ${accessToken}` }
				});

				if (!response.ok) {
					if (response.status === 401) {
						throw new Error('Strava access token expired or revoked');
					}
					console.warn(`[strava-segments] Explore ${activityType} box failed: ${response.status}`);
					continue;
				}

				const data = (await response.json()) as ExploreResponse;
				for (const seg of data.segments) {
					allResults.set(seg.id, seg);
				}
			} catch (err) {
				if ((err as Error).message.includes('expired or revoked')) throw err;
				console.warn(`[strava-segments] Explore box failed:`, (err as Error).message);
			}
		}
	}

	return [...allResults.values()];
}
```

- [ ] **Step 3: Write tests for segment catalog builder**

```typescript
// src/lib/server/scrapers/strava-segments.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock env vars
vi.mock('$env/dynamic/private', () => ({
	env: {
		STRAVA_CLIENT_ID: '',
		STRAVA_CLIENT_SECRET: '',
		STRAVA_REFRESH_TOKEN: ''
	}
}));

// Must import AFTER mock setup
const { buildSegmentCatalog } = await import('./strava-segments');

describe('buildSegmentCatalog', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it('returns seed segments even when Explore API is unavailable', async () => {
		// No OAuth credentials = explore will fail gracefully
		const catalog = await buildSegmentCatalog(null);

		expect(catalog.segments.length).toBeGreaterThan(0);
		expect(catalog.lastUpdated).toBeTruthy();

		// Check Hawk Hill is present
		const hawkHill = catalog.segments.find((s) => s.id === 229781);
		expect(hawkHill).toBeDefined();
		expect(hawkHill!.name).toBe('Hawk Hill');
		expect(hawkHill!.activityType).toBe('ride');
	});

	it('preserves existing polylines when rebuilding', async () => {
		const existing = {
			segments: [{
				id: 229781,
				name: 'Hawk Hill',
				activityType: 'ride' as const,
				polyline: 'existing_encoded_polyline',
				startLatlng: [37.8324, -122.4990] as [number, number],
				endLatlng: [37.8300, -122.4970] as [number, number],
				distance: 2650,
				elevationGain: 156,
				avgGrade: 5.9,
				climbCategory: 4,
				totalAttempts: 944951,
				totalAthletes: 72448
			}],
			lastUpdated: '2026-03-27T00:00:00Z'
		};

		const catalog = await buildSegmentCatalog(existing);
		const hawkHill = catalog.segments.find((s) => s.id === 229781);
		expect(hawkHill!.polyline).toBe('existing_encoded_polyline');
		expect(hawkHill!.distance).toBe(2650);
	});

	it('all segments have valid IDs and activity types', async () => {
		const catalog = await buildSegmentCatalog(null);
		for (const seg of catalog.segments) {
			expect(seg.id).toBeGreaterThan(0);
			expect(['ride', 'run']).toContain(seg.activityType);
			expect(seg.startLatlng[0]).toBeGreaterThan(37);
		}
	});
});
```

- [ ] **Step 4: Run tests**

Run: `cd /Users/tammypais/projects/marin-monitor && npx vitest run src/lib/server/scrapers/strava-segments.test.ts`
Expected: All 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/scrapers/strava-auth.ts src/lib/server/scrapers/strava-segments.ts src/lib/server/scrapers/strava-segments.test.ts
git commit -m "feat(strava): add OAuth helper and Explore API segment catalog builder"
```

---

## Task 4: Cron Handlers

**Files:**
- Create: `src/routes/api/cron/sync-strava-segments/+server.ts`
- Create: `src/routes/api/cron/sync-strava-leaderboards/+server.ts`
- Modify: `vercel.json`

- [ ] **Step 1: Write weekly segment catalog cron**

```typescript
// src/routes/api/cron/sync-strava-segments/+server.ts

import { put, head } from '@vercel/blob';
import { env } from '$env/dynamic/private';
import { verifyCronAuth } from '$lib/server/cron-auth';
import { buildSegmentCatalog } from '$lib/server/scrapers/strava-segments';
import { STRAVA_ENABLED, STRAVA_SEGMENTS_BLOB } from '$lib/config/strava';
import type { StravaSegmentCatalog } from '$lib/types/strava';
import type { RequestHandler } from './$types';

export const config = { maxDuration: 60 };

export const GET: RequestHandler = async ({ request }) => {
	const authError = verifyCronAuth(request);
	if (authError) return authError;

	if (!STRAVA_ENABLED) {
		return new Response(JSON.stringify({ ok: false, reason: 'Strava feature disabled' }), {
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const start = Date.now();
	try {
		// Read existing catalog to preserve polylines/stats
		let existing: StravaSegmentCatalog | null = null;
		try {
			const blob = await head(STRAVA_SEGMENTS_BLOB, { token: env.BLOB_READ_WRITE_TOKEN });
			const res = await fetch(blob.downloadUrl, {
				headers: { Authorization: `Bearer ${env.BLOB_READ_WRITE_TOKEN}` }
			});
			if (res.ok) {
				existing = (await res.json()) as StravaSegmentCatalog;
			}
		} catch {
			// No existing blob — first run
		}

		const catalog = await buildSegmentCatalog(existing);

		await put(STRAVA_SEGMENTS_BLOB, JSON.stringify(catalog), {
			access: 'private',
			contentType: 'application/json',
			addRandomSuffix: false,
			allowOverwrite: true,
			token: env.BLOB_READ_WRITE_TOKEN
		});

		const withPolylines = catalog.segments.filter((s) => s.polyline).length;
		console.log(`[sync-strava-segments] OK: ${catalog.segments.length} segments (${withPolylines} with polylines) in ${Date.now() - start}ms`);

		return new Response(
			JSON.stringify({ ok: true, segmentCount: catalog.segments.length, withPolylines }),
			{ headers: { 'Content-Type': 'application/json' } }
		);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.error(`[sync-strava-segments] FAILED after ${Date.now() - start}ms:`, message);
		return new Response(JSON.stringify({ ok: false, error: message }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};
```

- [ ] **Step 2: Write daily leaderboard scrape cron**

```typescript
// src/routes/api/cron/sync-strava-leaderboards/+server.ts

import { put, head } from '@vercel/blob';
import { env } from '$env/dynamic/private';
import { verifyCronAuth } from '$lib/server/cron-auth';
import { scrapeSegmentLeaderboard } from '$lib/server/scrapers/strava-leaderboards';
import {
	STRAVA_ENABLED,
	STRAVA_SEGMENTS_BLOB,
	STRAVA_EVENTS_BLOB,
	STRAVA_EVENT_MAX_AGE_MS,
	stravaLeaderboardBlob
} from '$lib/config/strava';
import type {
	StravaSegmentCatalog,
	StravaLeaderboard,
	StravaEvent,
	StravaEventLog
} from '$lib/types/strava';
import type { RequestHandler } from './$types';

export const config = { maxDuration: 60 };

const CONCURRENCY = 5;

export const GET: RequestHandler = async ({ request }) => {
	const authError = verifyCronAuth(request);
	if (authError) return authError;

	if (!STRAVA_ENABLED) {
		return new Response(JSON.stringify({ ok: false, reason: 'Strava feature disabled' }), {
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const start = Date.now();
	try {
		// Load segment catalog to know which segments to scrape
		const catalog = await readBlob<StravaSegmentCatalog>(STRAVA_SEGMENTS_BLOB);
		if (!catalog || catalog.segments.length === 0) {
			return new Response(JSON.stringify({ ok: false, error: 'No segment catalog — run sync-strava-segments first' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		// Load existing events
		const existingEvents = await readBlob<StravaEventLog>(STRAVA_EVENTS_BLOB);
		const events: StravaEvent[] = existingEvents?.events ?? [];

		// Scrape all segments with concurrency limit
		const segmentIds = catalog.segments.map((s) => s.id);
		let scraped = 0;
		let failed = 0;
		const newEvents: StravaEvent[] = [];

		for (let i = 0; i < segmentIds.length; i += CONCURRENCY) {
			const batch = segmentIds.slice(i, i + CONCURRENCY);
			const results = await Promise.allSettled(
				batch.map(async (id) => {
					const leaderboard = await scrapeSegmentLeaderboard(id);
					if (!leaderboard) return null;

					// Detect CR/QOM changes
					const previous = await readBlob<StravaLeaderboard>(stravaLeaderboardBlob(id));
					const detected = detectChanges(leaderboard, previous);
					newEvents.push(...detected);

					// Write updated leaderboard
					await put(stravaLeaderboardBlob(id), JSON.stringify(leaderboard), {
						access: 'private',
						contentType: 'application/json',
						addRandomSuffix: false,
						allowOverwrite: true,
						token: env.BLOB_READ_WRITE_TOKEN
					});

					return leaderboard;
				})
			);

			for (const r of results) {
				if (r.status === 'fulfilled' && r.value) scraped++;
				else failed++;
			}
		}

		// Update events: add new, prune old
		const now = Date.now();
		const allEvents = [...newEvents, ...events]
			.filter((e) => now - new Date(e.detectedAt).getTime() < STRAVA_EVENT_MAX_AGE_MS);

		await put(STRAVA_EVENTS_BLOB, JSON.stringify({ events: allEvents, lastUpdated: new Date().toISOString() }), {
			access: 'private',
			contentType: 'application/json',
			addRandomSuffix: false,
			allowOverwrite: true,
			token: env.BLOB_READ_WRITE_TOKEN
		});

		// Update catalog with fresh attempt counts from leaderboards
		const updatedSegments = catalog.segments.map((seg) => {
			// Read leaderboard for this segment (we just wrote it)
			// For now, keep existing stats — they'll be updated on next catalog refresh
			return seg;
		});

		console.log(
			`[sync-strava-leaderboards] OK: ${scraped}/${segmentIds.length} scraped, ${failed} failed, ${newEvents.length} new events in ${Date.now() - start}ms`
		);

		return new Response(
			JSON.stringify({ ok: true, scraped, failed, newEvents: newEvents.length }),
			{ headers: { 'Content-Type': 'application/json' } }
		);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.error(`[sync-strava-leaderboards] FAILED after ${Date.now() - start}ms:`, message);
		return new Response(JSON.stringify({ ok: false, error: message }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};

/** Detect CR/QOM changes between current and previous leaderboard snapshots */
function detectChanges(current: StravaLeaderboard, previous: StravaLeaderboard | null): StravaEvent[] {
	const events: StravaEvent[] = [];
	const now = new Date().toISOString();

	if (!previous) return events; // First scrape — no changes to detect

	// Check CR (men/overall) change by effort ID
	if (current.cr && previous.cr && current.cr.effortId !== previous.cr.effortId) {
		events.push({
			type: 'new_kom',
			segmentId: current.segmentId,
			segmentName: current.segmentName,
			athlete: current.cr.athleteName,
			time: current.cr.time,
			effortId: current.cr.effortId,
			activityId: current.cr.activityId,
			previous: {
				athlete: previous.cr.athleteName,
				time: previous.cr.time,
				effortId: previous.cr.effortId
			},
			detectedAt: now
		});
	}

	// Check QOM change by effort ID
	if (current.qom && previous.qom && current.qom.effortId !== previous.qom.effortId) {
		events.push({
			type: 'new_qom',
			segmentId: current.segmentId,
			segmentName: current.segmentName,
			athlete: current.qom.athleteName,
			time: current.qom.time,
			effortId: current.qom.effortId,
			activityId: current.qom.activityId,
			previous: {
				athlete: previous.qom.athleteName,
				time: previous.qom.time,
				effortId: previous.qom.effortId
			},
			detectedAt: now
		});
	}

	return events;
}

/** Read a Blob as typed JSON, return null on any failure */
async function readBlob<T>(key: string): Promise<T | null> {
	try {
		const blob = await head(key, { token: env.BLOB_READ_WRITE_TOKEN });
		const res = await fetch(blob.downloadUrl, {
			headers: { Authorization: `Bearer ${env.BLOB_READ_WRITE_TOKEN}` }
		});
		if (res.ok) return (await res.json()) as T;
	} catch {
		// Blob doesn't exist yet
	}
	return null;
}
```

- [ ] **Step 3: Add cron entries to vercel.json**

Add to the `crons` array in `vercel.json`:
```json
{ "path": "/api/cron/sync-strava-segments", "schedule": "0 10 * * 0" },
{ "path": "/api/cron/sync-strava-leaderboards", "schedule": "0 12 * * *" }
```

- [ ] **Step 4: Commit**

```bash
git add src/routes/api/cron/sync-strava-segments/+server.ts src/routes/api/cron/sync-strava-leaderboards/+server.ts vercel.json
git commit -m "feat(strava): add cron handlers for segment catalog and leaderboard scraping"
```

---

## Task 5: Data API Routes + Static Fallbacks

**Files:**
- Create: `src/routes/api/data/strava-segments/+server.ts`
- Create: `src/routes/api/data/strava-leaderboard/[id]/+server.ts`
- Create: `src/routes/api/data/strava-events/+server.ts`
- Create: `static/data/strava-segments.json`
- Create: `static/data/strava-events.json`

- [ ] **Step 1: Write segment catalog API route**

```typescript
// src/routes/api/data/strava-segments/+server.ts

import { head } from '@vercel/blob';
import { env } from '$env/dynamic/private';
import { fetchWithTimeout } from '$lib/server/fetch-utils';
import { STRAVA_SEGMENTS_BLOB } from '$lib/config/strava';
import type { RequestHandler } from './$types';

const EMPTY = JSON.stringify({ segments: [], lastUpdated: '' });

export const GET: RequestHandler = async () => {
	try {
		const blob = await head(STRAVA_SEGMENTS_BLOB, { token: env.BLOB_READ_WRITE_TOKEN });
		const response = await fetchWithTimeout(blob.downloadUrl, {
			headers: { Authorization: `Bearer ${env.BLOB_READ_WRITE_TOKEN}` }
		}, 8000);
		if (response.ok) {
			return new Response(await response.text(), {
				headers: {
					'Content-Type': 'application/json',
					'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200'
				}
			});
		}
	} catch {
		// Blob not available
	}

	return new Response(EMPTY, {
		headers: {
			'Content-Type': 'application/json',
			'Cache-Control': 'public, s-maxage=60'
		}
	});
};
```

- [ ] **Step 2: Write per-segment leaderboard API route**

```typescript
// src/routes/api/data/strava-leaderboard/[id]/+server.ts

import { head } from '@vercel/blob';
import { env } from '$env/dynamic/private';
import { fetchWithTimeout } from '$lib/server/fetch-utils';
import { stravaLeaderboardBlob } from '$lib/config/strava';
import type { RequestHandler } from './$types';

const EMPTY = JSON.stringify({ segmentId: 0, segmentName: '', cr: null, qom: null, rows: [], totalAttempts: 0, totalAthletes: 0, scrapedAt: '' });

export const GET: RequestHandler = async ({ params }) => {
	const segmentId = parseInt(params.id, 10);
	if (isNaN(segmentId) || segmentId <= 0) {
		return new Response(JSON.stringify({ error: 'Invalid segment ID' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	try {
		const blob = await head(stravaLeaderboardBlob(segmentId), { token: env.BLOB_READ_WRITE_TOKEN });
		const response = await fetchWithTimeout(blob.downloadUrl, {
			headers: { Authorization: `Bearer ${env.BLOB_READ_WRITE_TOKEN}` }
		}, 8000);
		if (response.ok) {
			return new Response(await response.text(), {
				headers: {
					'Content-Type': 'application/json',
					'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600'
				}
			});
		}
	} catch {
		// Blob not available
	}

	return new Response(EMPTY, {
		headers: {
			'Content-Type': 'application/json',
			'Cache-Control': 'public, s-maxage=60'
		}
	});
};
```

- [ ] **Step 3: Write events API route**

```typescript
// src/routes/api/data/strava-events/+server.ts

import { head } from '@vercel/blob';
import { env } from '$env/dynamic/private';
import { fetchWithTimeout } from '$lib/server/fetch-utils';
import { STRAVA_EVENTS_BLOB } from '$lib/config/strava';
import type { RequestHandler } from './$types';

const EMPTY = JSON.stringify({ events: [], lastUpdated: '' });

export const GET: RequestHandler = async () => {
	try {
		const blob = await head(STRAVA_EVENTS_BLOB, { token: env.BLOB_READ_WRITE_TOKEN });
		const response = await fetchWithTimeout(blob.downloadUrl, {
			headers: { Authorization: `Bearer ${env.BLOB_READ_WRITE_TOKEN}` }
		}, 8000);
		if (response.ok) {
			return new Response(await response.text(), {
				headers: {
					'Content-Type': 'application/json',
					'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600'
				}
			});
		}
	} catch {
		// Blob not available
	}

	return new Response(EMPTY, {
		headers: {
			'Content-Type': 'application/json',
			'Cache-Control': 'public, s-maxage=60'
		}
	});
};
```

- [ ] **Step 4: Create static fallback files**

```bash
echo '{"segments":[],"lastUpdated":""}' > static/data/strava-segments.json
echo '{"events":[],"lastUpdated":""}' > static/data/strava-events.json
```

- [ ] **Step 5: Commit**

```bash
git add src/routes/api/data/strava-segments/ src/routes/api/data/strava-leaderboard/ src/routes/api/data/strava-events/ static/data/strava-segments.json static/data/strava-events.json
git commit -m "feat(strava): add data API routes and static fallbacks"
```

---

## Task 6: Client-Side Adapter + Store

**Files:**
- Create: `src/lib/api/marin/strava.ts`
- Create: `src/lib/stores/strava.ts`
- Test: `src/lib/api/marin/strava.test.ts`

- [ ] **Step 1: Write failing test for client adapter**

```typescript
// src/lib/api/marin/strava.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchStravaSegments, fetchStravaLeaderboard, fetchStravaEvents } from './strava';

vi.mock('$lib/config/api', () => ({
	logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

describe('strava client adapter', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it('fetchStravaSegments returns data on success', async () => {
		const mockData = {
			segments: [{ id: 229781, name: 'Hawk Hill', activityType: 'ride' }],
			lastUpdated: '2026-03-28T00:00:00Z'
		};
		global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(mockData) });

		const result = await fetchStravaSegments();
		expect(result.segments).toHaveLength(1);
		expect(result.segments[0].name).toBe('Hawk Hill');
	});

	it('fetchStravaSegments returns empty on failure', async () => {
		global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

		const result = await fetchStravaSegments();
		expect(result.segments).toEqual([]);
	});

	it('fetchStravaLeaderboard returns data for valid ID', async () => {
		const mockData = {
			segmentId: 229781,
			cr: { athleteName: 'J K', time: '5:17' },
			rows: []
		};
		global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(mockData) });

		const result = await fetchStravaLeaderboard(229781);
		expect(result).not.toBeNull();
		expect(result!.cr!.athleteName).toBe('J K');
	});

	it('fetchStravaEvents returns empty on failure', async () => {
		global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });

		const result = await fetchStravaEvents();
		expect(result.events).toEqual([]);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/tammypais/projects/marin-monitor && npx vitest run src/lib/api/marin/strava.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write client adapter**

```typescript
// src/lib/api/marin/strava.ts

import { logger } from '$lib/config/api';
import { fetchWithTimeout } from './fetch-helpers';
import type { StravaSegmentCatalog, StravaLeaderboard, StravaEventLog } from '$lib/types/strava';

export async function fetchStravaSegments(): Promise<StravaSegmentCatalog> {
	try {
		logger.log('Strava', 'Loading segment catalog');
		const response = await fetchWithTimeout('/api/data/strava-segments');
		if (!response.ok) throw new Error(`HTTP ${response.status}`);
		return (await response.json()) as StravaSegmentCatalog;
	} catch (error) {
		logger.warn('Strava', `Segment catalog fetch failed: ${(error as Error).message}`);
		return { segments: [], lastUpdated: '' };
	}
}

export async function fetchStravaLeaderboard(segmentId: number): Promise<StravaLeaderboard | null> {
	try {
		const response = await fetchWithTimeout(`/api/data/strava-leaderboard/${segmentId}`);
		if (!response.ok) throw new Error(`HTTP ${response.status}`);
		const data = (await response.json()) as StravaLeaderboard;
		return data.segmentId > 0 ? data : null;
	} catch (error) {
		logger.warn('Strava', `Leaderboard ${segmentId} fetch failed: ${(error as Error).message}`);
		return null;
	}
}

export async function fetchStravaEvents(): Promise<StravaEventLog> {
	try {
		const response = await fetchWithTimeout('/api/data/strava-events');
		if (!response.ok) throw new Error(`HTTP ${response.status}`);
		return (await response.json()) as StravaEventLog;
	} catch (error) {
		logger.warn('Strava', `Events fetch failed: ${(error as Error).message}`);
		return { events: [], lastUpdated: '' };
	}
}
```

- [ ] **Step 4: Write Svelte store**

```typescript
// src/lib/stores/strava.ts

import { writable, derived } from 'svelte/store';
import { fetchStravaSegments, fetchStravaLeaderboard, fetchStravaEvents } from '$lib/api/marin/strava';
import { STRAVA_ENABLED } from '$lib/config/strava';
import type { StravaSegmentCatalog, StravaLeaderboard, StravaEventLog } from '$lib/types/strava';

export const stravaSegments = writable<StravaSegmentCatalog>({ segments: [], lastUpdated: '' });
export const stravaEvents = writable<StravaEventLog>({ events: [], lastUpdated: '' });

// Cache of loaded leaderboards (keyed by segment ID)
const leaderboardCache = writable<Map<number, StravaLeaderboard>>(new Map());

export const stravaLeaderboards = derived(leaderboardCache, ($cache) => $cache);

export async function loadStravaData(): Promise<void> {
	if (!STRAVA_ENABLED) return;

	const [catalog, events] = await Promise.all([
		fetchStravaSegments(),
		fetchStravaEvents()
	]);

	stravaSegments.set(catalog);
	stravaEvents.set(events);
}

export async function loadLeaderboard(segmentId: number): Promise<StravaLeaderboard | null> {
	// Check cache first
	let cached: StravaLeaderboard | undefined;
	leaderboardCache.subscribe(($cache) => { cached = $cache.get(segmentId); })();
	if (cached) return cached;

	const data = await fetchStravaLeaderboard(segmentId);
	if (data) {
		leaderboardCache.update(($cache) => {
			const next = new Map($cache);
			next.set(segmentId, data);
			return next;
		});
	}
	return data;
}
```

- [ ] **Step 5: Run tests**

Run: `cd /Users/tammypais/projects/marin-monitor && npx vitest run src/lib/api/marin/strava.test.ts`
Expected: All 4 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/api/marin/strava.ts src/lib/api/marin/strava.test.ts src/lib/stores/strava.ts
git commit -m "feat(strava): add client adapter and reactive store"
```

---

## Task 7: Leaderboards Panel

**Files:**
- Create: `src/lib/components/panels/LeaderboardsPanel.svelte`
- Create: `src/lib/components/panels/leaderboards/SegmentCard.svelte`
- Create: `src/lib/components/panels/leaderboards/RecentActivity.svelte`
- Modify: `src/lib/config/panels.ts`
- Modify: `src/lib/components/dashboard/WireGrid.svelte`

- [ ] **Step 1: Add to panel config**

In `src/lib/config/panels.ts`:

Add `'leaderboards'` to the `PanelId` type union.

Add to the `PANELS` object:
```typescript
leaderboards: {
	name: 'Leaderboards',
	priority: 2,
	description: 'Strava segment KOMs and course records for Marin'
},
```

Add `'leaderboards'` to `DEFAULT_PANEL_ORDER` array after `'cycling'`.

- [ ] **Step 2: Write SegmentCard component**

```svelte
<!-- src/lib/components/panels/leaderboards/SegmentCard.svelte -->
<script lang="ts">
	import { loadLeaderboard } from '$lib/stores/strava';
	import type { StravaSegment, StravaLeaderboard } from '$lib/types/strava';

	interface Props {
		segment: StravaSegment;
	}

	let { segment }: Props = $props();
	let expanded = $state(false);
	let leaderboard = $state<StravaLeaderboard | null>(null);
	let loading = $state(false);

	const categoryLabel = $derived(
		segment.climbCategory === 5 ? 'HC'
		: segment.climbCategory > 0 ? `Cat ${5 - segment.climbCategory}`
		: ''
	);

	async function toggle() {
		expanded = !expanded;
		if (expanded && !leaderboard && !loading) {
			loading = true;
			leaderboard = await loadLeaderboard(segment.id);
			loading = false;
		}
	}
</script>

<button class="segment-card" class:expanded onclick={toggle}>
	<div class="card-header">
		<div class="card-title">
			<span class="segment-name">{segment.name}</span>
			{#if categoryLabel}
				<span class="category-badge">{categoryLabel}</span>
			{/if}
		</div>
		<div class="card-meta">
			{#if leaderboard?.cr}
				<span class="cr-line">CR: {leaderboard.cr.time} — {leaderboard.cr.athleteName}</span>
			{/if}
			{#if leaderboard?.qom}
				<span class="qom-line">QOM: {leaderboard.qom.time} — {leaderboard.qom.athleteName}</span>
			{/if}
			{#if !leaderboard && !loading}
				<span class="placeholder">Tap to load</span>
			{/if}
			{#if loading}
				<span class="placeholder">Loading...</span>
			{/if}
		</div>
	</div>

	{#if expanded && leaderboard}
		<div class="card-body">
			{#if leaderboard.rows.length > 0}
				<table class="leaderboard-table">
					<thead>
						<tr>
							<th>#</th>
							<th>Athlete</th>
							<th>Time</th>
							{#if segment.activityType === 'ride'}<th>Speed</th>{/if}
						</tr>
					</thead>
					<tbody>
						{#each leaderboard.rows as row}
							<tr>
								<td class="rank">{row.rank}</td>
								<td class="athlete">{row.athleteName}</td>
								<td class="time">
									<a href="https://www.strava.com/activities/{row.activityId}" target="_blank" rel="noopener">
										{row.time}
									</a>
								</td>
								{#if segment.activityType === 'ride'}
									<td class="speed">{row.speed ?? '—'}</td>
								{/if}
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}
			<div class="card-footer">
				<span class="attempts">{leaderboard.totalAttempts.toLocaleString()} attempts</span>
				<span class="stats">{(segment.distance / 1000).toFixed(1)}km · {segment.elevationGain}m ↑</span>
				<a href="https://www.strava.com/segments/{segment.id}" target="_blank" rel="noopener" class="strava-link">
					View on Strava ↗
				</a>
			</div>
		</div>
	{/if}
</button>

<style>
	.segment-card {
		display: block;
		width: 100%;
		text-align: left;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid var(--border);
		border-radius: 4px;
		padding: 0.5rem;
		cursor: pointer;
		transition: border-color 0.15s;
		font-family: inherit;
		color: inherit;
	}

	.segment-card:hover { border-color: var(--text-dim); }

	.card-header { display: flex; flex-direction: column; gap: 0.2rem; }

	.card-title { display: flex; align-items: center; gap: 0.4rem; }

	.segment-name { font-size: 0.75rem; font-weight: 600; color: var(--text); }

	.category-badge {
		font-size: 0.55rem;
		padding: 0.1rem 0.3rem;
		border-radius: 2px;
		background: rgba(251, 191, 36, 0.15);
		color: #fbbf24;
		font-weight: 600;
		text-transform: uppercase;
	}

	.card-meta { font-size: 0.65rem; color: var(--text-dim); }

	.cr-line { color: #f59e0b; }
	.qom-line { color: #ec4899; margin-left: 0.5rem; }
	.placeholder { color: var(--text-muted); font-style: italic; }

	.card-body { margin-top: 0.4rem; padding-top: 0.4rem; border-top: 1px solid var(--border); }

	.leaderboard-table { width: 100%; font-size: 0.6rem; border-collapse: collapse; }
	.leaderboard-table th { text-align: left; color: var(--text-muted); padding: 0.15rem 0.3rem; font-weight: 500; }
	.leaderboard-table td { padding: 0.15rem 0.3rem; color: var(--text-dim); }
	.leaderboard-table .rank { color: var(--text-muted); width: 1.5rem; }
	.leaderboard-table .time a { color: #60a5fa; text-decoration: none; }
	.leaderboard-table .time a:hover { text-decoration: underline; }

	.card-footer {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		margin-top: 0.3rem;
		font-size: 0.55rem;
		color: var(--text-muted);
	}

	.strava-link { color: #fc4c02; margin-left: auto; text-decoration: none; }
	.strava-link:hover { text-decoration: underline; }
</style>
```

- [ ] **Step 3: Write RecentActivity component**

```svelte
<!-- src/lib/components/panels/leaderboards/RecentActivity.svelte -->
<script lang="ts">
	import { stravaEvents } from '$lib/stores/strava';
	import type { StravaEvent } from '$lib/types/strava';

	const events = $derived($stravaEvents.events.slice(0, 20));

	function eventLabel(event: StravaEvent): string {
		const prefix = event.type === 'new_kom' ? 'NEW KOM' : 'NEW QOM';
		const prev = event.previous ? ` (prev: ${event.previous.time} by ${event.previous.athlete})` : '';
		return `${prefix}: ${event.segmentName} — ${event.time} by ${event.athlete}${prev}`;
	}

	function timeAgo(iso: string): string {
		const ms = Date.now() - new Date(iso).getTime();
		const hours = Math.floor(ms / 3600000);
		if (hours < 1) return 'just now';
		if (hours < 24) return `${hours}h ago`;
		const days = Math.floor(hours / 24);
		return `${days}d ago`;
	}
</script>

{#if events.length === 0}
	<div class="empty">No recent leaderboard changes</div>
{:else}
	<div class="events-list">
		{#each events as event (event.effortId)}
			<div class="event-item">
				<span class="event-badge" class:kom={event.type === 'new_kom'} class:qom={event.type === 'new_qom'}>
					{event.type === 'new_kom' ? 'KOM' : 'QOM'}
				</span>
				<div class="event-content">
					<div class="event-text">{eventLabel(event)}</div>
					<div class="event-time">{timeAgo(event.detectedAt)}</div>
				</div>
			</div>
		{/each}
	</div>
{/if}

<style>
	.empty { font-size: 0.65rem; color: var(--text-muted); padding: 1rem; text-align: center; }

	.events-list { display: flex; flex-direction: column; gap: 0.3rem; }

	.event-item { display: flex; gap: 0.4rem; align-items: flex-start; padding: 0.3rem 0; }

	.event-badge {
		font-size: 0.5rem;
		font-weight: 700;
		padding: 0.1rem 0.25rem;
		border-radius: 2px;
		flex-shrink: 0;
		margin-top: 0.1rem;
	}

	.event-badge.kom { background: rgba(245, 158, 11, 0.15); color: #f59e0b; }
	.event-badge.qom { background: rgba(236, 72, 153, 0.15); color: #ec4899; }

	.event-text { font-size: 0.65rem; color: var(--text-dim); }
	.event-time { font-size: 0.55rem; color: var(--text-muted); }
</style>
```

- [ ] **Step 4: Write LeaderboardsPanel component**

```svelte
<!-- src/lib/components/panels/LeaderboardsPanel.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { stravaSegments, loadStravaData } from '$lib/stores/strava';
	import { STRAVA_ENABLED } from '$lib/config/strava';
	import SegmentCard from './leaderboards/SegmentCard.svelte';
	import RecentActivity from './leaderboards/RecentActivity.svelte';

	type Tab = 'cycling' | 'running' | 'activity';
	let activeTab = $state<Tab>('cycling');

	const cyclingSegments = $derived(
		$stravaSegments.segments
			.filter((s) => s.activityType === 'ride')
			.sort((a, b) => b.totalAttempts - a.totalAttempts)
	);

	const runningSegments = $derived(
		$stravaSegments.segments
			.filter((s) => s.activityType === 'run')
			.sort((a, b) => b.totalAttempts - a.totalAttempts)
	);

	onMount(() => {
		if (STRAVA_ENABLED) loadStravaData();
	});
</script>

<div class="panel leaderboards-panel">
	<div class="panel-header">
		<h3 class="panel-title">LEADERBOARDS</h3>
	</div>

	<div class="tab-bar">
		<button class="tab" class:active={activeTab === 'cycling'} onclick={() => activeTab = 'cycling'}>Cycling</button>
		<button class="tab" class:active={activeTab === 'running'} onclick={() => activeTab = 'running'}>Running</button>
		<button class="tab" class:active={activeTab === 'activity'} onclick={() => activeTab = 'activity'}>Recent Activity</button>
	</div>

	<div class="tab-content">
		{#if activeTab === 'cycling'}
			{#if cyclingSegments.length === 0}
				<div class="empty">No cycling segments loaded</div>
			{:else}
				<div class="segment-list">
					{#each cyclingSegments as segment (segment.id)}
						<SegmentCard {segment} />
					{/each}
				</div>
			{/if}
		{:else if activeTab === 'running'}
			{#if runningSegments.length === 0}
				<div class="empty">No running segments loaded</div>
			{:else}
				<div class="segment-list">
					{#each runningSegments as segment (segment.id)}
						<SegmentCard {segment} />
					{/each}
				</div>
			{/if}
		{:else}
			<RecentActivity />
		{/if}
	</div>
</div>

<style>
	.leaderboards-panel {
		background: var(--panel-bg);
		border: 1px solid var(--border);
		border-radius: 6px;
		overflow: hidden;
	}

	.panel-header {
		padding: 0.4rem 0.5rem;
		border-bottom: 1px solid var(--border);
	}

	.panel-title {
		font-size: 0.65rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		color: var(--text-dim);
		margin: 0;
	}

	.tab-bar {
		display: flex;
		border-bottom: 1px solid var(--border);
	}

	.tab {
		flex: 1;
		padding: 0.3rem 0.4rem;
		background: none;
		border: none;
		border-bottom: 2px solid transparent;
		color: var(--text-muted);
		font-size: 0.6rem;
		font-family: inherit;
		cursor: pointer;
		transition: all 0.15s;
	}

	.tab:hover { color: var(--text-dim); }
	.tab.active { color: var(--text); border-bottom-color: #fc4c02; }

	.tab-content { padding: 0.4rem; max-height: 600px; overflow-y: auto; }

	.segment-list { display: flex; flex-direction: column; gap: 0.3rem; }

	.empty { font-size: 0.65rem; color: var(--text-muted); padding: 1rem; text-align: center; }
</style>
```

- [ ] **Step 5: Add LeaderboardsPanel to WireGrid**

In `src/lib/components/dashboard/WireGrid.svelte`:

Add import:
```typescript
import LeaderboardsPanel from '$lib/components/panels/LeaderboardsPanel.svelte';
import { STRAVA_ENABLED } from '$lib/config/strava';
```

Add after the CommunityPanel `<div class="wire-slot">` block:
```svelte
{#if STRAVA_ENABLED && isPanelVisible('leaderboards')}
	<div class="wire-slot">
		<LeaderboardsPanel />
	</div>
{/if}
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/components/panels/LeaderboardsPanel.svelte src/lib/components/panels/leaderboards/ src/lib/config/panels.ts src/lib/components/dashboard/WireGrid.svelte
git commit -m "feat(strava): add Leaderboards panel with segment cards and WireGrid routing"
```

---

## Task 8: Map Integration (Polylines + Pins + Toggle)

**Files:**
- Create: `src/lib/components/map/SegmentLayer.svelte`
- Modify: `src/lib/components/map/MapControls.svelte`
- Modify: `src/lib/components/map/MapDataLayer.svelte` (or equivalent map composition file)
- Modify: `src/lib/types/index.ts` (add `'segments'` to MapLayer if needed)

This task requires reading the existing map component structure to determine exact integration points. The implementer should:

- [ ] **Step 1: Read existing map components**

Read these files to understand the current map composition:
- `src/lib/components/map/MapContainer.svelte`
- `src/lib/components/map/MapDataLayer.svelte`
- `src/lib/components/map/MapControls.svelte`

Understand how layers (earthquakes, traffic, category markers) are added and toggled.

- [ ] **Step 2: Write SegmentLayer component**

Create `src/lib/components/map/SegmentLayer.svelte`. This component should:

- Accept the MapLibre map instance from context (`getContext('maplibre-map')`)
- Subscribe to `stravaSegments` store
- Decode encoded polylines into GeoJSON LineString features (use a `decodePolyline` utility — the algorithm is Google's standard encoded polyline format, ~30 lines to implement)
- Add two MapLibre sources:
  - `strava-segments-lines`: GeoJSON FeatureCollection of LineString features (segments with polylines)
  - `strava-segments-pins`: GeoJSON FeatureCollection of Point features (segments without polylines, or all segments at low zoom)
- Add layers with zoom-dependent visibility:
  - `strava-pins-layer`: circle markers at z11 and below (`maxzoom: 12`)
  - `strava-lines-ride-layer`: orange lines for cycling segments (`minzoom: 12`)
  - `strava-lines-run-layer`: teal lines for running segments (`minzoom: 12`)
- Style cycling lines orange (#f59e0b) and running lines teal (#22d3ee), 3px width
- Add hover effect: thicken to 5px, show popup with segment name
- Add click handler: show popup with CR/QOM + leaderboard summary (lazy-load from `loadLeaderboard`)
- Implement `show()`/`hide()` methods toggling layer visibility

Use the earthquake layer in MapControls as a reference for the toggle pattern (local `$state` + `setLayoutProperty`).

- [ ] **Step 3: Add polyline decoder utility**

```typescript
// Add to src/lib/components/map/SegmentLayer.svelte or a separate util

/** Decode Google encoded polyline to [lat, lon][] coordinates */
function decodePolyline(encoded: string): [number, number][] {
	const coords: [number, number][] = [];
	let index = 0;
	let lat = 0;
	let lon = 0;

	while (index < encoded.length) {
		let shift = 0;
		let result = 0;
		let byte: number;

		do {
			byte = encoded.charCodeAt(index++) - 63;
			result |= (byte & 0x1f) << shift;
			shift += 5;
		} while (byte >= 0x20);
		lat += result & 1 ? ~(result >> 1) : result >> 1;

		shift = 0;
		result = 0;
		do {
			byte = encoded.charCodeAt(index++) - 63;
			result |= (byte & 0x1f) << shift;
			shift += 5;
		} while (byte >= 0x20);
		lon += result & 1 ? ~(result >> 1) : result >> 1;

		coords.push([lat / 1e5, lon / 1e5]);
	}

	return coords;
}
```

- [ ] **Step 4: Add Segments toggle to MapControls**

In `src/lib/components/map/MapControls.svelte`, add a toggle button for segments following the earthquake toggle pattern:

```svelte
<!-- Add state -->
let segmentsVisible = $state(false);

<!-- Add toggle function -->
function toggleSegments() {
	segmentsVisible = !segmentsVisible;
	// Dispatch event or call layer show/hide
	// The exact mechanism depends on how SegmentLayer is composed
}

<!-- Add button after earthquakes toggle -->
<button
	class="layer-toggle"
	class:active={segmentsVisible}
	style:--layer-color={'#fc4c02'}
	onclick={toggleSegments}
	title="Strava segments"
>
	<span class="layer-dot"></span>
	<span class="layer-label">Segments</span>
</button>
```

- [ ] **Step 5: Integrate SegmentLayer into map composition**

Add `<SegmentLayer />` into `MapDataLayer.svelte` (or `MapContainer.svelte`, depending on where other data layers are composed). The segment layer should be conditionally rendered based on the toggle state.

- [ ] **Step 6: Commit**

```bash
git add src/lib/components/map/SegmentLayer.svelte src/lib/components/map/MapControls.svelte src/lib/components/map/MapDataLayer.svelte
git commit -m "feat(strava): add map segment layer with polylines, pins, and toggle"
```

---

## Task 9: Chyron Integration

**Files:**
- Modify: `src/lib/config/tv.ts`
- Modify: `src/lib/stores/tv.ts`

- [ ] **Step 1: Add KOM ticker category**

In `src/lib/config/tv.ts`:

Add `'KOM'` to the `TickerCategory` type:
```typescript
export type TickerCategory = 'WX' | 'PD' | 'LW' | 'FI' | 'EQ' | 'TD' | 'GG' | 'CV' | 'KOM';
```

Add to `CATEGORY_COLORS`:
```typescript
KOM: '#fc4c02',  // Strava orange
```

- [ ] **Step 2: Add Strava events to chyron store**

In `src/lib/stores/tv.ts`:

Add import:
```typescript
import { stravaEvents } from '$lib/stores/strava';
import { STRAVA_CHYRON_MAX_AGE_MS } from '$lib/config/strava';
```

Add `stravaEvents` to the `derived()` inputs array:
```typescript
export const tvTickerItems = derived(
	[safetyNews, localNews, civicNews, alerts, stravaEvents],
	([$safety, $local, $civic, $alerts, $strava]) => {
```

Add Strava event processing inside the try block, before the dedup step:
```typescript
// Strava KOM/QOM events (max 3-4, within 48h)
const now = Date.now();
const recentStravaEvents = ($strava.events ?? [])
	.filter((e) => now - new Date(e.detectedAt).getTime() < STRAVA_CHYRON_MAX_AGE_MS)
	.slice(0, 4);

for (const event of recentStravaEvents) {
	const prefix = event.type === 'new_kom' ? 'NEW KOM' : 'NEW QOM';
	const prev = event.previous ? ` (prev: ${event.previous.time})` : '';
	items.push({
		id: `KOM-${event.effortId}`,
		badge: 'KOM' as TickerCategory,
		category: 'KOM',
		text: `${prefix}: ${event.segmentName} — ${event.time} by ${event.athlete}${prev}`,
		timestamp: new Date(event.detectedAt).getTime(),
		status: 'normal' as TickerStatus
	});
}
```

- [ ] **Step 3: Run existing TV ticker tests**

Run: `cd /Users/tammypais/projects/marin-monitor && npx vitest run src/lib/stores/tv.test.ts`
Expected: Existing tests should still pass (the new store input defaults to empty events). If any tests mock the derived inputs, update the mock to include the new 5th input.

- [ ] **Step 4: Commit**

```bash
git add src/lib/config/tv.ts src/lib/stores/tv.ts
git commit -m "feat(strava): integrate KOM/QOM events into TV chyron ticker"
```

---

## Task 10: TV Carousel Screen

**Files:**
- Create: `src/lib/components/tv/screens/TvLeaderboardsScreen.svelte`
- Modify: `src/lib/config/tv.ts`
- Modify: TV screen router (wherever `TvScreen` dispatches to screen components)

- [ ] **Step 1: Add screen to TV config**

In `src/lib/config/tv.ts`:

Add `'leaderboards'` to `TvScreenId`:
```typescript
export type TvScreenId = /* existing */ | 'leaderboards';
```

Add to `TV_SCREENS` array:
```typescript
{ id: 'leaderboards', name: 'Marin Leaderboards', description: 'Strava KOMs and course records', durationMs: 20_000 },
```

- [ ] **Step 2: Write TV Leaderboards screen**

```svelte
<!-- src/lib/components/tv/screens/TvLeaderboardsScreen.svelte -->
<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { stravaSegments, stravaEvents, loadStravaData, loadLeaderboard } from '$lib/stores/strava';
	import type { StravaSegment, StravaLeaderboard } from '$lib/types/strava';

	let leftEl = $state<HTMLDivElement | null>(null);
	let scrollTimer: ReturnType<typeof setInterval> | null = null;

	// Load data on mount
	onMount(() => {
		loadStravaData();
		scrollTimer = setInterval(() => {
			if (!leftEl) return;
			const max = leftEl.scrollHeight - leftEl.clientHeight;
			if (max <= 0) return;
			if (leftEl.scrollTop >= max - 2) {
				leftEl.scrollTop = 0;
			} else {
				leftEl.scrollTop += 1;
			}
		}, 50);
	});

	onDestroy(() => {
		if (scrollTimer) clearInterval(scrollTimer);
	});

	const cycling = $derived(
		$stravaSegments.segments.filter((s) => s.activityType === 'ride').slice(0, 8)
	);
	const running = $derived(
		$stravaSegments.segments.filter((s) => s.activityType === 'run').slice(0, 8)
	);
	const recentEvents = $derived($stravaEvents.events.slice(0, 3));

	// Load leaderboards for visible segments
	let leaderboards = $state<Map<number, StravaLeaderboard>>(new Map());

	$effect(() => {
		const allSegs = [...cycling, ...running];
		for (const seg of allSegs) {
			if (!leaderboards.has(seg.id)) {
				loadLeaderboard(seg.id).then((lb) => {
					if (lb) {
						leaderboards = new Map([...leaderboards, [seg.id, lb]]);
					}
				});
			}
		}
	});
</script>

<div class="tv-leaderboards">
	<div class="header">
		<h2>MARIN LEADERBOARDS</h2>
	</div>

	<div class="columns" bind:this={leftEl}>
		<div class="column">
			<h3 class="column-title cycling">CYCLING</h3>
			{#each cycling as segment (segment.id)}
				{@const lb = leaderboards.get(segment.id)}
				<div class="segment-block">
					<div class="segment-header">
						<span class="seg-name">{segment.name}</span>
						{#if segment.climbCategory > 0}
							<span class="cat">{segment.climbCategory === 5 ? 'HC' : `Cat ${5 - segment.climbCategory}`}</span>
						{/if}
					</div>
					{#if lb?.cr}
						<div class="cr">CR: {lb.cr.time} — {lb.cr.athleteName}</div>
					{/if}
					{#if lb}
						{#each lb.rows.slice(0, 3) as row}
							<div class="row"><span class="rank">{row.rank}.</span> {row.athleteName} <span class="time">{row.time}</span></div>
						{/each}
					{/if}
				</div>
			{/each}
		</div>

		<div class="column">
			<h3 class="column-title running">RUNNING</h3>
			{#each running as segment (segment.id)}
				{@const lb = leaderboards.get(segment.id)}
				<div class="segment-block">
					<div class="segment-header">
						<span class="seg-name">{segment.name}</span>
					</div>
					{#if lb?.cr}
						<div class="cr">CR: {lb.cr.time} — {lb.cr.athleteName}</div>
					{/if}
					{#if lb}
						{#each lb.rows.slice(0, 3) as row}
							<div class="row"><span class="rank">{row.rank}.</span> {row.athleteName} <span class="time">{row.time}</span></div>
						{/each}
					{/if}
				</div>
			{/each}
		</div>
	</div>

	{#if recentEvents.length > 0}
		<div class="events-strip">
			{#each recentEvents as event}
				<span class="event">
					{event.type === 'new_kom' ? '🔥 NEW KOM' : '🔥 NEW QOM'}: {event.segmentName} — {event.time} by {event.athlete}
				</span>
			{/each}
		</div>
	{/if}
</div>

<style>
	.tv-leaderboards { display: flex; flex-direction: column; height: 100%; background: #0a0a0a; color: #e5e5e5; }

	.header { padding: 0.75rem 1rem; border-bottom: 1px solid #333; }
	.header h2 { font-size: 1rem; font-weight: 700; letter-spacing: 0.08em; color: #fc4c02; margin: 0; }

	.columns { display: flex; gap: 1rem; flex: 1; overflow: hidden; padding: 0.75rem 1rem; }
	.column { flex: 1; display: flex; flex-direction: column; gap: 0.5rem; }

	.column-title { font-size: 0.7rem; font-weight: 700; letter-spacing: 0.06em; margin: 0 0 0.25rem; }
	.column-title.cycling { color: #f59e0b; }
	.column-title.running { color: #22d3ee; }

	.segment-block { padding: 0.4rem; background: rgba(255,255,255,0.03); border-radius: 4px; border: 1px solid #222; }
	.segment-header { display: flex; align-items: center; gap: 0.3rem; }
	.seg-name { font-size: 0.75rem; font-weight: 600; }
	.cat { font-size: 0.5rem; color: #fbbf24; background: rgba(251,191,36,0.15); padding: 0.05rem 0.2rem; border-radius: 2px; }

	.cr { font-size: 0.6rem; color: #f59e0b; margin-top: 0.15rem; }

	.row { font-size: 0.6rem; color: #a3a3a3; }
	.rank { color: #737373; }
	.time { color: #60a5fa; margin-left: auto; }

	.events-strip {
		display: flex;
		gap: 2rem;
		padding: 0.4rem 1rem;
		border-top: 1px solid #333;
		font-size: 0.6rem;
		color: #f59e0b;
		overflow: hidden;
		white-space: nowrap;
	}
</style>
```

- [ ] **Step 3: Register screen in TV router**

Find the TV screen router component (likely `TvWallboard.svelte` or `TvScreen.svelte`) and add the import + case for the `'leaderboards'` screen ID, following the pattern used by other screens.

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/tv/screens/TvLeaderboardsScreen.svelte src/lib/config/tv.ts
git commit -m "feat(strava): add Leaderboards TV carousel screen"
```

---

## Task 11: Refresh Integration + Health Check

**Files:**
- Modify: `src/lib/stores/refresh.ts`
- Modify: `src/routes/api/health/+server.ts` (if exists)

- [ ] **Step 1: Add strava to tertiary refresh stage**

In `src/lib/stores/refresh.ts`, add `'strava'` to the tertiary stage categories:

```typescript
{
	name: 'tertiary',
	categories: ['housing', 'gas-prices', 'ev-charging', 'satire', 'earthquakes', 'strava'],
	delayMs: 4000
}
```

- [ ] **Step 2: Add Strava freshness to health endpoint**

If `/api/health/+server.ts` exists, add a check for `strava-segments.json` and `strava-events.json` Blob freshness following the existing pattern for other Blob-backed datasets.

- [ ] **Step 3: Commit**

```bash
git add src/lib/stores/refresh.ts src/routes/api/health/+server.ts
git commit -m "feat(strava): add to refresh orchestration and health endpoint"
```

---

## Task 12: Final Wiring + Smoke Test

- [ ] **Step 1: Run full test suite**

```bash
cd /Users/tammypais/projects/marin-monitor && npm run test:unit
```

Expected: All existing tests pass + new strava tests pass.

- [ ] **Step 2: Run type checking**

```bash
npm run check
```

Expected: No type errors.

- [ ] **Step 3: Run linting**

```bash
npm run lint
```

Expected: Clean or fixable warnings only.

- [ ] **Step 4: Run dev server and verify**

```bash
npm run dev
```

Verify in browser:
- Leaderboards panel appears in the Wire Grid
- Panel shows Cycling/Running/Recent Activity tabs
- Segment cards load (will show "No segments loaded" until cron runs — expected)
- Map has Segments toggle in controls
- TV mode at `/tv` includes the Leaderboards screen in the carousel

- [ ] **Step 5: Commit any fixes from smoke test**

```bash
git add -A
git commit -m "fix(strava): address smoke test issues"
```

- [ ] **Step 6: Push to main**

```bash
git push origin main
```

Vercel auto-deploys. After deploy, manually trigger the segment catalog cron first:
```bash
curl -H "Authorization: Bearer $CRON_SECRET" "https://marinmonitor.com/api/cron/sync-strava-segments"
```

Then trigger the leaderboard scrape:
```bash
curl -H "Authorization: Bearer $CRON_SECRET" "https://marinmonitor.com/api/cron/sync-strava-leaderboards"
```

Verify the panel populates with real data.

---

## Env Vars Required (Vercel Dashboard)

| Variable | Purpose | Required For |
|----------|---------|-------------|
| `STRAVA_CLIENT_ID` | Strava API app client ID | Explore API (weekly catalog cron) |
| `STRAVA_CLIENT_SECRET` | Strava API app client secret | Explore API (weekly catalog cron) |
| `STRAVA_REFRESH_TOKEN` | OAuth refresh token from Stuart's account | Explore API (weekly catalog cron) |

The leaderboard scrape cron does NOT need these — it's unauthenticated. The Explore API cron needs them for polylines and supplemental segment discovery.

Stuart: Set up a Strava API app at https://www.strava.com/settings/api, authorize it with your account, and add the three env vars to Vercel. The leaderboard scraping will work immediately without OAuth; polylines will populate once OAuth is configured.
