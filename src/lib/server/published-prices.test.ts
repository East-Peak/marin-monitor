// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
	parsePgeEv2,
	parseRangeRoverOffer,
	parseRedfinCities,
	parseUsdaCostOfFood,
	usdaReportUrl
} from '../../../scripts/shared/published-prices.mjs';

const fixture = (name: string) => readFileSync(`tests/fixtures/costdata/${name}`, 'utf8');

describe('USDA Cost of Food (pdftotext -layout of the September 2026 report, issued October)', () => {
	const usda = parseUsdaCostOfFood(fixture('usda-cost-of-food-2026-09.txt'));

	it('reads the Liberal plan monthly column for each age-sex group the sheets price', () => {
		expect(usda.values).toEqual({
			'usda.liberal.c6to8': 357.2,
			'usda.liberal.c9to11': 408.2,
			'usda.liberal.f12to13': 401.1,
			'usda.liberal.f19to50': 429.6,
			'usda.liberal.f51to70': 399.5,
			'usda.liberal.m12to13': 460.6,
			'usda.liberal.m14to18': 473.9,
			'usda.liberal.m19to50': 486.8,
			'usda.liberal.m51to70': 449.1
		});
	});

	it('dates the read by the report month, not the issue date or our read', () => {
		expect(usda.period).toBe('September 2026');
		expect(usda.periodEnd).toBe('2026-09-30T00:00:00.000Z');
	});

	it('refuses a table without a row it needs', () => {
		const text = fixture('usda-cost-of-food-2026-09.txt').replace(/51-70 years.*\n/, '');
		expect(() => parseUsdaCostOfFood(text)).toThrow(/51-70/);
	});

	it('refuses a row whose columns moved', () => {
		const text = fixture('usda-cost-of-food-2026-09.txt').replace('$486.80', '');
		expect(() => parseUsdaCostOfFood(text)).toThrow(/19-50/);
	});

	it('names the monthly report file', () => {
		expect(usdaReportUrl(2026, 9)).toBe(
			'https://www.fna.usda.gov/sites/default/files/resource-files/CostofFoodSep2026LowModLib.pdf'
		);
	});
});

describe('PG&E Schedule EV2 (sheet 2, Advice 7921-E)', () => {
	const ev2 = parsePgeEv2(fixture('pge-ev2-sheet2.txt'));

	it('reads the Winter total bundled row, the sheet’s scope', () => {
		expect(ev2.values).toEqual({ 'pge.ev2a.peak': 0.41099, 'pge.ev2a.offPeak': 0.22558 });
	});

	it('carries the sheet’s own effective date', () => {
		expect(ev2.effective).toBe('2026-06-01');
	});

	it('refuses a sheet without the Winter row', () => {
		expect(() =>
			parsePgeEv2(fixture('pge-ev2-sheet2.txt').replace('Winter Usage', 'Usage'))
		).toThrow(/Winter/);
	});
});

describe('Range Rover Sport offers (one offer, all its parts)', () => {
	const html = fixture('range-rover-sport-offers.html');

	it('reads the monthly, due at signing, term, trim, region and end from the same offer', () => {
		expect(parseRangeRoverOffer(html)).toEqual({
			trim: '2026 Range Rover Sport P360 SE',
			monthly: 999,
			months: 24,
			dueAtSigning: 8995,
			region: 'US',
			validUntil: '2026-11-02'
		});
	});

	it('rejects an offer for another trim or term than the sheet prices', () => {
		expect(() => parseRangeRoverOffer(html.replaceAll('P360 SE', 'P400 SE'))).toThrow(/trim/);
		expect(() => parseRangeRoverOffer(html.replaceAll('24 MONTHS', '36 MONTHS'))).toThrow(/term/);
	});

	it('rejects an offer whose due-at-signing parts disagree', () => {
		expect(() =>
			parseRangeRoverOffer(html.replace('$8,995 CASH DUE AT SIGNING', '$9,995 CASH DUE AT SIGNING'))
		).toThrow(/due at signing/);
	});

	it('rejects an offer with no end date', () => {
		expect(() => parseRangeRoverOffer(html.replaceAll(/by 11\/02\/2026/g, 'soon'))).toThrow(/end/);
	});
});

describe('Redfin city medians (all_cities.csv: all residential, rolling 3 months)', () => {
	const lines = fixture('redfin-all-cities-marin.csv').split('\n');

	it('reads each town’s newest 3 months: median and sale count, dated by the period end', () => {
		expect(parseRedfinCities(lines)).toEqual({
			period: '3 months to Sep 2026',
			periodEnd: '2026-09-30T00:00:00.000Z',
			values: {
				'redfin.larkspur.latest': 1801142,
				'redfin.millValley.latest': 1849119,
				'redfin.ross.latest': 3893146
			},
			sales: {
				'redfin.larkspur.latest': 42,
				'redfin.millValley.latest': 38,
				'redfin.ross.latest': 5
			}
		});
	});

	it('refuses a town whose newest period lags the others', () => {
		const lagging = lines.filter((l) => !(l.includes('"Ross, CA"') && l.includes('"2026-09-30"')));
		expect(() => parseRedfinCities(lagging)).toThrow(/Ross/);
	});

	it('refuses a measure that is not the rolling 3 months', () => {
		const monthly = lines.map((l) => l.replace('"Rolling 3 Months"', '"Monthly"'));
		expect(() => parseRedfinCities(monthly)).toThrow(/Rolling 3 Months/);
	});
});
