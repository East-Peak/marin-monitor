import { describe, expect, it } from 'vitest';
import type { HealthReportJson } from '$lib/api/marin/health-report';
import { SETTLED_HEALTH_LABEL } from './health-labels';
import { failingReads, summarizeHealth } from './health-summary';

const NOW = Date.parse('2026-09-29T15:00:00Z');
const DAY = 86_400_000;
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();
const REPORT: HealthReportJson = {
	status: 'degraded',
	sources: [
		{ name: 'Gas Prices', status: 'ok', reason: null, maxAgeDays: 2, observedAt: iso(DAY / 2) },
		{
			name: 'Wine Index',
			status: 'stale',
			reason: 'older than 10d',
			maxAgeDays: 10,
			observedAt: iso(20 * DAY)
		},
		{ name: 'Housing', status: 'reference', reason: null, maxAgeDays: 45, observedAt: null }
	],
	subsources: [{ name: 'Pacific Sun', parent: 'News feeds', status: 'unavailable' }]
};
const HEALTHY: HealthReportJson = {
	status: 'healthy',
	sources: [REPORT.sources[0]],
	subsources: []
};

describe('summarizeHealth (fails closed)', () => {
	it('checking before the first read; unknown when the read failed with nothing retained', () => {
		expect(summarizeHealth(null, undefined, NOW)).toMatchObject({
			state: 'checking',
			label: 'Checking sources…'
		});
		expect(
			summarizeHealth(
				null,
				{ kind: 'failed', error: 'HTTP 500', retained: false, observedAt: null },
				NOW
			)
		).toMatchObject({
			state: 'unknown',
			label: 'Source health unknown'
		});
	});
	it('counts every source that is not ok or reference, subsources included', () => {
		const s = summarizeHealth(REPORT, { kind: 'live', observedAt: null }, NOW);
		expect(s).toMatchObject({ state: 'degraded', label: 'Sources: 2 degraded' });
		expect(s.degraded.map((e) => e.name)).toEqual(['Wine Index', 'Pacific Sun']);
	});
	it('re-evaluates against the clock: an ok source past its max age counts', () => {
		expect(summarizeHealth(REPORT, { kind: 'live', observedAt: null }, NOW + 2 * DAY).label).toBe(
			'Sources: 3 degraded'
		);
	});
	it('all OK only when G0a says healthy AND nothing is degraded', () => {
		expect(summarizeHealth(HEALTHY, { kind: 'live', observedAt: null }, NOW)).toMatchObject({
			state: 'ok',
			label: 'Sources: all OK',
			degraded: []
		});
	});
	it('a degraded report with nothing listed is never "all OK"', () => {
		const contradictory: HealthReportJson = { ...HEALTHY, status: 'degraded' };
		expect(summarizeHealth(contradictory, { kind: 'live', observedAt: null }, NOW)).toMatchObject({
			state: 'degraded',
			label: 'Sources: degraded',
			degraded: []
		});
	});
	it('a failed refresh over a retained report says it may be out of date', () => {
		expect(
			summarizeHealth(REPORT, { kind: 'failed', error: 'x', retained: true, observedAt: null }, NOW)
		).toMatchObject({
			state: 'unknown',
			label: 'Source health may be out of date'
		});
	});
	it('every settled label, the fail-closed "Sources: degraded" included, matches the pattern production accepts', () => {
		const settled = [
			summarizeHealth(null, { kind: 'failed', error: 'x', retained: false, observedAt: null }, NOW),
			summarizeHealth(REPORT, { kind: 'live', observedAt: null }, NOW),
			summarizeHealth(HEALTHY, { kind: 'live', observedAt: null }, NOW),
			summarizeHealth({ ...HEALTHY, status: 'degraded' }, { kind: 'live', observedAt: null }, NOW),
			summarizeHealth(REPORT, { kind: 'failed', error: 'x', retained: true, observedAt: null }, NOW)
		].map((s) => s.label);
		expect(settled).toContain('Sources: degraded');
		for (const label of settled) expect(label).toMatch(SETTLED_HEALTH_LABEL);
		expect(summarizeHealth(null, undefined, NOW).label).not.toMatch(SETTLED_HEALTH_LABEL);
	});
});

describe('summarizeHealth lists every monitored source for the health dialog (rule 6)', () => {
	it('all: every source and subsource, evaluated, degraded or not', () => {
		const s = summarizeHealth(REPORT, { kind: 'live', observedAt: null }, NOW);
		expect(s.all.length).toBeGreaterThan(s.degraded.length);
		expect(s.all.map((e) => e.name)).toEqual(expect.arrayContaining(s.degraded.map((e) => e.name)));
		expect(summarizeHealth(null, undefined, NOW).all).toEqual([]);
	});
});

describe("the browser's own live reads count too (a healthy server is not a healthy page)", () => {
	const live = { kind: 'live', observedAt: null } as const;
	const names = { weather: 'NWS weather', tides: 'NOAA tides', health: 'Source health' };
	const outcomes = {
		health: live,
		weather: { kind: 'failed', error: 'HTTP 503', retained: false, observedAt: null },
		tides: { kind: 'fallback', dataSource: 'cache', observedAt: null },
		gas: live
	} as const;

	it('failingReads: only a failed or fallback read, never health (its own label) or a live one', () => {
		const reads = failingReads(outcomes, names);
		expect(reads.map((e) => [e.name, e.state])).toEqual([
			['NWS weather', 'unavailable'],
			['NOAA tides', 'stale']
		]);
		expect(failingReads({ health: live, gas: live }, names)).toEqual([]);
		// A dataset without a name is still listed, by its id.
		expect(failingReads({ marine: outcomes.weather }, {}).map((e) => e.name)).toEqual(['marine']);
	});
	it('a healthy G0a report with a failing browser read is never "all OK"', () => {
		const s = summarizeHealth(HEALTHY, live, NOW, failingReads(outcomes, names));
		expect(s).toMatchObject({ state: 'degraded', label: 'Sources: 2 degraded' });
		expect(s.degraded.map((e) => e.name)).toEqual(['NWS weather', 'NOAA tides']);
		expect(s.label).toMatch(SETTLED_HEALTH_LABEL);
	});
	it("the server's degraded sources and the browser's failing reads are counted together, and the dialog lists both", () => {
		const s = summarizeHealth(REPORT, live, NOW, failingReads(outcomes, names));
		expect(s.label).toBe('Sources: 4 degraded');
		expect(s.all.map((e) => e.name)).toEqual(
			expect.arrayContaining(['Gas Prices', 'Wine Index', 'NWS weather', 'NOAA tides'])
		);
	});
	it('with every read live the label is unchanged', () => {
		expect(summarizeHealth(HEALTHY, live, NOW, failingReads({ gas: live }, names)).label).toBe(
			'Sources: all OK'
		);
	});
	it('a stale report stays "may be out of date", the failing reads still listed', () => {
		const s = summarizeHealth(
			HEALTHY,
			{ kind: 'failed', error: 'x', retained: true, observedAt: null },
			NOW,
			failingReads(outcomes, names)
		);
		expect(s.label).toBe('Source health may be out of date');
		expect(s.all.map((e) => e.name)).toContain('NWS weather');
	});
});
