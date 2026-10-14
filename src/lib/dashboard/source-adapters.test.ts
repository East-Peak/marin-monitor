import { describe, expect, expectTypeOf, it } from 'vitest';
import type { SourceStatus } from '$lib/server/health/evaluate';
import type { NewsSnapshotView } from '$lib/news/snapshot';
import { SOURCE_INVENTORY } from '$lib/server/health/inventory';
import { describePresentation, presentSection, type SourceState } from './source-status';
import {
	datasetEntry,
	fromHealthSource,
	fromHealthSubsource,
	fromLoaderPart,
	fromSnapshotRead,
	fromSnapshotSource,
	PART_OBSERVATION_MAX_AGE_MS,
	STATUS_AWARE_PARTS,
	type HealthSourceJson
} from './source-adapters';

const NOW = Date.parse('2026-09-29T18:00:00.000Z');
const DAY = 86_400_000;
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();
type Summary = NewsSnapshotView['sources'][number];
const src = (over: Partial<Summary>): Summary => ({
	id: 'marin-ij',
	name: 'Marin IJ',
	category: 'local',
	verification: 'local_media',
	status: 'ok',
	lastAttemptAt: iso(60_000),
	lastSuccessAt: iso(60_000),
	lastError: null,
	consecutiveFailures: 0,
	itemCount: 3,
	...over
});

describe('G0a alignment', () => {
	it('the dashboard states are exactly the health evaluator states', () => {
		expectTypeOf<SourceState>().toEqualTypeOf<SourceStatus>();
	});
});

describe('fromSnapshotSource (retention adapter; provenance from the producer)', () => {
	it('ok and empty are ok, observed at their last success, with the 45 min rule', () => {
		for (const status of ['ok', 'empty'] as const) {
			expect(fromSnapshotSource(src({ status, itemCount: status === 'ok' ? 3 : 0 }))).toEqual({
				id: 'news:marin-ij',
				name: 'Marin IJ',
				state: 'ok',
				observedAt: NOW - 60_000,
				maxAgeMs: 45 * 60_000,
				detail: null
			});
		}
	});
	it('retained is stale as of its last success; failed is unavailable; both carry the error', () => {
		const retained = fromSnapshotSource(
			src({
				status: 'retained',
				lastSuccessAt: iso(3 * 3_600_000),
				lastError: 'http-status: HTTP 404',
				consecutiveFailures: 4
			})
		);
		expect(retained).toMatchObject({
			state: 'stale',
			observedAt: NOW - 3 * 3_600_000,
			detail: 'http-status: HTTP 404'
		});
		const failed = fromSnapshotSource(
			src({
				status: 'failed',
				lastSuccessAt: null,
				lastError: 'timeout',
				consecutiveFailures: 2,
				itemCount: 0
			})
		);
		expect(failed).toMatchObject({ state: 'unavailable', observedAt: null, detail: 'timeout' });
	});
});

describe('fromSnapshotRead', () => {
	const view = { lastSuccessfulScrapeAt: iso(10 * 60_000) } as unknown as NewsSnapshotView;
	it('loading before the first read; unavailable when no view was ever applied', () => {
		expect(fromSnapshotRead(undefined, null).state).toBe('loading');
		expect(
			fromSnapshotRead({ ok: false, error: 'news-snapshot: unknown (read-failed)', at: NOW }, null)
		).toMatchObject({
			state: 'unavailable',
			detail: 'news-snapshot: unknown (read-failed)'
		});
	});
	it("ok carries the snapshot's own observation time; a failed re-read keeps the applied view as stale", () => {
		expect(fromSnapshotRead({ ok: true, at: NOW, observedAt: null }, view)).toMatchObject({
			state: 'ok',
			observedAt: NOW - 10 * 60_000,
			maxAgeMs: 45 * 60_000
		});
		expect(fromSnapshotRead({ ok: false, error: 'x', at: NOW }, view)).toMatchObject({
			state: 'stale',
			observedAt: NOW - 10 * 60_000
		});
	});
});

describe('fromLoaderPart (transport success is not freshness; Codex r1 #2)', () => {
	it('a successful read with no payload time — even a stale-cache earthquake list or a days-old 311 blob served with HTTP 200 — is unknown', () => {
		for (const part of ['earthquakes', 'seeclickfix'] as const) {
			expect(fromLoaderPart(part, { ok: true, at: NOW, observedAt: null }, true)).toEqual({
				id: `part:${part}`,
				name: part === 'earthquakes' ? 'USGS earthquakes' : 'Fix It Marin (311)',
				state: 'unknown',
				observedAt: null,
				maxAgeMs: null,
				detail: 'fetched; data age not reported'
			});
		}
	});
	it('a failure after a success keeps last-good as stale with an unknown age; a first failure is unavailable', () => {
		expect(
			fromLoaderPart('seeclickfix', { ok: false, error: 'HTTP 500', at: NOW }, true)
		).toMatchObject({ state: 'stale', observedAt: null, detail: 'HTTP 500' });
		expect(
			fromLoaderPart('earthquakes', { ok: false, error: 'HTTP 500', at: NOW }, false)
		).toMatchObject({ state: 'unavailable' });
		expect(fromLoaderPart('earthquakes', undefined, false).state).toBe('loading');
	});
	it('parts that swallow failures are unknown on success; a deadline failure still shows', () => {
		for (const part of [
			'nps',
			'transit',
			'sheriff-blotter',
			'police-logs',
			'supplemental-activity'
		] as const) {
			expect(fromLoaderPart(part, { ok: true, at: NOW, observedAt: null }, true)).toMatchObject({
				state: 'unknown',
				detail: 'failures not reported by this source'
			});
		}
		expect(
			fromLoaderPart('transit', { ok: false, error: 'timed out after 15000 ms', at: NOW }, false)
				.state
		).toBe('unavailable');
	});
});

describe('datasetEntry (the value carries its own provenance; Codex r1 #3)', () => {
	const MAX = 2 * DAY;
	it('loading until the first fetch settles', () => {
		expect(datasetEntry('gas', 'Gas prices', undefined, MAX).state).toBe('loading');
	});
	it("a live value is judged by its own scrape time and the policy's max age", () => {
		expect(datasetEntry('gas', 'Gas prices', { kind: 'live', observedAt: NOW - DAY }, MAX)).toEqual(
			{
				id: 'dataset:gas',
				name: 'Gas prices',
				state: 'ok',
				observedAt: NOW - DAY,
				maxAgeMs: MAX,
				detail: null
			}
		);
	});
	it('a live value without its own scrape time is unknown (the clock rule fails closed)', () => {
		expect(
			datasetEntry('gas', 'Gas prices', { kind: 'live', observedAt: null }, MAX)
		).toMatchObject({ state: 'ok', observedAt: null });
		// effectiveState turns this into 'unknown'; asserted in the controller and presentation tests.
	});
	it('a served fallback is stale; a retained value keeps the time it arrived with, never a newer one', () => {
		expect(
			datasetEntry(
				'gas',
				'Gas prices',
				{ kind: 'fallback', dataSource: 'static-fallback', observedAt: NOW - 9 * DAY },
				MAX
			)
		).toMatchObject({
			state: 'stale',
			observedAt: NOW - 9 * DAY,
			detail: 'served from static-fallback'
		});
		expect(
			datasetEntry(
				'gas',
				'Gas prices',
				{ kind: 'failed', error: 'HTTP 503', retained: true, observedAt: NOW - 3 * DAY },
				MAX
			)
		).toMatchObject({
			state: 'stale',
			observedAt: NOW - 3 * DAY,
			detail: 'HTTP 503'
		});
		expect(
			datasetEntry(
				'gas',
				'Gas prices',
				{ kind: 'failed', error: 'HTTP 503', retained: false, observedAt: null },
				MAX
			)
		).toMatchObject({ state: 'unavailable' });
	});
});

describe('G0a health JSON (for the health indicator)', () => {
	const gas: HealthSourceJson = {
		name: 'Gas Prices',
		status: 'ok',
		reason: null,
		maxAgeDays: 2,
		observedAt: iso(3_600_000)
	};
	it('maps a source with its day-based max age for clock re-evaluation', () => {
		expect(fromHealthSource(gas)).toEqual({
			id: 'health:Gas Prices',
			name: 'Gas Prices',
			state: 'ok',
			observedAt: NOW - 3_600_000,
			maxAgeMs: 2 * DAY,
			detail: null
		});
	});
	it('a malformed observation time is unknown (null), never NaN', () => {
		expect(fromHealthSource({ ...gas, observedAt: 'not a time' }).observedAt).toBeNull();
	});
	it('reference data has no age rule; an accepted exception is named with its end date', () => {
		expect(fromHealthSource({ ...gas, status: 'reference', observedAt: null }).maxAgeMs).toBeNull();
		const accepted = fromHealthSource({
			...gas,
			name: 'Strava Segments',
			status: 'stale',
			reason: 'older than 10d',
			accepted: { reason: 'GS: waiting on Strava', expiresAt: '2026-12-31T23:59:59.000Z' }
		});
		expect(accepted.state).toBe('stale');
		expect(accepted.detail).toBe('Known issue until Dec 31: GS: waiting on Strava');
	});
	it('a failing news feed (subsource) is unavailable and names its parent', () => {
		expect(
			fromHealthSubsource({ name: 'Pacific Sun', parent: 'News feeds', status: 'unavailable' })
		).toMatchObject({
			id: 'health:News feeds/Pacific Sun',
			state: 'unavailable',
			detail: 'Part of News feeds'
		});
	});
});

describe('the parts that carry a payload time (map coverage label)', () => {
	it('are exactly the status-aware adapter parts: earthquakes and seeclickfix', () => {
		expect(new Set([...STATUS_AWARE_PARTS].filter((p) => p !== 'snapshot'))).toEqual(
			new Set(['earthquakes', 'seeclickfix'])
		);
	});
});

describe('fromLoaderPart reads the payload’s own time (map coverage label)', () => {
	it('a success with a payload time is ok with its part’s max age', () => {
		expect(
			fromLoaderPart('seeclickfix', { ok: true, at: NOW, observedAt: NOW - 3 * 3_600_000 }, true)
		).toEqual({
			id: 'part:seeclickfix',
			name: 'Fix It Marin (311)',
			state: 'ok',
			observedAt: NOW - 3 * 3_600_000,
			maxAgeMs: DAY,
			detail: null
		});
		expect(
			fromLoaderPart('earthquakes', { ok: true, at: NOW, observedAt: NOW - 60_000 }, true)
		).toMatchObject({ state: 'ok', observedAt: NOW - 60_000, maxAgeMs: 30 * 60_000 });
	});
	it('311’s max age is G0a’s own (pinned to SOURCE_INVENTORY)', () => {
		const policy = SOURCE_INVENTORY.find((p) => p.name === '311 (SeeClickFix)');
		expect(PART_OBSERVATION_MAX_AGE_MS.seeclickfix).toBe(policy!.maxAgeDays * DAY);
	});
	it('a failure after a success keeps the last good read’s time; a first failure has none', () => {
		const t = NOW - 2 * 3_600_000;
		expect(
			fromLoaderPart('seeclickfix', { ok: false, error: 'HTTP 503', at: NOW }, true, t)
		).toMatchObject({ state: 'stale', observedAt: t, detail: 'HTTP 503' });
		expect(
			fromLoaderPart('earthquakes', { ok: false, error: 'HTTP 503', at: NOW }, false, null)
		).toMatchObject({ state: 'unavailable', observedAt: null });
	});
	it('the status line: timed reads say nothing; an old 311 blob is "out of date", never "unverified"', () => {
		const ok311 = fromLoaderPart(
			'seeclickfix',
			{ ok: true, at: NOW, observedAt: NOW - 3 * 3_600_000 },
			true
		);
		const okQ = fromLoaderPart(
			'earthquakes',
			{ ok: true, at: NOW, observedAt: NOW - 60_000 },
			true
		);
		expect(
			describePresentation(presentSection([ok311, okQ], { total: 2, matching: 2 }, NOW), NOW)
		).toBeNull();
		const old311 = fromLoaderPart(
			'seeclickfix',
			{ ok: true, at: NOW, observedAt: NOW - 25 * 3_600_000 },
			true
		);
		const line = describePresentation(
			presentSection([old311, okQ], { total: 2, matching: 2 }, NOW),
			NOW
		);
		expect(line).toBe('Partial coverage · Fix It Marin (311) out of date');
	});
	it('negative control: a success with no payload time still reads "unverified"', () => {
		const e = fromLoaderPart('earthquakes', { ok: true, at: NOW, observedAt: null }, true);
		expect(describePresentation(presentSection([e], { total: 1, matching: 1 }, NOW), NOW)).toBe(
			'Partial coverage · USGS earthquakes unverified'
		);
	});
});
