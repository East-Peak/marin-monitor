import { describe, expect, it } from 'vitest';
import { inflationChart, nearestMonth } from './inflation-chart';
import type { InflationObservation } from './inflation';

const obs = (vals: (number | null)[]): InflationObservation[] =>
	vals.map((value, i) => ({
		period: `2025-${String(i + 1).padStart(2, '0')}`,
		label: `M${i + 1}`,
		value,
		...(value === null ? { reason: 'none' } : {})
	}));

describe('inflationChart', () => {
	const chart = inflationChart(obs([100, 102, null, 104, 106]), { width: 300, height: 150 });

	it('draws a separate run each side of a gap and never bridges it', () => {
		expect(chart.runs).toHaveLength(2);
		expect(chart.runs[0].line.match(/L/g)).toHaveLength(1);
		expect(chart.runs[1].line.match(/L/g)).toHaveLength(1);
	});

	it('marks each gap month at its own x', () => {
		expect(chart.gaps).toHaveLength(1);
		expect(chart.gaps[0].index).toBe(2);
		expect(chart.gaps[0].x).toBeCloseTo(chart.x(2));
	});

	it('puts higher values higher (smaller y) and keeps every point inside the plot', () => {
		expect(chart.y(106)).toBeLessThan(chart.y(100));
		for (const v of [100, 106]) {
			expect(chart.y(v)).toBeGreaterThanOrEqual(0);
			expect(chart.y(v)).toBeLessThanOrEqual(150);
		}
	});

	it('labels the scale with real index values, no dollar sign', () => {
		expect(chart.yTicks.length).toBeGreaterThan(1);
		for (const t of chart.yTicks) expect(t.label).not.toMatch(/\$/);
	});

	it('ends on the latest observed month', () => {
		expect(chart.last?.index).toBe(4);
	});
});

describe('nearestMonth', () => {
	it('snaps to a month, gap months included, and never beyond the ends', () => {
		const c = inflationChart(obs([100, 102, null, 104, 106]), { width: 300, height: 150 });
		expect(nearestMonth(c, c.x(2) + 1)).toBe(2);
		expect(nearestMonth(c, -50)).toBe(0);
		expect(nearestMonth(c, 9999)).toBe(4);
	});
});
