import { describe, expect, it } from 'vitest';
import { buildTvSparkline } from './sparkline';

describe('buildTvSparkline', () => {
	it('returns a visible sparkline for a single data point', () => {
		const sparkline = buildTvSparkline([8.3], 80, 24);

		expect(sparkline).not.toBeNull();
		expect(sparkline?.w).toBe(80);
		expect(sparkline?.h).toBe(24);
		expect(sparkline?.linePath).toContain('L');
		expect(sparkline?.areaPath).toContain('L');
	});

	it('returns a stable sparkline for flat data', () => {
		const sparkline = buildTvSparkline([5, 5, 5], 80, 24);

		expect(sparkline).not.toBeNull();
		expect(sparkline?.linePath).not.toContain('NaN');
		expect(sparkline?.areaPath).not.toContain('NaN');
	});

	it('returns null when there is no numeric data', () => {
		expect(buildTvSparkline([null, undefined], 80, 24)).toBeNull();
	});
});
