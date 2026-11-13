// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseBlsSeries } from '../../../scripts/shared/bls-series.mjs';
import { groceryInflation } from './inflation';

const parsed = parseBlsSeries(
	JSON.parse(readFileSync('tests/fixtures/costdata/bls-cuurs49bsaf11.json', 'utf8'))
);
/** The blob as the sync writes it, read Nov 12, 2026. */
const blob = (over: Record<string, unknown> = {}) => ({
	current: {
		timestamp: '2026-11-12T15:00:00.000Z',
		lastSuccessfulScrapeAt: '2026-11-12T15:00:00.000Z',
		url: 'https://data.bls.gov/timeseries/CUURS49BSAF11',
		...parsed,
		...over
	}
});
const NOW = new Date('2026-11-13T12:00:00Z');

describe('the lead: the newest month with a same month a year earlier', () => {
	const v = groceryInflation(blob(), NOW);
	if (v.status !== 'ok') throw new Error('expected ok');

	it('is September 2026, +4.4%, because October 2025 was never published', () => {
		expect(v.lead.label).toBe('Sep 2026');
		expect(v.lead.pct).toBeCloseTo(4.38, 2);
		expect(v.lead.against).toBe('Sep 2025');
	});

	it('says October’s own 12-month change is unavailable, with BLS’s reason', () => {
		expect(v.latestYoy).toEqual({
			label: 'Oct 2026',
			pct: null,
			reason: 'BLS published no Oct 2025: Data unavailable due to the 2025 lapse in appropriations'
		});
	});

	it('shows the latest month as an index point with its change on the month before', () => {
		expect(v.latest.label).toBe('Oct 2026');
		expect(v.latest.value).toBe(363.564);
		expect(v.latest.monthPct).toBeCloseTo(2.08, 2);
		expect(v.latest.monthLabel).toBe('Sep 2026');
	});

	it('keeps the gap in the series as a null, never a value', () => {
		const oct25 = v.observations.find((o) => o.period === '2025-10');
		expect(oct25).toMatchObject({ value: null });
		expect(v.observations).toHaveLength(46);
	});

	it('names its source and when we checked, apart from its month', () => {
		expect(v.checkedAt).toBe('2026-11-12T15:00:00.000Z');
		expect(v.seriesId).toBe('CUURS49BSAF11');
	});
});

describe('when the newest month does compare', () => {
	it('leads with it (Nov 2026 against Nov 2025)', () => {
		const obs = [...parsed.observations, { period: '2026-11', value: 351.0 }];
		const v = groceryInflation(
			blob({ observations: obs, period: 'November 2026', periodEnd: '2026-11-30T00:00:00.000Z' }),
			new Date('2026-12-14T00:00:00Z')
		);
		if (v.status !== 'ok') throw new Error('expected ok');
		expect(v.lead.label).toBe('Nov 2026');
		expect(v.lead.pct).toBeCloseTo((351.0 / 335.863 - 1) * 100, 6);
		expect(v.latestYoy.pct).not.toBeNull();
	});
});

describe('when it cannot be vouched for', () => {
	it('is unavailable with no blob, a bad blob or no observations, and carries no figure', () => {
		for (const raw of [null, {}, { current: null }, blob({ observations: [] }), 'x']) {
			const v = groceryInflation(raw, NOW);
			expect(v.status).toBe('unavailable');
			expect(JSON.stringify(v)).not.toMatch(/"lead"|"latest"/);
		}
	});

	it('is unavailable when a value is not a positive number', () => {
		const bad = [...parsed.observations.slice(0, -1), { period: '2026-10', value: 0 }];
		expect(groceryInflation(blob({ observations: bad }), NOW).status).toBe('unavailable');
	});

	it('is stale past the series’ max age, even though we fetched it today', () => {
		const v = groceryInflation(
			blob({ lastSuccessfulScrapeAt: '2027-02-01T00:00:00.000Z' }),
			new Date('2027-02-01T12:00:00Z')
		);
		expect(v.status).toBe('stale');
		if (v.status === 'stale')
			expect(v.lastGood).toEqual({ period: 'Oct 2026', checkedAt: '2027-02-01T00:00:00.000Z' });
	});

	it('is unavailable with no year-over-year pair at all', () => {
		const v = groceryInflation(
			blob({ observations: [{ period: '2026-10', value: 363.5 }], gaps: [] }),
			NOW
		);
		expect(v.status).toBe('unavailable');
	});
});
