import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { housingMonths, parseCountyCsv, splitCsvLine } from './housing';

/** Real lines of Redfin's all_counties.csv, read 2026-11-03: the header, Bergen NJ, Marin's last 3 months, Sonoma. */
const CAPTURED = readFileSync('tests/fixtures/costdata/redfin-all-counties.csv', 'utf8').split(
	'\n'
);

describe('splitCsvLine', () => {
	it('keeps a quoted comma inside its field', () => {
		expect(splitCsvLine('"a","Bergen County, NJ",3,NA')).toEqual([
			'a',
			'Bergen County, NJ',
			'3',
			'NA'
		]);
	});
	it('unescapes a doubled quote', () => {
		expect(splitCsvLine('"say ""hi""",x')).toEqual(['say "hi"', 'x']);
	});
});

describe('parseCountyCsv', () => {
	it('reads Marin County, monthly, oldest first, ending with its source period', () => {
		const doc = parseCountyCsv(CAPTURED, new Date('2026-11-03T12:00:00Z'));
		expect(doc.months.map((m) => m.month)).toEqual(['2026-07-01', '2026-08-01', '2026-09-01']);
		expect(doc.months.at(-1)).toEqual({
			month: '2026-09-01',
			medianPrice: 1496651,
			medianPpsf: 850,
			inventory: 580,
			daysOnMarket: 25,
			homesSold: 255
		});
		expect(doc.periodEnd).toBe('2026-09-30T00:00:00.000Z');
		expect(doc.lastSuccessfulScrapeAt).toBe('2026-11-03T12:00:00.000Z');
	});

	it('reads NA as no value, never zero', () => {
		const lines = [...CAPTURED];
		lines[4] = lines[4].replace(',255,', ',NA,');
		const last = parseCountyCsv(lines, new Date()).months.at(-1);
		expect(last?.homesSold).toBeNull();
	});

	it('refuses a file without Marin', () => {
		expect(() => parseCountyCsv(CAPTURED.slice(0, 2), new Date())).toThrow(/no Marin County rows/);
	});

	it('refuses a file whose columns moved', () => {
		const lines = [
			CAPTURED[0].replace('"MEDIAN SALE PRICE NSA ($)"', '"MEDIAN SALE PRICE ($)"'),
			...CAPTURED.slice(1)
		];
		expect(() => parseCountyCsv(lines, new Date())).toThrow(/MEDIAN SALE PRICE NSA/);
	});

	it('refuses a row that is not monthly', () => {
		const lines = [...CAPTURED];
		lines[4] = lines[4].replace('"Monthly"', '"Weekly"');
		expect(() => parseCountyCsv(lines, new Date())).toThrow(/not monthly/);
	});
});

describe('housingMonths', () => {
	const month = {
		month: '2026-09-01',
		medianPrice: 1,
		medianPpsf: 1,
		inventory: 1,
		daysOnMarket: 1,
		homesSold: 1
	};
	it('reads the old bare array and the new document alike', () => {
		expect(housingMonths([month])).toEqual([month]);
		expect(
			housingMonths({
				periodEnd: '2026-09-30T00:00:00.000Z',
				lastSuccessfulScrapeAt: 'x',
				months: [month]
			})
		).toEqual([month]);
	});
	it('is null for anything else', () => {
		expect(housingMonths(null)).toBeNull();
		expect(housingMonths({ months: 'no' })).toBeNull();
	});
});
