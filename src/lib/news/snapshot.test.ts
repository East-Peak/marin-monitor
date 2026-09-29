import { describe, expect, it } from 'vitest';
import {
	NEWS_SNAPSHOT_SCHEMA_VERSION,
	parseNewsSnapshot,
	salvageRevision,
	type NewsSnapshot,
	type NewsSourceItem
} from './snapshot';

const T = '2026-09-28T20:00:00.000Z';

const sourceItem = (sourceId: string, id: string): NewsSourceItem => ({
	id: `${sourceId}:${id}`,
	sourceId,
	source: sourceId === 'a' ? 'Source A' : 'Source B',
	category: 'local',
	verification: 'local_media',
	title: `Story ${id}`,
	link: `https://x.example/${id}`,
	canonicalUrl: `https://x.example/${id}`,
	summary: null,
	publishedAt: '2026-09-28T19:00:00.000Z',
	publishedAtRaw: 'Mon, 28 Sep 2026 12:00:00 -0700',
	publishedAtSource: 'rss:pubDate',
	publishedAtStatus: 'valid',
	publishedAtAssumedZone: null,
	eventAt: null,
	eventAtSource: null,
	updatedAt: null,
	fetchedAt: T,
	town: { name: 'Mill Valley', slug: 'mill-valley', source: 'title-match' },
	point: null,
	topics: []
});

function valid(): NewsSnapshot {
	const a1 = sourceItem('a', '1');
	const b1 = sourceItem('b', '1');
	return {
		schemaVersion: NEWS_SNAPSHOT_SCHEMA_VERSION,
		revision: 3,
		generatedAt: T,
		lastSuccessfulScrapeAt: T,
		sources: [
			{
				id: 'a',
				name: 'Source A',
				category: 'local',
				verification: 'local_media',
				status: 'ok',
				lastAttemptAt: T,
				lastSuccessAt: T,
				lastError: null,
				consecutiveFailures: 0,
				itemCount: 1,
				items: [a1]
			},
			{
				id: 'b',
				name: 'Source B',
				category: 'safety',
				verification: 'local_media',
				status: 'retained',
				lastAttemptAt: T,
				lastSuccessAt: '2026-09-28T19:45:00.000Z',
				lastError: 'timeout: deadline 10000ms exceeded',
				consecutiveFailures: 1,
				itemCount: 1,
				items: [b1]
			}
		],
		items: [{ ...a1, categories: ['local', 'safety'], alsoReportedBy: ['b'] }]
	};
}

type Mutate = (s: NewsSnapshot & Record<string, unknown>) => void;
const item0 = (s: NewsSnapshot) => s.items[0] as unknown as Record<string, unknown>;
const src0 = (s: NewsSnapshot) => s.sources[0] as unknown as Record<string, unknown>;

describe('parseNewsSnapshot', () => {
	it('accepts a well-formed snapshot (round-trips through JSON)', () => {
		const s = valid();
		expect(parseNewsSnapshot(JSON.parse(JSON.stringify(s)))).toEqual(s);
	});

	it.each<[string, Mutate]>([
		['an unknown schema version', (s) => (s.schemaVersion = 2 as 1)],
		['a zero revision', (s) => (s.revision = 0)],
		['a non-ISO generatedAt', (s) => (s.generatedAt = '28 Sep 2026')],
		['valid status with a garbage publishedAt', (s) => (item0(s).publishedAt = 'garbage')],
		['valid status with a null publishedAt', (s) => (item0(s).publishedAt = null)],
		[
			'missing status that still carries a raw date',
			(s) => {
				item0(s).publishedAtStatus = 'missing';
				item0(s).publishedAt = null;
			}
		],
		['an unknown date status', (s) => (item0(s).publishedAtStatus = 'now')],
		['a javascript: link', (s) => (item0(s).link = 'javascript:alert(1)')],
		['a non-https canonical URL', (s) => (item0(s).canonicalUrl = 'http://x.example/1')],
		['a missing canonicalUrl field', (s) => delete item0(s).canonicalUrl],
		['a missing source name', (s) => delete item0(s).source],
		['numeric categories', (s) => (item0(s).categories = [1])],
		['a category list without the item category', (s) => (item0(s).categories = ['safety'])],
		['an unknown category', (s) => (item0(s).category = 'gossip')],
		['a null reporter id', (s) => (item0(s).alsoReportedBy = [null])],
		['a reporter that is not a source', (s) => (item0(s).alsoReportedBy = ['zz'])],
		['an item from an unknown source', (s) => (item0(s).sourceId = 'zz')],
		['duplicate item ids', (s) => s.items.push({ ...s.items[0] })],
		['duplicate source ids', (s) => s.sources.push({ ...s.sources[0] })],
		['eventAt without its source', (s) => (item0(s).eventAt = T)],
		['an out-of-range point', (s) => (item0(s).point = { lat: 99, lon: 0, source: 'feed' })],
		['an unknown source status', (s) => (src0(s).status = 'great')],
		['itemCount disagreeing with items', (s) => (src0(s).itemCount = 5)],
		['ok with a recorded error', (s) => (src0(s).lastError = 'x')],
		['retained with no failures', (s) => (s.sources[1].consecutiveFailures = 0)],
		['a source item filed under another source', (s) => (s.sources[0].items[0].sourceId = 'b')],
		[
			'a malformed source item',
			(s) => ((s.sources[0].items[0] as unknown as Record<string, unknown>).link = 'javascript:x')
		],
		['items not an array', (s) => ((s as Record<string, unknown>).items = {})],
		['an inherited status name "toString"', (s) => (src0(s).status = 'toString')],
		['an inherited status name "hasOwnProperty"', (s) => (src0(s).status = 'hasOwnProperty')],
		['an inherited status name "__proto__"', (s) => (src0(s).status = '__proto__')],
		[
			'a valid publication date in 2098',
			(s) => {
				item0(s).publishedAt = '2098-04-01T10:00:00.000Z';
				s.sources[0].items[0].publishedAt = '2098-04-01T10:00:00.000Z';
			}
		],
		[
			'a valid publication time after its own fetch (beyond skew)',
			(s) => {
				item0(s).publishedAt = '2026-09-28T20:10:00.000Z';
			}
		],
		[
			'an item fetched after the revision was generated',
			(s) => {
				item0(s).fetchedAt = '2026-09-28T21:00:00.000Z';
			}
		],
		[
			'a last success after the last attempt',
			(s) => (s.sources[1].lastSuccessAt = '2026-09-28T21:00:00.000Z')
		],
		[
			'lastSuccessfulScrapeAt after generatedAt',
			(s) => (s.lastSuccessfulScrapeAt = '2026-09-28T21:00:00.000Z')
		]
	])('rejects %s', (_label, mutate) => {
		const s = valid() as NewsSnapshot & Record<string, unknown>;
		mutate(s);
		expect(parseNewsSnapshot(JSON.parse(JSON.stringify(s)))).toBeNull();
	});

	it.each(['toString', 'hasOwnProperty', 'valueOf', '__proto__'])(
		'returns null — never throws — for source status %s',
		(status) => {
			const s = JSON.parse(JSON.stringify(valid()));
			s.sources[0].status = status;
			expect(() => parseNewsSnapshot(s)).not.toThrow();
			expect(parseNewsSnapshot(s)).toBeNull();
		}
	);

	it.each([null, [], 'x', 3])('rejects a non-object (%s)', (value) => {
		expect(parseNewsSnapshot(value)).toBeNull();
	});
});

describe('salvageRevision', () => {
	it('recovers the revision of an otherwise unusable blob so numbering stays monotonic', () => {
		expect(salvageRevision({ schemaVersion: 99, revision: 57 })).toBe(57);
		expect(salvageRevision({ revision: 'x' })).toBe(0);
		expect(salvageRevision(null)).toBe(0);
	});
});
