import { describe, it, expect } from 'vitest';
import {
	getPacificsSeasonYear,
	buildPacificsScheduleUrl,
	inferSeasonSpanningYear,
	inferLikelyCalendarYear,
	resolveAnnualMonthDay,
	buildItem,
	flattenJsonLdEvents,
	buildEventTitle,
	inferTownFromText,
	getDipseaRaceDate
} from './helpers';

// Fixed reference timestamps for deterministic tests
const JAN_15_2026 = new Date('2026-01-15T12:00:00Z').getTime();
const JUL_15_2026 = new Date('2026-07-15T12:00:00Z').getTime();
const OCT_15_2026 = new Date('2026-10-15T12:00:00Z').getTime();
const MAR_01_2026 = new Date('2026-03-01T12:00:00Z').getTime();

describe('getPacificsSeasonYear', () => {
	it('returns current year when before October', () => {
		expect(getPacificsSeasonYear(JUL_15_2026)).toBe(2026);
	});

	it('returns next year when October or later', () => {
		expect(getPacificsSeasonYear(OCT_15_2026)).toBe(2027);
	});
});

describe('buildPacificsScheduleUrl', () => {
	it('builds URL with correct season year', () => {
		const url = buildPacificsScheduleUrl(JUL_15_2026);
		expect(url).toContain('year=2026');
		expect(url).toContain('pacificsbaseball.com');
	});
});

describe('inferSeasonSpanningYear', () => {
	it('returns current year for summer months in summer', () => {
		// month=6 (July), now is July -> currentYear
		expect(inferSeasonSpanningYear(6, JUL_15_2026)).toBe(2026);
	});

	it('returns next year for spring months when in fall', () => {
		// month=3 (April), now is October -> next year
		expect(inferSeasonSpanningYear(3, OCT_15_2026)).toBe(2027);
	});

	it('returns current year for spring months when in spring', () => {
		// month=3 (April), now is March -> current year
		expect(inferSeasonSpanningYear(3, MAR_01_2026)).toBe(2026);
	});

	it('returns previous year for fall months when in winter', () => {
		// month=9 (October), now is January -> previous year
		expect(inferSeasonSpanningYear(9, JAN_15_2026)).toBe(2025);
	});

	it('returns current year for fall months when in summer', () => {
		// month=9 (October), now is July -> current year
		expect(inferSeasonSpanningYear(9, JUL_15_2026)).toBe(2026);
	});
});

describe('inferLikelyCalendarYear', () => {
	it('returns current year for a recent date', () => {
		expect(inferLikelyCalendarYear('March 15', MAR_01_2026)).toBe(2026);
	});

	it('returns next year for a date far in the past', () => {
		// "January 1" when now is July 15 -- more than ANNUAL_EVENT_STALENESS_DAYS ago
		expect(inferLikelyCalendarYear('January 1', JUL_15_2026)).toBe(2027);
	});

	it('returns next year for unparseable date text (NaN probe falls below staleness threshold)', () => {
		// When the date can't be parsed, probe.getTime() is NaN, so Number.isFinite
		// returns false early and we get currentYear back. But "not-a-date, 2026"
		// actually parses as Jan 1 2026, which IS stale by July, so -> 2027.
		expect(inferLikelyCalendarYear('not-a-date', JUL_15_2026)).toBe(2027);
	});
});

describe('resolveAnnualMonthDay', () => {
	it('resolves a valid date with year inferred', () => {
		const result = resolveAnnualMonthDay('Mar 14', MAR_01_2026, '08:00:00 PST');
		expect(result).toBeInstanceOf(Date);
		expect(result!.getFullYear()).toBe(2026);
	});

	it('resolves garbage input that JS Date constructor can parse', () => {
		// "not-valid, 2026 08:00:00 PST" parses as a valid date in JS
		const result = resolveAnnualMonthDay('not-valid', MAR_01_2026, '08:00:00 PST');
		expect(result).toBeInstanceOf(Date);
	});
});

describe('buildItem', () => {
	const baseParams = {
		category: 'shows',
		source: 'Test Venue',
		title: 'Test Show',
		link: 'https://example.com/show',
		pubDate: new Date(MAR_01_2026).toISOString(),
		description: 'A test show',
		verification: 'community'
	};

	it('builds a valid NewsItem', () => {
		const item = buildItem(baseParams, MAR_01_2026);
		expect(item).not.toBeNull();
		expect(item!.title).toBe('Test Show');
		expect(item!.source).toBe('Test Venue');
		expect(item!.category).toBe('shows');
	});

	it('returns null for date too far in past', () => {
		const oldDate = new Date('2020-01-01').toISOString();
		const item = buildItem({ ...baseParams, pubDate: oldDate }, MAR_01_2026);
		expect(item).toBeNull();
	});

	it('returns null for date too far in future', () => {
		const futureDate = new Date('2030-01-01').toISOString();
		const item = buildItem({ ...baseParams, pubDate: futureDate }, MAR_01_2026);
		expect(item).toBeNull();
	});

	it('sets exact locationConfidence when lat/lon provided', () => {
		const item = buildItem({ ...baseParams, lat: 37.9, lon: -122.5 }, MAR_01_2026);
		expect(item!.locationConfidence).toBe('exact');
	});

	it('sets town locationConfidence when only townSlug provided', () => {
		const item = buildItem(
			{ ...baseParams, town: 'Mill Valley', townSlug: 'mill-valley' },
			MAR_01_2026
		);
		expect(item!.locationConfidence).toBe('town');
	});

	it('generates a slugified id', () => {
		const item = buildItem(baseParams, MAR_01_2026);
		expect(item!.id).toMatch(/^shows:test-venue:/);
	});
});

describe('flattenJsonLdEvents', () => {
	it('returns empty for null/undefined', () => {
		expect(flattenJsonLdEvents(null)).toEqual([]);
		expect(flattenJsonLdEvents(undefined)).toEqual([]);
	});

	it('extracts Event from a direct object', () => {
		const result = flattenJsonLdEvents({ '@type': 'Event', name: 'Concert' });
		expect(result).toHaveLength(1);
		expect(result[0].name).toBe('Concert');
	});

	it('extracts Events from @graph array', () => {
		const result = flattenJsonLdEvents({
			'@graph': [
				{ '@type': 'Event', name: 'Show A' },
				{ '@type': 'Event', name: 'Show B' }
			]
		});
		expect(result).toHaveLength(2);
	});

	it('extracts Events from itemListElement', () => {
		const result = flattenJsonLdEvents({
			itemListElement: [{ item: { '@type': 'Event', name: 'Listed Event' } }]
		});
		expect(result).toHaveLength(1);
	});

	it('handles nested arrays', () => {
		const result = flattenJsonLdEvents([
			{ '@type': 'Event', name: 'A' },
			[{ '@type': 'Event', name: 'B' }]
		]);
		expect(result).toHaveLength(2);
	});

	it('returns empty for non-Event objects', () => {
		expect(flattenJsonLdEvents({ '@type': 'Organization' })).toEqual([]);
	});
});

describe('buildEventTitle', () => {
	it('returns just the name when no date', () => {
		expect(buildEventTitle('Miwok 100K', null, false)).toBe('Miwok 100K');
	});

	it('appends formatted date when provided', () => {
		const title = buildEventTitle('Miwok 100K', '2026-05-02T08:00:00Z', false);
		expect(title).toContain('Miwok 100K');
		expect(title).toContain('2026');
	});

	it('appends registration note when flag is true', () => {
		const title = buildEventTitle('Miwok 100K', null, true);
		expect(title).toContain('Registration open');
	});
});

describe('inferTownFromText', () => {
	it('detects Novato', () => {
		expect(inferTownFromText('Race at Novato Stafford Lake')).toEqual({
			town: 'Novato',
			townSlug: 'novato'
		});
	});

	it('detects Mill Valley with mt tam variant', () => {
		expect(inferTownFromText('Trail run on Mt. Tam')).toEqual({
			town: 'Mill Valley',
			townSlug: 'mill-valley'
		});
	});

	it('detects Mill Valley with mt tam without period', () => {
		expect(inferTownFromText('Mt Tam summit hike')).toEqual({
			town: 'Mill Valley',
			townSlug: 'mill-valley'
		});
	});

	it('detects Fairfax', () => {
		expect(inferTownFromText('Camp Tamarancho, Fairfax')).toEqual({
			town: 'Fairfax',
			townSlug: 'fairfax'
		});
	});

	it('detects San Rafael', () => {
		expect(inferTownFromText('game in san rafael')).toEqual({
			town: 'San Rafael',
			townSlug: 'san-rafael'
		});
	});

	it('detects Point Reyes', () => {
		expect(inferTownFromText('Point Reyes Lighthouse')).toEqual({
			town: 'Point Reyes Station',
			townSlug: 'point-reyes'
		});
	});

	it('detects Stinson Beach', () => {
		expect(inferTownFromText('finish at Stinson Beach')).toEqual({
			town: 'Stinson Beach',
			townSlug: 'stinson-beach'
		});
	});

	it('returns empty for unrecognized text', () => {
		expect(inferTownFromText('somewhere in Oakland')).toEqual({});
	});
});

describe('getDipseaRaceDate', () => {
	it('returns a date in June', () => {
		const date = getDipseaRaceDate(2026);
		expect(date.getMonth()).toBe(5); // June (0-indexed)
	});

	it('returns a Sunday', () => {
		const date = getDipseaRaceDate(2026);
		expect(date.getDay()).toBe(0); // Sunday
	});

	it('returns the second Sunday in June', () => {
		// 2026: June 1 is a Monday
		// First Sunday = June 7, Second Sunday = June 14
		const date = getDipseaRaceDate(2026);
		expect(date.getDate()).toBe(14);
	});

	it('sets 7:30 AM start time', () => {
		const date = getDipseaRaceDate(2026);
		expect(date.getHours()).toBe(7);
		expect(date.getMinutes()).toBe(30);
	});

	it('works for different years', () => {
		// 2025: June 1 is a Sunday
		// First Sunday = June 1, Second Sunday = June 8
		const date = getDipseaRaceDate(2025);
		expect(date.getMonth()).toBe(5);
		expect(date.getDate()).toBe(8);
		expect(date.getDay()).toBe(0);
	});
});
