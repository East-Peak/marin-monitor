import { describe, expect, it } from 'vitest';
import {
	ACCEPTED_EXCEPTIONS,
	KNOWN_SUBSOURCE_FAILURES,
	SOURCE_INVENTORY,
	acceptedExceptions,
	sourceInventory
} from './inventory';

// The inventory is the contract for "what must be healthy". Dropping a source
// is the cheapest way to make /api/health go green, so every name is pinned.
const EXPECTED_SOURCES = [
	'Gas Prices',
	'Housing',
	'Marin Coffee Index',
	'Grocery Basket',
	'Wine Index',
	'School Tuition',
	'Fitness',
	'Driveway',
	'Composite Index',
	'Police Logs',
	'Activity',
	'311 (SeeClickFix)',
	'EV Charging',
	'News Snapshot',
	// Composite inputs that were never monitored before G0a
	'Cappuccino',
	'Camp Prices',
	'Dog Walker',
	'Ikon Pass',
	'Rivian Lease'
];

describe('SOURCE_INVENTORY', () => {
	it('lists exactly the expected sources, in order', () => {
		expect(SOURCE_INVENTORY.map((s) => s.name)).toEqual(EXPECTED_SOURCES);
	});

	it('watches the two Strava sources, after EV Charging, only while Strava is on', () => {
		expect(sourceInventory(false).map((s) => s.name)).toEqual(EXPECTED_SOURCES);
		const on = sourceInventory(true).map((s) => s.name);
		expect(on).toEqual([
			...EXPECTED_SOURCES.slice(0, EXPECTED_SOURCES.indexOf('EV Charging') + 1),
			'Strava Segments',
			'Strava Events',
			...EXPECTED_SOURCES.slice(EXPECTED_SOURCES.indexOf('EV Charging') + 1)
		]);
		const strava = sourceInventory(true).filter((s) => s.name.startsWith('Strava'));
		expect(strava.map((s) => [s.blobKey, s.observedAt])).toEqual([
			['strava-segments.json', 'content'],
			['strava-events.json', 'content']
		]);
		expect(Object.isFrozen(sourceInventory(true))).toBe(true);
	});

	it('is frozen, including each entry', () => {
		expect(Object.isFrozen(SOURCE_INVENTORY)).toBe(true);
		for (const source of SOURCE_INVENTORY) expect(Object.isFrozen(source)).toBe(true);
	});

	it('has unique names and blob keys', () => {
		expect(new Set(SOURCE_INVENTORY.map((s) => s.name)).size).toBe(SOURCE_INVENTORY.length);
		expect(new Set(SOURCE_INVENTORY.map((s) => s.blobKey)).size).toBe(SOURCE_INVENTORY.length);
	});

	it('maps the composite inputs to the blob keys their producers write', () => {
		const keyOf = (name: string) => SOURCE_INVENTORY.find((s) => s.name === name)?.blobKey;
		expect(keyOf('Cappuccino')).toBe('marin-cappuccino.json');
		expect(keyOf('Camp Prices')).toBe('marin-camp-prices.json');
		expect(keyOf('Dog Walker')).toBe('marin-dog-walker.json');
		expect(keyOf('Ikon Pass')).toBe('marin-ikon-pass.json');
		expect(keyOf('Rivian Lease')).toBe('marin-rivian-lease.json');
	});

	it('declares no reference data — Driveway is judged by its live DMV observation, never as static', () => {
		expect(SOURCE_INVENTORY.filter((s) => s.reference)).toEqual([]);
		const driveway = SOURCE_INVENTORY.find((s) => s.name === 'Driveway');
		expect(driveway?.observedAt).toBe('content');
	});

	it('reads live-scrape sources by their content observation, never by upload time', () => {
		const contentSources = SOURCE_INVENTORY.filter((s) => s.observedAt === 'content').map(
			(s) => s.name
		);
		for (const name of [
			'Marin Coffee Index',
			'Grocery Basket',
			'EV Charging',
			'News Snapshot',
			'Driveway',
			'Cappuccino',
			'Camp Prices',
			'Dog Walker',
			'Ikon Pass',
			'Rivian Lease'
		]) {
			expect(contentSources).toContain(name);
		}
	});

	it('watches the news snapshot at the key the producer writes', async () => {
		const { NEWS_SNAPSHOT_KEY } = await import('$lib/server/news/snapshot-store');
		const news = SOURCE_INVENTORY.find((s) => s.name === 'News Snapshot');
		expect(news).toMatchObject({ blobKey: NEWS_SNAPSHOT_KEY, observedAt: 'content' });
		expect(news?.maxAgeDays).toBeLessThanOrEqual(0.25);
	});

	it('gives every source a positive max age', () => {
		for (const source of SOURCE_INVENTORY) expect(source.maxAgeDays).toBeGreaterThan(0);
	});
});

describe('KNOWN_SUBSOURCE_FAILURES', () => {
	it('records each audited subsource failure with a disposition', () => {
		expect(KNOWN_SUBSOURCE_FAILURES.map((f) => f.name)).toEqual([]);
		for (const failure of KNOWN_SUBSOURCE_FAILURES) {
			expect(failure.problem).not.toBe('');
			expect(failure.disposition).not.toBe('');
		}
		expect(Object.isFrozen(KNOWN_SUBSOURCE_FAILURES)).toBe(true);
	});
});

describe('ACCEPTED_EXCEPTIONS', () => {
	it('accepts nothing while Strava is mothballed', () => {
		expect(ACCEPTED_EXCEPTIONS).toEqual([]);
		expect(acceptedExceptions(false)).toEqual([]);
		expect(Object.isFrozen(ACCEPTED_EXCEPTIONS)).toBe(true);
	});

	it('restores the G0 decisions (2026-09-29) with Strava on, each for one condition, expiring 2026-12-31', () => {
		expect(acceptedExceptions(true).map((e) => [e.name, e.condition])).toEqual([
			['Strava Segments', 'stale'],
			['Strava Events', 'stale']
		]);
		for (const exception of acceptedExceptions(true)) {
			expect(exception.expiresAt).toBe('2026-12-31T23:59:59.000Z');
			expect(exception.reason).not.toBe('');
			expect(exception.approvedBy).not.toBe('');
		}
		expect(Object.isFrozen(acceptedExceptions(true))).toBe(true);
	});

	it('only names real sources or declared subsource failures', () => {
		for (const enabled of [false, true]) {
			const known = new Set([
				...sourceInventory(enabled).map((s) => s.name),
				...KNOWN_SUBSOURCE_FAILURES.map((f) => f.name)
			]);
			for (const exception of acceptedExceptions(enabled)) {
				expect(known.has(exception.name)).toBe(true);
			}
		}
	});
});
