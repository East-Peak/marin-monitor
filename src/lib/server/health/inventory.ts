/**
 * Frozen inventory of every data source the site depends on, and the policy
 * that decides whether each one is healthy. Evidence for each entry lives in
 * the 2026-09 pipeline audit (pipeline-forensics.md).
 *
 * Changing a threshold, an observation field, or removing a source here
 * changes what "healthy" means — inventory.test.ts pins the list on purpose.
 */
import type { AcceptedException, SourcePolicy, SubsourceFailure } from './evaluate';

function freeze<T extends object>(entries: T[]): readonly Readonly<T>[] {
	return Object.freeze(entries.map((entry) => Object.freeze(entry)));
}

export const SOURCE_INVENTORY: readonly SourcePolicy[] = freeze<SourcePolicy>([
	// Vercel cron every 4h.
	{
		name: 'Gas Prices',
		blobKey: 'marin-gas-prices.json',
		cadence: 'daily',
		maxAgeDays: 2,
		observedAt: 'content'
	},
	// Vercel cron weekly; every write is a Redfin snapshot.
	{
		name: 'Housing',
		blobKey: 'marin-housing.json',
		cadence: 'monthly',
		maxAgeDays: 45,
		observedAt: 'upload'
	},
	// GitHub Actions (Playwright via scrape proxy).
	{
		name: 'Marin Coffee Index',
		blobKey: 'marin-coffee-index.json',
		cadence: 'weekly',
		maxAgeDays: 10,
		observedAt: 'content'
	},
	// GitHub Actions; falls back to reference prices without advancing the observation.
	{
		name: 'Grocery Basket',
		blobKey: 'marin-grocery-basket.json',
		cadence: 'weekly',
		maxAgeDays: 10,
		observedAt: 'content'
	},
	// GitHub Actions.
	{
		name: 'Wine Index',
		blobKey: 'marin-wine-index.json',
		cadence: 'weekly',
		maxAgeDays: 10,
		observedAt: 'content'
	},
	// Vercel cron monthly.
	{
		name: 'School Tuition',
		blobKey: 'marin-school-tuition.json',
		cadence: 'monthly',
		maxAgeDays: 45,
		observedAt: 'content'
	},
	// Vercel cron monthly.
	{
		name: 'Fitness',
		blobKey: 'marin-fitness.json',
		cadence: 'monthly',
		maxAgeDays: 45,
		observedAt: 'content'
	},
	// Vercel cron monthly; the newest DMV release, resolved via CKAN package_show.
	{
		name: 'Driveway',
		blobKey: 'marin-driveway.json',
		cadence: 'monthly',
		maxAgeDays: 45,
		observedAt: 'content'
	},
	// Vercel cron weekly; derived from the composite inputs below.
	{
		name: 'Composite Index',
		blobKey: 'marin-composite.json',
		cadence: 'weekly',
		maxAgeDays: 10,
		observedAt: 'content'
	},
	// Vercel cron 4×/day + local LaunchAgent.
	{
		name: 'Police Logs',
		blobKey: 'marin-police-logs.json',
		cadence: 'daily',
		maxAgeDays: 2,
		observedAt: 'upload'
	},
	// Vercel cron every 6h + local LaunchAgent.
	{
		name: 'Activity',
		blobKey: 'marin-activity.json',
		cadence: 'daily',
		maxAgeDays: 2,
		observedAt: 'upload'
	},
	// Vercel cron every 4h; allow a day before flagging.
	{
		name: '311 (SeeClickFix)',
		blobKey: 'marin-311.json',
		cadence: 'daily',
		maxAgeDays: 1,
		observedAt: 'upload'
	},
	// Vercel cron daily.
	{
		name: 'EV Charging',
		blobKey: 'marin-ev-charging.json',
		cadence: 'daily',
		maxAgeDays: 2,
		observedAt: 'content'
	},
	// Vercel cron weekly; re-reading the bundled curated catalog never advances the observation.
	{
		name: 'Strava Segments',
		blobKey: 'strava-segments.json',
		cadence: 'weekly',
		maxAgeDays: 10,
		observedAt: 'content'
	},
	// Vercel cron daily (leaderboards scrape).
	{
		name: 'Strava Events',
		blobKey: 'strava-events.json',
		cadence: 'daily',
		maxAgeDays: 2,
		observedAt: 'content'
	},
	// Composite inputs — GitHub Actions workflows, unmonitored before G0a.
	{
		name: 'Cappuccino',
		blobKey: 'marin-cappuccino.json',
		cadence: 'weekly',
		maxAgeDays: 10,
		observedAt: 'content'
	},
	{
		name: 'Camp Prices',
		blobKey: 'marin-camp-prices.json',
		cadence: 'monthly',
		maxAgeDays: 45,
		observedAt: 'content'
	},
	{
		name: 'Dog Walker',
		blobKey: 'marin-dog-walker.json',
		cadence: 'monthly',
		maxAgeDays: 45,
		observedAt: 'content'
	},
	{
		name: 'Ikon Pass',
		blobKey: 'marin-ikon-pass.json',
		cadence: 'monthly',
		maxAgeDays: 45,
		observedAt: 'content'
	},
	{
		name: 'Rivian Lease',
		blobKey: 'marin-rivian-lease.json',
		cadence: 'monthly',
		maxAgeDays: 45,
		observedAt: 'content'
	}
]);

/**
 * Parts of a source that fail while the source itself still refreshes. Each
 * keeps the report degraded until it is repaired or deliberately retired.
 */
export const KNOWN_SUBSOURCE_FAILURES: readonly SubsourceFailure[] = freeze<SubsourceFailure>([
	{
		name: 'Fairfax Police',
		parent: 'Police Logs',
		problem: 'HTTP 403 on every run (Vercel and local)',
		disposition: 'G0: find an allowed fetch path or retire the agency'
	},
	{
		name: 'Belvedere Police',
		parent: 'Police Logs',
		problem: 'HTTP 403 on every run (Vercel and local)',
		disposition: 'G0: find an allowed fetch path or retire the agency'
	},
	{
		name: 'Marin IJ breaking-news feed',
		parent: 'News feeds',
		problem: 'marinij.com/tag/breaking-news returns 0 items',
		disposition: 'G0: replace with a populated Marin IJ tag feed'
	},
	{
		name: 'Marin IJ emergency feed',
		parent: 'News feeds',
		problem: 'marinij.com/tag/emergency returns 0 items',
		disposition: 'G0: replace with a populated Marin IJ tag feed'
	}
]);

/**
 * Known failures that do not fail /api/health until they expire. Each covers
 * one exact condition; the source still reports its real status. Decided in
 * chat 2026-09-29 (Stuart delegated to Claude + Codex); recorded in the G0
 * runbook. Remove an entry as soon as its source is repaired.
 */
const G0_DECISION = {
	approvedBy: 'Stuart Watson (delegated in chat, 2026-09-29)',
	approvedAt: '2026-09-29T00:00:00.000Z',
	expiresAt: '2026-12-31T23:59:59.000Z'
} as const;

export const ACCEPTED_EXCEPTIONS: readonly AcceptedException[] = freeze<AcceptedException>([
	{
		name: 'Strava Segments',
		condition: 'stale',
		reason: 'GS: logged-out scrape is gone; API rebuild waits on Strava policy answer',
		...G0_DECISION
	},
	{
		name: 'Strava Events',
		condition: 'stale',
		reason: 'GS: logged-out scrape is gone; API rebuild waits on Strava policy answer',
		...G0_DECISION
	},
	{
		name: 'Fairfax Police',
		condition: 'unavailable',
		reason: 'HTTP 403 on every run (Vercel and local); no allowed fetch path yet',
		...G0_DECISION
	},
	{
		name: 'Belvedere Police',
		condition: 'unavailable',
		reason: 'HTTP 403 on every run (Vercel and local); no allowed fetch path yet',
		...G0_DECISION
	}
]);
