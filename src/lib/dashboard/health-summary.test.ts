import { describe, expect, it } from 'vitest';
import type { HealthReportJson } from '$lib/api/marin/health-report';
import { SETTLED_HEALTH_LABEL } from './health-labels';
import { summarizeHealth } from './health-summary';

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
		expect(summarizeHealth(HEALTHY, { kind: 'live', observedAt: null }, NOW)).toEqual({
			state: 'ok',
			label: 'Sources: all OK',
			degraded: []
		});
	});
	it('a degraded report with nothing listed is never "all OK"', () => {
		const contradictory: HealthReportJson = { ...HEALTHY, status: 'degraded' };
		expect(summarizeHealth(contradictory, { kind: 'live', observedAt: null }, NOW)).toEqual({
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
