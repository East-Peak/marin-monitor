import { describe, expect, it } from 'vitest';
import { FUTURE_SKEW_MS, parseFeedDate, resolvePublishedAt } from './feed-date';
import { NOW } from './feed-fixtures';

describe('parseFeedDate', () => {
	it.each([
		['Mon, 28 Sep 2026 12:00:00 -0700', '2026-09-28T19:00:00.000Z'],
		['28 Sep 2026 12:00 PDT', '2026-09-28T19:00:00.000Z'],
		['Sun, 27 Sep 2026 09:30:00 GMT', '2026-09-27T09:30:00.000Z'],
		['Tue, 01 Apr 2026 10:00:00 +0000', '2026-04-01T10:00:00.000Z'],
		['2026-09-28T08:15:00-07:00', '2026-09-28T15:15:00.000Z'],
		['2026-09-28T08:15:00.250Z', '2026-09-28T08:15:00.250Z'],
		['2026-09-28T08:15Z', '2026-09-28T08:15:00.000Z']
	])('parses %s', (raw, iso) => {
		expect(new Date(parseFeedDate(raw) as number).toISOString()).toBe(iso);
	});

	it.each([
		['not-a-real-date'],
		['2026-09-28'], // date-only: no instant
		['2026-09-28T08:15:00'], // zone-less
		['Mon, 30 Feb 2026 10:00:00 GMT'], // impossible calendar date
		['2026-02-30T10:00:00Z'],
		['Mon, 28 Sep 2026 25:00:00 GMT'],
		['Mon, 28 Foo 2026 10:00:00 GMT'],
		['Mon, 28 Sep 2026 10:00:00 XYZ'],
		['Thu, 01 Jan 1970 00:00:00 GMT'], // epoch placeholder
		['']
	])('rejects %s', (raw) => {
		expect(parseFeedDate(raw)).toBeNull();
	});
});

describe('resolvePublishedAt', () => {
	it('is valid with provenance for a parseable, non-future candidate', () => {
		expect(
			resolvePublishedAt([{ source: 'rss:pubDate', raw: 'Mon, 28 Sep 2026 12:00:00 -0700' }], NOW)
		).toEqual({
			publishedAt: '2026-09-28T19:00:00.000Z',
			publishedAtRaw: 'Mon, 28 Sep 2026 12:00:00 -0700',
			publishedAtSource: 'rss:pubDate',
			publishedAtStatus: 'valid',
			publishedAtAssumedZone: null
		});
	});
	it('is missing — never now — with no candidates', () => {
		expect(resolvePublishedAt([], NOW)).toEqual({
			publishedAt: null,
			publishedAtRaw: null,
			publishedAtSource: null,
			publishedAtStatus: 'missing',
			publishedAtAssumedZone: null
		});
	});
	it('is invalid (raw kept for provenance) for an unparseable value', () => {
		const r = resolvePublishedAt([{ source: 'rss:pubDate', raw: 'not-a-real-date' }], NOW);
		expect(r.publishedAt).toBeNull();
		expect(r.publishedAtStatus).toBe('invalid');
		expect(r.publishedAtRaw).toBe('not-a-real-date');
	});
	it('rejects a time more than 5 minutes ahead as future', () => {
		const raw = new Date(NOW + FUTURE_SKEW_MS + 1_000).toISOString();
		const r = resolvePublishedAt([{ source: 'atom:published', raw }], NOW);
		expect(r.publishedAtStatus).toBe('future');
		expect(r.publishedAt).toBeNull();
	});
	it('accepts clock skew up to 5 minutes', () => {
		const raw = new Date(NOW + FUTURE_SKEW_MS).toISOString();
		expect(resolvePublishedAt([{ source: 'atom:published', raw }], NOW).publishedAtStatus).toBe(
			'valid'
		);
	});
	it('falls through an invalid pubDate to a valid dc:date', () => {
		const r = resolvePublishedAt(
			[
				{ source: 'rss:pubDate', raw: 'garbage' },
				{ source: 'rss:dc:date', raw: '2026-09-28T08:15:00-07:00' }
			],
			NOW
		);
		expect(r.publishedAtSource).toBe('rss:dc:date');
		expect(r.publishedAtStatus).toBe('valid');
	});
});

describe('declared source time zone (zone-less feeds such as NBC)', () => {
	const LA = 'America/Los_Angeles';

	it('rejects a zone-less value when the source declares no zone', () => {
		expect(parseFeedDate('Fri, Sep 25 2026 11:48:58 AM')).toBeNull();
	});
	it.each([
		['Fri, Sep 25 2026 11:48:58 AM', '2026-09-25T18:48:58.000Z'], // PDT
		['Sun, Sep 20 2026 06:57:01 PM', '2026-09-21T01:57:01.000Z'],
		['Tue, Dec 15 2026 12:05:00 AM', '2026-12-15T08:05:00.000Z'], // PST, 12 AM = 00h
		['Tue, Dec 15 2026 12:05:00 PM', '2026-12-15T20:05:00.000Z'], // 12 PM = noon
		['2026-03-08T01:30:00', '2026-03-08T09:30:00.000Z'], // just before spring-forward
		['2026-03-08T03:30:00', '2026-03-08T10:30:00.000Z'], // just after
		['25 Sep 2026 11:48:58', '2026-09-25T18:48:58.000Z']
	])('reads %s in the declared zone', (raw, iso) => {
		expect(new Date(parseFeedDate(raw, LA) as number).toISOString()).toBe(iso);
	});
	it('rejects a wall time inside the spring-forward gap (it never existed)', () => {
		expect(parseFeedDate('2026-03-08T02:30:00', LA)).toBeNull();
		expect(parseFeedDate('Sun, Mar 8 2026 02:30:00 AM', LA)).toBeNull();
	});
	it('reads a repeated fall-back hour as the earlier (daylight) instant', () => {
		// 01:30 on 1 Nov 2026 happens at 08:30Z (PDT) and again at 09:30Z (PST).
		expect(new Date(parseFeedDate('2026-11-01T01:30:00', LA) as number).toISOString()).toBe(
			'2026-11-01T08:30:00.000Z'
		);
	});
	it('reads the hours around fall-back unambiguously', () => {
		expect(new Date(parseFeedDate('2026-11-01T00:30:00', LA) as number).toISOString()).toBe(
			'2026-11-01T07:30:00.000Z'
		);
		expect(new Date(parseFeedDate('2026-11-01T02:30:00', LA) as number).toISOString()).toBe(
			'2026-11-01T10:30:00.000Z'
		);
	});
	it('still prefers an explicit zone over the declared one', () => {
		expect(
			new Date(
				parseFeedDate('Mon, 28 Sep 2026 17:09:40 -0700', 'Asia/Tokyo') as number
			).toISOString()
		).toBe('2026-09-29T00:09:40.000Z');
	});
	it('rejects an impossible 12-hour clock', () => {
		expect(parseFeedDate('Fri, Sep 25 2026 13:48:58 PM', LA)).toBeNull();
	});
	it('records the assumption as provenance', () => {
		const r = resolvePublishedAt(
			[{ source: 'rss:pubDate', raw: 'Fri, Sep 25 2026 11:48:58 AM' }],
			NOW,
			LA
		);
		expect(r).toMatchObject({ publishedAtStatus: 'valid', publishedAtAssumedZone: LA });
		const explicit = resolvePublishedAt(
			[{ source: 'rss:pubDate', raw: 'Mon, 28 Sep 2026 12:00:00 -0700' }],
			NOW,
			LA
		);
		expect(explicit.publishedAtAssumedZone).toBeNull();
	});
});
