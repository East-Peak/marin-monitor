import { describe, expect, it } from 'vitest';
import { evaluate, type HealthInventory, type Observation } from './evaluate';

const NOW = new Date('2026-09-28T12:00:00.000Z');
const DAY_MS = 86_400_000;
const daysAgo = (days: number, now = NOW) => new Date(now.getTime() - days * DAY_MS).toISOString();

const LIVE = {
	name: 'Live',
	blobKey: 'live.json',
	cadence: 'weekly',
	maxAgeDays: 10,
	observedAt: 'content'
} as const;
const SNAPSHOT = {
	name: 'Snapshot',
	blobKey: 'snapshot.json',
	cadence: 'daily',
	maxAgeDays: 2,
	observedAt: 'upload'
} as const;
const REFERENCE = {
	name: 'Reference',
	blobKey: 'reference.json',
	cadence: 'monthly',
	maxAgeDays: 45,
	observedAt: 'content',
	reference: true
} as const;

function inventory(...sources: HealthInventory['sources']): HealthInventory {
	return { sources, subsourceFailures: [] };
}

function found(contentTimestamp: unknown, uploadedAt: string | null = daysAgo(0)): Observation {
	return { kind: 'found', uploadedAt, contentTimestamp };
}

function resultFor(report: ReturnType<typeof evaluate>, name: string) {
	return report.sources.find((s) => s.name === name);
}

describe('evaluate', () => {
	it('is ok and healthy when the observation is inside maxAge', () => {
		const report = evaluate(inventory(LIVE), { Live: found(daysAgo(3)) }, NOW);
		expect(resultFor(report, 'Live')).toMatchObject({ status: 'ok', ageDays: 3, reason: null });
		expect(report.status).toBe('healthy');
	});

	it('is stale when content is old even though the blob was just uploaded', () => {
		const report = evaluate(inventory(LIVE), { Live: found(daysAgo(99), daysAgo(0)) }, NOW);
		expect(resultFor(report, 'Live')).toMatchObject({ status: 'stale', ageDays: 99 });
		expect(report.status).toBe('degraded');
	});

	it('keeps a failed refresh stale: last-good data retained with an old observation', () => {
		// e.g. grocery wrote reference prices today but lastSuccessfulScrapeAt stayed at June
		const report = evaluate(inventory(LIVE), { Live: found(daysAgo(10.1), daysAgo(0.01)) }, NOW);
		expect(resultFor(report, 'Live')?.status).toBe('stale');
	});

	it('crosses into stale purely because the clock moved, with no refetch', () => {
		const observations = { Live: found(daysAgo(9)) };
		const later = new Date(NOW.getTime() + 2 * DAY_MS);
		expect(resultFor(evaluate(inventory(LIVE), observations, NOW), 'Live')?.status).toBe('ok');
		expect(resultFor(evaluate(inventory(LIVE), observations, later), 'Live')?.status).toBe('stale');
	});

	it('uses upload time for upload-observed sources', () => {
		const fresh = evaluate(inventory(SNAPSHOT), { Snapshot: found(null, daysAgo(1)) }, NOW);
		const stale = evaluate(inventory(SNAPSHOT), { Snapshot: found(daysAgo(0), daysAgo(3)) }, NOW);
		expect(resultFor(fresh, 'Snapshot')?.status).toBe('ok');
		expect(resultFor(stale, 'Snapshot')?.status).toBe('stale');
	});

	it('is unknown, not ok, when the observation timestamp is missing', () => {
		const report = evaluate(inventory(LIVE), { Live: found(null) }, NOW);
		expect(resultFor(report, 'Live')).toMatchObject({ status: 'unknown', ageDays: null });
		expect(report.status).toBe('degraded');
	});

	it.each([['not a date'], [''], [12345], [{}]])(
		'is unknown, not ok, for a malformed timestamp (%j)',
		(bad) => {
			const report = evaluate(inventory(LIVE), { Live: found(bad) }, NOW);
			expect(resultFor(report, 'Live')?.status).toBe('unknown');
			expect(resultFor(report, 'Live')?.reason).toMatch(/malformed/);
		}
	);

	it('is unknown, not ok, for a timestamp in the future', () => {
		const future = new Date(NOW.getTime() + 60 * 60_000).toISOString();
		const report = evaluate(inventory(LIVE), { Live: found(future) }, NOW);
		expect(resultFor(report, 'Live')?.status).toBe('unknown');
		expect(resultFor(report, 'Live')?.reason).toMatch(/future/);
	});

	it.each([
		['2026-02-30T12:00:00.000Z'],
		['2026-09-28'],
		['Sep 27 2026'],
		['2026-09-27T25:00:00Z']
	])('is unknown for a non-ISO or impossible calendar timestamp (%s)', (bad) => {
		const report = evaluate(inventory(LIVE), { Live: found(bad) }, NOW);
		expect(resultFor(report, 'Live')?.status).toBe('unknown');
	});

	it('refuses an invalid clock rather than classifying against it', () => {
		expect(() => evaluate(inventory(LIVE), { Live: found(daysAgo(1)) }, new Date('nope'))).toThrow(
			/invalid clock/
		);
	});

	it('tolerates small clock skew', () => {
		const skewed = new Date(NOW.getTime() + 60_000).toISOString();
		const report = evaluate(inventory(LIVE), { Live: found(skewed) }, NOW);
		expect(resultFor(report, 'Live')?.status).toBe('ok');
	});

	it('is unavailable when the blob is missing', () => {
		const report = evaluate(inventory(LIVE), { Live: { kind: 'missing' } }, NOW);
		expect(resultFor(report, 'Live')?.status).toBe('unavailable');
	});

	it('is unknown when the blob could not be read', () => {
		const report = evaluate(inventory(LIVE), { Live: { kind: 'error' } }, NOW);
		expect(resultFor(report, 'Live')?.status).toBe('unknown');
	});

	it('is unknown when a source has no observation at all', () => {
		const report = evaluate(inventory(LIVE), {}, NOW);
		expect(resultFor(report, 'Live')?.status).toBe('unknown');
	});

	it('reports declared reference data as reference regardless of age, and it stays acceptable', () => {
		const report = evaluate(inventory(REFERENCE), { Reference: found(daysAgo(900)) }, NOW);
		expect(resultFor(report, 'Reference')?.status).toBe('reference');
		expect(report.status).toBe('healthy');
	});

	it('does not accept reference data that is missing or unreadable', () => {
		const missing = evaluate(inventory(REFERENCE), { Reference: { kind: 'missing' } }, NOW);
		const unreadable = evaluate(inventory(REFERENCE), { Reference: { kind: 'error' } }, NOW);
		expect(resultFor(missing, 'Reference')?.status).toBe('unavailable');
		expect(resultFor(unreadable, 'Reference')?.status).toBe('unknown');
		expect(missing.status).toBe('degraded');
		expect(unreadable.status).toBe('degraded');
	});

	it('degrades overall on a partial failure: fresh parent, failed subsource', () => {
		const report = evaluate(
			{
				sources: [LIVE],
				subsourceFailures: [
					{ name: 'Branch', parent: 'Live', problem: 'HTTP 403', disposition: 'repair in G0' }
				]
			},
			{ Live: found(daysAgo(1)) },
			NOW
		);
		expect(resultFor(report, 'Live')?.status).toBe('ok');
		expect(report.subsources).toEqual([
			{
				name: 'Branch',
				parent: 'Live',
				status: 'unavailable',
				problem: 'HTTP 403',
				disposition: 'repair in G0'
			}
		]);
		expect(report.status).toBe('degraded');
	});

	it('treats an empty inventory as degraded — nothing monitored is not healthy', () => {
		expect(evaluate(inventory(), {}, NOW).status).toBe('degraded');
	});

	it('counts statuses in the summary', () => {
		const report = evaluate(
			inventory(LIVE, SNAPSHOT, REFERENCE),
			{ Live: found(daysAgo(1)), Snapshot: { kind: 'missing' }, Reference: found(daysAgo(1)) },
			NOW
		);
		expect(report.summary).toEqual({
			total: 3,
			ok: 1,
			stale: 0,
			unavailable: 1,
			reference: 1,
			unknown: 0
		});
	});

	it('is deterministic for a fixed clock', () => {
		const obs = { Live: found(daysAgo(4)) };
		expect(evaluate(inventory(LIVE), obs, NOW)).toEqual(evaluate(inventory(LIVE), obs, NOW));
	});
});
