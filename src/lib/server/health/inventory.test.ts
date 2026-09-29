import { describe, expect, it } from 'vitest';
import { ACCEPTED_EXCEPTIONS, KNOWN_SUBSOURCE_FAILURES, SOURCE_INVENTORY } from './inventory';

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
	'Strava Segments',
	'Strava Events',
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
			'Strava Segments',
			'Strava Events',
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

	it('gives every source a positive max age', () => {
		for (const source of SOURCE_INVENTORY) expect(source.maxAgeDays).toBeGreaterThan(0);
	});
});

describe('KNOWN_SUBSOURCE_FAILURES', () => {
	it('records each audited subsource failure with a disposition', () => {
		expect(KNOWN_SUBSOURCE_FAILURES.map((f) => f.name)).toEqual([
			'Fairfax Police',
			'Belvedere Police',
			'Marin IJ breaking-news feed',
			'Marin IJ emergency feed'
		]);
		for (const failure of KNOWN_SUBSOURCE_FAILURES) {
			expect(failure.problem).not.toBe('');
			expect(failure.disposition).not.toBe('');
		}
		expect(Object.isFrozen(KNOWN_SUBSOURCE_FAILURES)).toBe(true);
	});
});

describe('ACCEPTED_EXCEPTIONS', () => {
	it('accepts exactly the G0 decisions (2026-09-29), each for one condition, expiring 2026-12-31', () => {
		expect(ACCEPTED_EXCEPTIONS.map((e) => [e.name, e.condition])).toEqual([
			['Strava Segments', 'stale'],
			['Strava Events', 'stale'],
			['Fairfax Police', 'unavailable'],
			['Belvedere Police', 'unavailable']
		]);
		for (const exception of ACCEPTED_EXCEPTIONS) {
			expect(exception.expiresAt).toBe('2026-12-31T23:59:59.000Z');
			expect(exception.reason).not.toBe('');
			expect(exception.approvedBy).not.toBe('');
		}
		expect(Object.isFrozen(ACCEPTED_EXCEPTIONS)).toBe(true);
	});

	it('only names real sources or declared subsource failures', () => {
		const known = new Set([
			...SOURCE_INVENTORY.map((s) => s.name),
			...KNOWN_SUBSOURCE_FAILURES.map((f) => f.name)
		]);
		for (const exception of ACCEPTED_EXCEPTIONS) expect(known.has(exception.name)).toBe(true);
	});
});
