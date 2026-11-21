// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseBlsSeries } from '../../../scripts/shared/bls-series.mjs';
import { groceryInflation, type GroceryInflation } from './inflation';
import {
	inflationChart,
	inflationStops,
	isolated,
	monthSpan,
	type InflationPoint
} from './inflation-chart';

const parsed = parseBlsSeries(
	JSON.parse(readFileSync('tests/fixtures/costdata/bls-cuurs49bsaf11.json', 'utf8'))
);
const NOW = new Date('2026-11-13T12:00:00Z');
function ok(over: Record<string, unknown> = {}, now = NOW) {
	const v = groceryInflation(
		{
			current: {
				lastSuccessfulScrapeAt: '2026-11-12T15:00:00.000Z',
				url: 'https://data.bls.gov/timeseries/CUURS49BSAF11',
				...parsed,
				...over
			}
		},
		now
	);
	if (v.status !== 'ok') throw new Error(`expected ok, got ${v.status}`);
	return v as GroceryInflation & { status: 'ok' };
}

describe('monthSpan', () => {
	it('names the year once inside one year, both years across two', () => {
		expect(monthSpan('Sep 2026', 'Oct 2026')).toBe('Sep → Oct 2026');
		expect(monthSpan('Dec 2025', 'Jan 2026')).toBe('Dec 2025 → Jan 2026');
		expect(monthSpan('Sep 2025', 'Sep 2026')).toBe('Sep 2025 → Sep 2026');
	});
});

describe('the CPI tile’s chart (COSTX1)', () => {
	const c = inflationChart(ok());

	it('heads with the newest published 12-month change and its two months (R5)', () => {
		expect(c.headline.text).toBe('+4.4%');
		expect(c.headline.span).toBe('Sep 2025 → Sep 2026');
	});

	it('keeps BLS’s reason when the newest month has no 12-month change (R5)', () => {
		expect(c.newestNote).toBe(
			'Oct 2026 index 363.6: its 12-month change isn’t published. BLS published no Oct 2025: Data unavailable due to the 2025 lapse in appropriations.'
		);
	});

	it('advances on its own when a newer month with a year-earlier month arrives (R5)', () => {
		const next = inflationChart(
			ok(
				{
					observations: [...parsed.observations, { period: '2026-11', value: 370.1 }],
					periodEnd: '2026-11-30'
				},
				new Date('2026-12-13T12:00:00Z')
			)
		);
		expect(next.headline.span).toBe('Nov 2025 → Nov 2026');
		expect(next.newestNote).toBeNull();
		expect(next.month?.label).toBe('Oct → Nov 2026, not seasonally adjusted');
	});

	it('labels the month-over-month change with its months, never as a trend (R6)', () => {
		expect(c.month).toEqual({ text: '+2.1%', label: 'Sep → Oct 2026, not seasonally adjusted' });
	});

	it('hides the month-over-month change when the month before is missing (R6)', () => {
		const v = ok();
		const none = inflationChart({
			...v,
			latest: { ...v.latest, monthPct: null, monthLabel: null }
		});
		expect(none.month).toBeNull();
	});

	it('keeps every month from Jan 2023, the gap a point with its reason, never a value (R10)', () => {
		expect(c.points).toHaveLength(46);
		expect(c.points[0]).toMatchObject({ label: 'Jan 2023', value: 327.478 });
		const gaps = c.points.filter((p) => p.value === null);
		expect(gaps).toEqual([
			expect.objectContaining({
				label: 'Oct 2025',
				value: null,
				reason: 'Data unavailable due to the 2025 lapse in appropriations'
			})
		]);
		expect(c.gaps.map((g) => g.label)).toEqual(['Oct 2025']);
		// Each point at its month's own time, in order.
		const at = c.points.map((p) => p.at);
		expect(at).toEqual([...at].sort((a, z) => a - z));
	});
});

describe('the CPI readout (R10)', () => {
	const c = inflationChart(ok());
	const stops = inflationStops(c.points, (v) => v / 1000);

	it('stops on every month, the missing one included and said as missing with its reason', () => {
		expect(stops).toHaveLength(46);
		const gap = stops.find((s) => s.words.figure === 'Missing')!;
		expect(gap.y).toBeNull();
		expect(gap.words.tail).toBe(
			'Oct 2025 · Data unavailable due to the 2025 lapse in appropriations'
		);
		// A stop of its own, not a silence the keys skip over.
		expect(gap.from).toBeUndefined();
	});

	it('reads an index as an index, never dollars or zero', () => {
		const last = stops.at(-1)!;
		expect(last.words).toEqual({ lead: '', figure: '363.6', tail: 'Oct 2026 · index' });
		expect(last.y).toBeCloseTo(0.363564, 6);
		expect(stops.some((s) => /\$|^0(\.0)?$/.test(s.words.figure))).toBe(false);
	});
});

describe('isolated months (Codex)', () => {
	const p = (period: string, value: number | null): InflationPoint => ({
		period,
		label: period,
		at: Date.parse(`${period}-01T12:00:00Z`),
		value,
		reason: value === null ? 'x' : null
	});

	it('are the published months with no published neighbour, edges included', () => {
		const pts = [
			p('2025-01', 1),
			p('2025-02', null),
			p('2025-03', 3),
			p('2025-04', 4),
			p('2025-05', null),
			p('2025-06', 6),
			p('2025-07', null),
			p('2025-08', 8)
		];
		expect(isolated(pts).map((x) => x.period)).toEqual(['2025-01', '2025-06', '2025-08']);
	});

	it('are none in a series with one gap between runs', () => {
		expect(isolated(inflationChart(ok()).points)).toEqual([]);
	});
});
