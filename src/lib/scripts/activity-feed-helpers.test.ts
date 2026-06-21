/**
 * Unit tests for scripts/lib/activity-feed-helpers.mjs.
 *
 * These helpers are pure/synchronous — no network, no fs, no mocks needed.
 * `now` is injected where timeliness logic is involved so tests are deterministic.
 */

import { describe, expect, it } from 'vitest';
import {
	buildEventTitle,
	buildItem,
	excerpt,
	flattenJsonLdEvents,
	inferTownFromText,
	isTimely,
	MAX_FUTURE_DAYS,
	MAX_PAST_DAYS,
	normalizeJsonLd,
	slugify,
	stripHtml,
	toIsoDate
} from '../../../scripts/lib/activity-feed-helpers.mjs';

// Fixed reference point so all timeliness tests are deterministic.
const NOW = new Date('2026-06-21T12:00:00Z').getTime();

// ──────────────────────────────────────────────────────────────────────────────
// stripHtml
// ──────────────────────────────────────────────────────────────────────────────
describe('stripHtml', () => {
	it('returns empty string for empty input', () => {
		expect(stripHtml('')).toBe('');
		expect(stripHtml()).toBe('');
	});

	it('strips basic tags', () => {
		expect(stripHtml('<p>Hello <b>world</b></p>')).toBe('Hello world');
	});

	it('removes CDATA wrappers', () => {
		expect(stripHtml('<![CDATA[Some <b>text</b>]]>')).toBe('Some text');
	});

	it('removes script and style blocks entirely', () => {
		expect(stripHtml('<script>alert("x")</script>content')).toBe('content');
		expect(stripHtml('<style>.a{color:red}</style>content')).toBe('content');
	});

	it('converts block-level breaks to spaces (collapsed)', () => {
		const result = stripHtml('<p>Para one</p><p>Para two</p>');
		// <p> → \n, then \s+ → ' '
		expect(result).toBe('Para one Para two');
	});

	it('decodes common HTML entities', () => {
		expect(stripHtml('A &amp; B')).toBe('A & B');
		expect(stripHtml('&quot;quoted&quot;')).toBe('"quoted"');
		expect(stripHtml('&lt;tag&gt;')).toBe('<tag>');
		expect(stripHtml('&nbsp;space')).toBe('space');
	});

	it('decodes typographic entities', () => {
		// &#8220;/&#8221; → named handler → ASCII " (U+0022)
		expect(stripHtml('&#8220;hello&#8221;')).toBe('"hello"');
		// &#8217; → named handler → ASCII ' (U+0027); &#8216; → numeric fallback → U+2018
		expect(stripHtml('&#8217;')).toBe("'");
		// en-dash and em-dash via named handlers
		expect(stripHtml('&#8211;')).toBe('–');
		expect(stripHtml('&#8212;')).toBe('—');
		// Hex variants
		expect(stripHtml('&#x2013;')).toBe('–');
		expect(stripHtml('&#x2014;')).toBe('—');
	});

	it('decodes numeric character references', () => {
		// &#65; = A
		expect(stripHtml('&#65;')).toBe('A');
	});

	it('collapses whitespace', () => {
		expect(stripHtml('  a   b  ')).toBe('a b');
	});
});

// ──────────────────────────────────────────────────────────────────────────────
// excerpt
// ──────────────────────────────────────────────────────────────────────────────
describe('excerpt', () => {
	it('returns the full text when under maxLength', () => {
		expect(excerpt('Short text', 220)).toBe('Short text');
	});

	it('truncates at maxLength-1 chars and appends ellipsis', () => {
		const long = 'a'.repeat(300);
		const result = excerpt(long, 220);
		expect(result.endsWith('…')).toBe(true);
		// slice(0, 219) + ellipsis = 220 chars (the ellipsis is one Unicode code-point)
		expect([...result].length).toBe(220);
	});

	it('strips HTML before measuring length', () => {
		const html = '<b>' + 'x'.repeat(5) + '</b>';
		expect(excerpt(html, 220)).toBe('x'.repeat(5));
	});

	it('uses default maxLength of 220', () => {
		const long = 'b'.repeat(300);
		const result = excerpt(long);
		expect([...result].length).toBe(220);
	});
});

// ──────────────────────────────────────────────────────────────────────────────
// slugify
// ──────────────────────────────────────────────────────────────────────────────
describe('slugify', () => {
	it('lowercases and replaces non-alphanumeric runs with hyphens', () => {
		expect(slugify('Hello World!')).toBe('hello-world');
	});

	it('strips leading and trailing hyphens', () => {
		expect(slugify('---foo---')).toBe('foo');
	});

	it('handles empty string', () => {
		expect(slugify('')).toBe('');
		expect(slugify()).toBe('');
	});

	it('collapses multiple separators', () => {
		expect(slugify('Mill   Valley  ')).toBe('mill-valley');
	});
});

// ──────────────────────────────────────────────────────────────────────────────
// isTimely
// ──────────────────────────────────────────────────────────────────────────────
describe('isTimely', () => {
	const msPerDay = 24 * 60 * 60 * 1000;

	it('accepts timestamps within the past window', () => {
		expect(isTimely(NOW - 10 * msPerDay, NOW)).toBe(true);
		expect(isTimely(NOW - MAX_PAST_DAYS * msPerDay, NOW)).toBe(true);
	});

	it('rejects timestamps beyond the past window', () => {
		expect(isTimely(NOW - (MAX_PAST_DAYS + 1) * msPerDay, NOW)).toBe(false);
	});

	it('accepts timestamps within the future window', () => {
		expect(isTimely(NOW + 10 * msPerDay, NOW)).toBe(true);
		expect(isTimely(NOW + MAX_FUTURE_DAYS * msPerDay, NOW)).toBe(true);
	});

	it('rejects timestamps beyond the future window', () => {
		expect(isTimely(NOW + (MAX_FUTURE_DAYS + 1) * msPerDay, NOW)).toBe(false);
	});

	it('accepts NOW itself', () => {
		expect(isTimely(NOW, NOW)).toBe(true);
	});
});

// ──────────────────────────────────────────────────────────────────────────────
// toIsoDate
// ──────────────────────────────────────────────────────────────────────────────
describe('toIsoDate', () => {
	it('returns an ISO string for a valid date string', () => {
		const result = toIsoDate('2026-06-21');
		expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T/);
	});

	it('returns an ISO string for a Date object', () => {
		const d = new Date('2026-06-21T00:00:00Z');
		expect(toIsoDate(d)).toBe(d.toISOString());
	});

	it('falls back to now for null/undefined input', () => {
		const before = Date.now();
		const result = toIsoDate(null);
		const after = Date.now();
		const ts = new Date(result).getTime();
		expect(ts).toBeGreaterThanOrEqual(before);
		expect(ts).toBeLessThanOrEqual(after);
	});

	it('falls back to now for an invalid date string', () => {
		const before = Date.now();
		const result = toIsoDate('not a date');
		const after = Date.now();
		const ts = new Date(result).getTime();
		expect(ts).toBeGreaterThanOrEqual(before);
		expect(ts).toBeLessThanOrEqual(after);
	});

	it('falls back to now for an invalid Date object', () => {
		const before = Date.now();
		const result = toIsoDate(new Date('invalid'));
		const after = Date.now();
		const ts = new Date(result).getTime();
		expect(ts).toBeGreaterThanOrEqual(before);
		expect(ts).toBeLessThanOrEqual(after);
	});

	it('handles am/pm without a space (e.g. "6:00pm") — produces a valid ISO string', () => {
		const result = toIsoDate('Jun 21, 2026 6:00pm');
		// The helper inserts a space before am/pm so the date can be parsed; verify it's valid ISO.
		expect(() => new Date(result)).not.toThrow();
		expect(Number.isFinite(new Date(result).getTime())).toBe(true);
		// The parsed UTC timestamp should correspond to June 21 or 22 depending on local timezone.
		const parsed = new Date(result);
		expect(parsed.getUTCFullYear()).toBe(2026);
	});
});

// ──────────────────────────────────────────────────────────────────────────────
// buildEventTitle
// ──────────────────────────────────────────────────────────────────────────────
describe('buildEventTitle', () => {
	it('returns just the event name when no date or registration', () => {
		expect(buildEventTitle('Miwok 100K', undefined, false)).toBe('Miwok 100K');
	});

	it('appends formatted date when provided', () => {
		const title = buildEventTitle('Miwok 100K', '2026-05-02T08:00:00Z', false);
		expect(title).toMatch(/Miwok 100K — .+ \d{4}/);
	});

	it('appends "Registration open" when hasRegistration is true', () => {
		const title = buildEventTitle('Quad Dipsea', '2026-06-14T08:00:00Z', true);
		expect(title).toContain('Registration open');
	});

	it('skips date segment for invalid date input', () => {
		const title = buildEventTitle('Marinduro', 'not-a-date', false);
		expect(title).toBe('Marinduro');
	});
});

// ──────────────────────────────────────────────────────────────────────────────
// flattenJsonLdEvents
// ──────────────────────────────────────────────────────────────────────────────
describe('flattenJsonLdEvents', () => {
	it('returns [] for null/undefined', () => {
		expect(flattenJsonLdEvents(null)).toEqual([]);
		expect(flattenJsonLdEvents(undefined)).toEqual([]);
	});

	it('returns the node itself when @type === "Event"', () => {
		const event = { '@type': 'Event', name: 'Dipsea Race' };
		expect(flattenJsonLdEvents(event)).toEqual([event]);
	});

	it('flattens an array of events', () => {
		const events = [
			{ '@type': 'Event', name: 'A' },
			{ '@type': 'Event', name: 'B' }
		];
		expect(flattenJsonLdEvents(events)).toHaveLength(2);
	});

	it('drills into @graph', () => {
		const graph = { '@graph': [{ '@type': 'Event', name: 'Race' }] };
		expect(flattenJsonLdEvents(graph)).toHaveLength(1);
	});

	it('drills into itemListElement', () => {
		const list = { itemListElement: [{ '@type': 'Event', name: 'Run' }] };
		expect(flattenJsonLdEvents(list)).toHaveLength(1);
	});

	it('drills into node.item', () => {
		const wrapper = { item: { '@type': 'Event', name: 'Swim' } };
		expect(flattenJsonLdEvents(wrapper)).toHaveLength(1);
	});

	it('returns [] for a non-Event object with no known keys', () => {
		expect(flattenJsonLdEvents({ '@type': 'Organization', name: 'Foo' })).toEqual([]);
	});

	it('returns [] for a primitive', () => {
		expect(flattenJsonLdEvents('string')).toEqual([]);
		expect(flattenJsonLdEvents(42)).toEqual([]);
	});
});

// ──────────────────────────────────────────────────────────────────────────────
// normalizeJsonLd
// ──────────────────────────────────────────────────────────────────────────────
describe('normalizeJsonLd', () => {
	it('trims leading and trailing whitespace', () => {
		expect(normalizeJsonLd('  {"@type":"Event"}  ')).toBe('{"@type":"Event"}');
	});

	it('returns empty string for blank input', () => {
		expect(normalizeJsonLd('   ')).toBe('');
	});
});

// ──────────────────────────────────────────────────────────────────────────────
// buildItem
// ──────────────────────────────────────────────────────────────────────────────
describe('buildItem', () => {
	const BASE = {
		category: 'shows',
		source: 'Sweetwater Music Hall',
		title: 'Jazz Night',
		link: 'https://sweetwatermusichall.org/events/jazz-night/',
		pubDate: '2026-06-25T19:00:00Z',
		description: 'Great jazz show in Mill Valley.',
		verification: 'community' as const,
		town: 'Mill Valley',
		townSlug: 'mill-valley',
		lat: 37.9059,
		lon: -122.5491,
		topics: ['music', 'shows']
	};

	it('returns a well-formed item for a timely event', () => {
		const item = buildItem(BASE, NOW);
		expect(item).not.toBeNull();
		expect(item!.title).toBe('Jazz Night');
		expect(item!.category).toBe('shows');
		expect(item!.source).toBe('Sweetwater Music Hall');
		expect(item!.pubDate).toBe('2026-06-25T19:00:00.000Z');
		expect(item!.lat).toBe(37.9059);
		expect(item!.lon).toBe(-122.5491);
		expect(item!.locationConfidence).toBe('exact');
		expect(item!.topics).toEqual(['music', 'shows']);
	});

	it('generates a stable slug-based id', () => {
		const item = buildItem(BASE, NOW);
		expect(item!.id).toMatch(/^shows:/);
		expect(item!.id).toContain(':jazz-night:');
	});

	it('returns null for an event too far in the past', () => {
		const old = { ...BASE, pubDate: '2020-01-01T00:00:00Z' };
		expect(buildItem(old, NOW)).toBeNull();
	});

	it('returns null for an event too far in the future', () => {
		const future = { ...BASE, pubDate: '2030-01-01T00:00:00Z' };
		expect(buildItem(future, NOW)).toBeNull();
	});

	it('omits lat/lon when neither is provided', () => {
		const noCoords = { ...BASE, lat: undefined, lon: undefined };
		const item = buildItem(noCoords, NOW);
		expect(item!.lat).toBeUndefined();
		expect(item!.lon).toBeUndefined();
		expect(item!.locationConfidence).toBe('town');
	});

	it('omits locationConfidence when no coords and no townSlug', () => {
		const bare = { ...BASE, lat: undefined, lon: undefined, townSlug: undefined };
		const item = buildItem(bare, NOW);
		expect(item!.locationConfidence).toBeUndefined();
	});

	it('truncates a long description via excerpt', () => {
		const longDesc = { ...BASE, description: 'x'.repeat(300) };
		const item = buildItem(longDesc, NOW);
		expect([...(item!.description ?? '')].length).toBeLessThanOrEqual(220);
	});

	it('strips HTML from the content field', () => {
		const withContent = { ...BASE, content: '<p>Some <b>content</b></p>' };
		const item = buildItem(withContent, NOW);
		expect(item!.content).toBe('Some content');
	});

	it('defaults verification to "community"', () => {
		const noVerif = { ...BASE };
		delete (noVerif as Record<string, unknown>).verification;
		const item = buildItem(noVerif, NOW);
		expect(item!.verification).toBe('community');
	});
});

// ──────────────────────────────────────────────────────────────────────────────
// inferTownFromText
// ──────────────────────────────────────────────────────────────────────────────
describe('inferTownFromText', () => {
	it('detects Novato', () => {
		expect(inferTownFromText('Race at Stafford Lake, Novato')).toEqual({
			town: 'Novato',
			townSlug: 'novato'
		});
	});

	it('detects Mill Valley from "mill valley"', () => {
		expect(inferTownFromText('Concert in Mill Valley')).toEqual({
			town: 'Mill Valley',
			townSlug: 'mill-valley'
		});
	});

	it('detects Mill Valley from "mt. tam"', () => {
		expect(inferTownFromText('Hike on Mt. Tam')).toEqual({
			town: 'Mill Valley',
			townSlug: 'mill-valley'
		});
	});

	it('detects Mill Valley from "mt tam"', () => {
		expect(inferTownFromText('Run on Mt Tam summit')).toEqual({
			town: 'Mill Valley',
			townSlug: 'mill-valley'
		});
	});

	it('detects Fairfax', () => {
		expect(inferTownFromText('Show at 19 Broadway, Fairfax')).toEqual({
			town: 'Fairfax',
			townSlug: 'fairfax'
		});
	});

	it('detects San Rafael', () => {
		expect(inferTownFromText('Pacifics game at Albert Park, San Rafael')).toEqual({
			town: 'San Rafael',
			townSlug: 'san-rafael'
		});
	});

	it('detects Point Reyes', () => {
		expect(inferTownFromText('Farmers market at Point Reyes Station')).toEqual({
			town: 'Point Reyes Station',
			townSlug: 'point-reyes'
		});
	});

	it('detects Stinson Beach', () => {
		expect(inferTownFromText('Swimming at Stinson')).toEqual({
			town: 'Stinson Beach',
			townSlug: 'stinson-beach'
		});
	});

	it('returns empty object for unrecognised text', () => {
		expect(inferTownFromText('Event in Sacramento')).toEqual({});
	});

	it('is case-insensitive', () => {
		expect(inferTownFromText('NOVATO 5K RUN')).toEqual({
			town: 'Novato',
			townSlug: 'novato'
		});
	});
});
