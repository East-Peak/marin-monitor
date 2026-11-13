// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
	BLS_SERIES_ID,
	blsRequestBody,
	parseBlsSeries
} from '../../../scripts/shared/bls-series.mjs';

const fixture = () =>
	JSON.parse(readFileSync('tests/fixtures/costdata/bls-cuurs49bsaf11.json', 'utf8'));

/** One row as BLS's v1 API writes it. */
const row = (year: string, period: string, value: string, footnotes: unknown[] = [{}]) => ({
	year,
	period,
	periodName: 'x',
	value,
	footnotes
});
const response = (data: unknown[], seriesID = BLS_SERIES_ID) => ({
	status: 'REQUEST_SUCCEEDED',
	message: [],
	Results: { series: [{ seriesID, data }] }
});

describe('BLS CPI food at home, San Francisco area (a captured v1 response, read 2026-11-12)', () => {
	const read = parseBlsSeries(fixture());

	it('reads one observation per published month, oldest first, as index points', () => {
		expect(read.seriesId).toBe('CUURS49BSAF11');
		expect(read.observations).toHaveLength(45);
		expect(read.observations[0]).toEqual({ period: '2023-01', value: 327.478 });
		expect(read.observations.at(-1)).toEqual({ period: '2026-10', value: 363.564 });
		const periods = read.observations.map((o) => o.period);
		expect(periods).toEqual([...periods].sort());
	});

	it('never turns "-" into a value: October 2025 is a gap with BLS’s own reason', () => {
		expect(read.observations.find((o) => o.period === '2025-10')).toBeUndefined();
		expect(read.gaps).toEqual([
			{ period: '2025-10', reason: 'Data unavailable due to the 2025 lapse in appropriations' }
		]);
	});

	it('takes its frequency from the series itself', () => {
		expect(read.frequency).toBe('monthly');
	});

	it('dates the read by its newest reference month, not by when we fetched it', () => {
		expect(read.period).toBe('October 2026');
		expect(read.periodEnd).toBe('2026-10-31T00:00:00.000Z');
	});

	it('reading the same response again makes no new observation', () => {
		expect(parseBlsSeries(fixture())).toEqual(read);
	});
});

describe('what the parser refuses', () => {
	it('leaves annual averages (M13) out', () => {
		const data = fixture().Results.series[0].data;
		const withAnnual = response([row('2025', 'M13', '340.1'), ...data]);
		const read = parseBlsSeries(withAnnual);
		expect(read.observations.map((o) => o.period)).not.toContain('2025-13');
		expect(read.observations).toHaveLength(45);
	});

	it('a request that did not succeed', () => {
		expect(() =>
			parseBlsSeries({ ...fixture(), status: 'REQUEST_NOT_PROCESSED', message: ['daily limit'] })
		).toThrow(/REQUEST_NOT_PROCESSED/);
	});

	it('another series than the one asked for', () => {
		expect(() => parseBlsSeries(response([row('2026', 'M10', '363.5')], 'CUUR0000SAF11'))).toThrow(
			/CUUR0000SAF11/
		);
	});

	it('no observation at all', () => {
		expect(() => parseBlsSeries(response([]))).toThrow(/no observation/);
		expect(() =>
			parseBlsSeries(response([row('2025', 'M10', '-', [{ code: 'X', text: 'lapse' }])]))
		).toThrow(/no observation/);
	});

	it('a value that is neither a number nor "-"', () => {
		expect(() =>
			parseBlsSeries(response([row('2026', 'M10', 'n/a'), row('2026', 'M09', '356.1')]))
		).toThrow(/2026-10/);
		expect(() =>
			parseBlsSeries(response([row('2026', 'M10', '0'), row('2026', 'M09', '356.1')]))
		).toThrow(/2026-10/);
	});

	it('a month given twice', () => {
		expect(() =>
			parseBlsSeries(response([row('2026', 'M10', '363.5'), row('2026', 'M10', '364.1')]))
		).toThrow(/2026-10/);
	});

	it('a series that is not monthly', () => {
		const everyOtherMonth = ['M01', 'M03', 'M05', 'M07', 'M09'].map((m) => row('2026', m, '350.0'));
		expect(() => parseBlsSeries(response(everyOtherMonth))).toThrow(/monthly/);
	});
});

describe('the request', () => {
	it('asks the public v1 API for the series over the last few calendar years, with no key', () => {
		const body = blsRequestBody(new Date('2026-11-13T12:00:00Z'));
		expect(body).toEqual({ seriesid: ['CUURS49BSAF11'], startyear: '2023', endyear: '2026' });
		expect(JSON.stringify(body)).not.toMatch(/key/i);
	});
});
