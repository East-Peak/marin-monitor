/**
 * Tests for shared chart utility — extracted from duplicated D3 panel code.
 * TDD: these tests were written BEFORE the implementation.
 */

import { describe, it, expect } from 'vitest';
import { buildChart } from './chart';
import type { ChartConfig, ChartPaths } from './chart';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(overrides: Partial<ChartConfig> = {}): ChartConfig {
	return {
		width: 400,
		height: 200,
		accentColor: '#10b981',
		data: [
			{ value: 10, label: 'Jan 1' },
			{ value: 20, label: 'Jan 2' },
			{ value: 15, label: 'Jan 3' },
			{ value: 25, label: 'Jan 4' },
			{ value: 18, label: 'Jan 5' }
		],
		...overrides
	};
}

const DEFAULT_MARGINS = { top: 12, right: 10, bottom: 24, left: 44 };

// ---------------------------------------------------------------------------
// Null / edge cases
// ---------------------------------------------------------------------------

describe('buildChart — null cases', () => {
	it('returns null for empty data', () => {
		expect(buildChart(makeConfig({ data: [] }))).toBeNull();
	});

	it('returns null for a single data point', () => {
		expect(buildChart(makeConfig({ data: [{ value: 5 }] }))).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// SVG path strings
// ---------------------------------------------------------------------------

describe('buildChart — path output', () => {
	it('returns a non-empty linePath string starting with M', () => {
		const result = buildChart(makeConfig())!;
		expect(result.linePath).toBeTruthy();
		expect(result.linePath).toMatch(/^M/);
	});

	it('returns a non-empty areaPath string starting with M', () => {
		const result = buildChart(makeConfig())!;
		expect(result.areaPath).toBeTruthy();
		expect(result.areaPath).toMatch(/^M/);
	});

	it('areaPath contains Z (closed shape)', () => {
		const result = buildChart(makeConfig())!;
		expect(result.areaPath).toContain('Z');
	});
});

// ---------------------------------------------------------------------------
// Dots array
// ---------------------------------------------------------------------------

describe('buildChart — dots', () => {
	it('dots array length matches data length', () => {
		const data = [
			{ value: 1 },
			{ value: 2 },
			{ value: 3 }
		];
		const result = buildChart(makeConfig({ data }))!;
		expect(result.dots).toHaveLength(3);
	});

	it('each dot has x, y, and value properties', () => {
		const result = buildChart(makeConfig())!;
		for (const dot of result.dots) {
			expect(dot).toHaveProperty('x');
			expect(dot).toHaveProperty('y');
			expect(dot).toHaveProperty('value');
			expect(typeof dot.x).toBe('number');
			expect(typeof dot.y).toBe('number');
			expect(typeof dot.value).toBe('number');
		}
	});

	it('dot values match input data values', () => {
		const data = [{ value: 10 }, { value: 20 }, { value: 30 }];
		const result = buildChart(makeConfig({ data }))!;
		expect(result.dots.map((d) => d.value)).toEqual([10, 20, 30]);
	});
});

// ---------------------------------------------------------------------------
// Y scale
// ---------------------------------------------------------------------------

describe('buildChart — yScale', () => {
	it('maps minimum value near bottom of chart area', () => {
		const data = [{ value: 100 }, { value: 200 }];
		const result = buildChart(makeConfig({ data }))!;
		const innerH = 200 - DEFAULT_MARGINS.top - DEFAULT_MARGINS.bottom;
		// yMin is min * 0.98 = 98, yMax is max * 1.02 = 204
		// yScale(yMin) should be near innerH (bottom)
		const yAtMin = result.yScale(result.yMin);
		expect(yAtMin).toBeCloseTo(innerH, 0);
	});

	it('maps maximum value near top of chart area', () => {
		const data = [{ value: 100 }, { value: 200 }];
		const result = buildChart(makeConfig({ data }))!;
		// yScale(yMax) should be near 0 (top)
		const yAtMax = result.yScale(result.yMax);
		expect(yAtMax).toBeCloseTo(0, 0);
	});

	it('higher values map to lower y coordinates', () => {
		const data = [{ value: 10 }, { value: 50 }];
		const result = buildChart(makeConfig({ data }))!;
		expect(result.yScale(50)).toBeLessThan(result.yScale(10));
	});
});

// ---------------------------------------------------------------------------
// X scale
// ---------------------------------------------------------------------------

describe('buildChart — xScale', () => {
	it('maps index 0 to left edge (0)', () => {
		const result = buildChart(makeConfig())!;
		expect(result.xScale(0)).toBe(0);
	});

	it('maps last index to inner width', () => {
		const data = makeConfig().data;
		const result = buildChart(makeConfig())!;
		const innerW = 400 - DEFAULT_MARGINS.left - DEFAULT_MARGINS.right;
		expect(result.xScale(data.length - 1)).toBeCloseTo(innerW, 0);
	});

	it('indices increase monotonically in x', () => {
		const result = buildChart(makeConfig())!;
		for (let i = 1; i < 5; i++) {
			expect(result.xScale(i)).toBeGreaterThan(result.xScale(i - 1));
		}
	});
});

// ---------------------------------------------------------------------------
// Default margins
// ---------------------------------------------------------------------------

describe('buildChart — margins', () => {
	it('uses default margins when none provided', () => {
		const result = buildChart(makeConfig())!;
		// Inner width = width - left - right = 400 - 44 - 10 = 346
		const innerW = 400 - 44 - 10;
		expect(result.xScale(makeConfig().data.length - 1)).toBeCloseTo(innerW, 0);
	});

	it('respects custom margins', () => {
		const margins = { top: 20, right: 20, bottom: 30, left: 50 };
		const result = buildChart(makeConfig({ margins }))!;
		const innerW = 400 - 50 - 20;
		expect(result.xScale(makeConfig().data.length - 1)).toBeCloseTo(innerW, 0);
	});
});

// ---------------------------------------------------------------------------
// Flat-line data (all same values)
// ---------------------------------------------------------------------------

describe('buildChart — flat line (all same values)', () => {
	it('returns non-null result', () => {
		const data = [{ value: 42 }, { value: 42 }, { value: 42 }];
		const result = buildChart(makeConfig({ data }));
		expect(result).not.toBeNull();
	});

	it('produces valid SVG paths even for flat data', () => {
		const data = [{ value: 42 }, { value: 42 }, { value: 42 }];
		const result = buildChart(makeConfig({ data }))!;
		expect(result.linePath).toMatch(/^M/);
		expect(result.areaPath).toMatch(/^M/);
	});

	it('yMin < yMax for flat data (padding applied)', () => {
		const data = [{ value: 42 }, { value: 42 }, { value: 42 }];
		const result = buildChart(makeConfig({ data }))!;
		expect(result.yMin).toBeLessThan(result.yMax);
	});
});

// ---------------------------------------------------------------------------
// Negative values
// ---------------------------------------------------------------------------

describe('buildChart — negative values', () => {
	it('handles all-negative data', () => {
		const data = [{ value: -30 }, { value: -10 }, { value: -20 }];
		const result = buildChart(makeConfig({ data }));
		expect(result).not.toBeNull();
		expect(result!.linePath).toMatch(/^M/);
	});

	it('handles mixed positive/negative data', () => {
		const data = [{ value: -5 }, { value: 10 }, { value: -3 }, { value: 8 }];
		const result = buildChart(makeConfig({ data }))!;
		expect(result.yMin).toBeLessThan(0);
		expect(result.yMax).toBeGreaterThan(0);
		expect(result.dots).toHaveLength(4);
	});

	it('yScale correctly orders negative and positive values', () => {
		const data = [{ value: -10 }, { value: 10 }];
		const result = buildChart(makeConfig({ data }))!;
		// -10 should be lower on screen (higher y) than 10
		expect(result.yScale(-10)).toBeGreaterThan(result.yScale(10));
	});
});

// ---------------------------------------------------------------------------
// Axis labels
// ---------------------------------------------------------------------------

describe('buildChart — axis labels', () => {
	it('returns yMin and yMax values', () => {
		const data = [{ value: 100 }, { value: 200 }];
		const result = buildChart(makeConfig({ data }))!;
		// yMin should be < min data value (padded), yMax > max data value (padded)
		expect(result.yMin).toBeLessThan(100);
		expect(result.yMax).toBeGreaterThan(200);
	});

	it('axisLabels.x has start, mid, end indices', () => {
		const data = [
			{ value: 1, label: 'Jan' },
			{ value: 2, label: 'Feb' },
			{ value: 3, label: 'Mar' },
			{ value: 4, label: 'Apr' },
			{ value: 5, label: 'May' }
		];
		const result = buildChart(makeConfig({ data }))!;
		expect(result.axisLabels.x).toHaveLength(3);
		expect(result.axisLabels.x[0]).toEqual({ index: 0, x: expect.any(Number), label: 'Jan' });
		expect(result.axisLabels.x[1]).toEqual({ index: 2, x: expect.any(Number), label: 'Mar' });
		expect(result.axisLabels.x[2]).toEqual({ index: 4, x: expect.any(Number), label: 'May' });
	});

	it('x axis labels fall back to empty string when no label provided', () => {
		const data = [{ value: 1 }, { value: 2 }, { value: 3 }];
		const result = buildChart(makeConfig({ data }))!;
		for (const axLabel of result.axisLabels.x) {
			expect(axLabel.label).toBe('');
		}
	});
});

// ---------------------------------------------------------------------------
// Two data points (minimum valid)
// ---------------------------------------------------------------------------

describe('buildChart — two data points', () => {
	it('produces valid output with exactly 2 points', () => {
		const data = [{ value: 5 }, { value: 15 }];
		const result = buildChart(makeConfig({ data }))!;
		expect(result).not.toBeNull();
		expect(result.dots).toHaveLength(2);
		expect(result.linePath).toMatch(/^M/);
		expect(result.axisLabels.x).toHaveLength(3);
		// With 2 points: start=0, mid=floor(1/2)=0, end=1 — mid collapses to start
		expect(result.axisLabels.x[0].index).toBe(0);
		expect(result.axisLabels.x[2].index).toBe(1);
	});
});
