import { describe, expect, it } from 'vitest';
import {
	NEWS_SNAPSHOT_SCHEMA_VERSION,
	parseNewsSnapshot,
	parseNewsSnapshotResponse,
	parseNewsSnapshotView,
	salvageRevision,
	toNewsSnapshotView,
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
	// b is retained: its item is the one fetched at its last success.
	const b1 = { ...sourceItem('b', '1'), fetchedAt: '2026-09-28T19:45:00.000Z' };
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
/** The same edit to both views of a's story, so only the edited rule can object. */
const bothViews = (s: NewsSnapshot, edit: (item: Record<string, unknown>) => void) => {
	edit(item0(s));
	edit(s.sources[0].items[0] as unknown as Record<string, unknown>);
};
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
		],
		// Codex slice-2 #3: publication provenance must be real.
		[
			'a valid publication whose raw date is not a date',
			(s) => bothViews(s, (i) => (i.publishedAtRaw = 'not a date'))
		],
		[
			'a valid publication whose raw date names another instant',
			(s) => bothViews(s, (i) => (i.publishedAtRaw = 'Mon, 28 Sep 2026 11:00:00 -0700'))
		],
		[
			'an assumed zone recorded for a raw date that carries its own zone',
			(s) => bothViews(s, (i) => (i.publishedAtAssumedZone = 'America/Los_Angeles'))
		],
		[
			'an invalid status for a raw date that parses',
			(s) =>
				bothViews(s, (i) => {
					i.publishedAtStatus = 'invalid';
					i.publishedAt = null;
				})
		],
		[
			'an event time alongside a publication time (event-start keeps publication unknown)',
			(s) =>
				bothViews(s, (i) => {
					i.eventAt = '2026-10-01T02:00:00.000Z';
					i.eventAtSource = 'rss:pubDate';
				})
		],
		// Codex slice-2 #4: the public view and the retention view must agree.
		[
			'a public story its source no longer carries',
			(s) =>
				Object.assign(s.sources[0], {
					status: 'failed',
					lastError: 'http-status: HTTP 503',
					consecutiveFailures: 1,
					itemCount: 0,
					items: []
				})
		],
		[
			'a reporter whose own collection is empty',
			(s) =>
				Object.assign(s.sources[1], {
					status: 'failed',
					itemCount: 0,
					items: []
				})
		],
		['a public copy titled differently from its source copy', (s) => (item0(s).title = 'Other')],
		['an ok source with no last success', (s) => (s.sources[0].lastSuccessAt = null)],
		[
			'an ok source whose last success is not this attempt',
			(s) => (s.sources[0].lastSuccessAt = '2026-09-28T19:00:00.000Z')
		],
		[
			'a retained item fetched after its source last succeeded',
			(s) => (s.sources[1].items[0].fetchedAt = '2026-09-28T19:50:00.000Z')
		]
	])('rejects %s', (_label, mutate) => {
		const s = valid() as NewsSnapshot & Record<string, unknown>;
		mutate(s);
		expect(parseNewsSnapshot(JSON.parse(JSON.stringify(s)))).toBeNull();
	});

	it.each<[string, Mutate]>([
		[
			'a dedupe-suffixed id for a same-source GUID reused by another story',
			(s) => {
				const again = { ...s.sources[0].items[0], title: 'Story 1, again' };
				Object.assign(s.sources[0], { itemCount: 2, items: [s.sources[0].items[0], again] });
				s.items.push({ ...again, id: `${again.id}~2`, categories: ['local'], alsoReportedBy: [] });
			}
		],
		[
			'a zone-less raw date read in its recorded assumed zone',
			(s) =>
				bothViews(s, (i) => {
					i.publishedAtRaw = 'Mon, Sep 28 2026 12:00:00 PM';
					i.publishedAtAssumedZone = 'America/Los_Angeles';
				})
		],
		[
			'an event-start item: event time known, publication unknown',
			(s) =>
				bothViews(s, (i) =>
					Object.assign(i, {
						publishedAt: null,
						publishedAtRaw: null,
						publishedAtSource: null,
						publishedAtStatus: 'missing',
						eventAt: '2026-10-01T02:00:00.000Z',
						eventAtSource: 'rss:pubDate'
					})
				)
		],
		[
			'a future raw date kept as provenance',
			(s) =>
				bothViews(s, (i) =>
					Object.assign(i, {
						publishedAt: null,
						publishedAtRaw: 'Mon, 28 Sep 2026 14:00:00 -0700',
						publishedAtStatus: 'future'
					})
				)
		]
	])('accepts %s', (_label, mutate) => {
		const s = valid() as NewsSnapshot & Record<string, unknown>;
		mutate(s);
		expect(parseNewsSnapshot(JSON.parse(JSON.stringify(s)))).not.toBeNull();
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

type ViewMutate = (
	v: { sources: Record<string, unknown>[]; items: Record<string, unknown>[] } & Record<
		string,
		unknown
	>
) => void;
/** A JSON round-tripped view of valid(), edited by one rule. */
const viewWith = (mutate: ViewMutate = () => {}) => {
	const v = JSON.parse(JSON.stringify(toNewsSnapshotView(valid())));
	mutate(v);
	return v;
};

describe('toNewsSnapshotView / parseNewsSnapshotView', () => {
	it('serves the deduplicated items and each source status, never the retention items', () => {
		const snapshot = valid();
		const view = toNewsSnapshotView(snapshot);
		expect(view).toMatchObject({
			schemaVersion: NEWS_SNAPSHOT_SCHEMA_VERSION,
			revision: 3,
			generatedAt: T,
			lastSuccessfulScrapeAt: T
		});
		expect(view.items).toEqual(snapshot.items);
		expect(view.sources).toEqual(snapshot.sources.map(({ items: _items, ...status }) => status));
		expect(view.sources.some((s) => 'items' in s)).toBe(false);
	});

	it('a view survives JSON and the strict reader unchanged', () => {
		expect(parseNewsSnapshotView(viewWith())).toEqual(toNewsSnapshotView(valid()));
	});

	it.each<[string, ViewMutate]>([
		['an unknown schema version', (v) => void (v.schemaVersion = 2)],
		['revision 0', (v) => void (v.revision = 0)],
		['a non-canonical generatedAt', (v) => void (v.generatedAt = '2026-09-28T20:00:00Z')],
		[
			'a successful scrape after generation',
			(v) => void (v.lastSuccessfulScrapeAt = '2026-09-28T20:10:00.000Z')
		],
		['an inherited status name', (v) => void (v.sources[0].status = 'toString')],
		['a duplicate source id', (v) => void (v.sources[1].id = 'a')],
		['a negative itemCount', (v) => void (v.sources[0].itemCount = -1)],
		['an ok source with no items', (v) => void (v.sources[0].itemCount = 0)],
		[
			'an ok source with 100 failures, an error and no success (Codex r1 #13)',
			(v) =>
				void Object.assign(v.sources[0], {
					consecutiveFailures: 100,
					lastError: 'x',
					lastSuccessAt: null,
					itemCount: 0
				})
		],
		[
			'a source attempted after the view was generated',
			(v) => void (v.sources[1].lastAttemptAt = '2099-01-01T00:00:00.000Z')
		],
		[
			'a success after its own attempt',
			(v) => void (v.sources[1].lastSuccessAt = '2026-09-28T20:10:00.000Z')
		],
		[
			'an item from an unlisted source',
			(v) => {
				v.items[0].sourceId = 'zzz';
				v.items[0].id = 'zzz:1';
			}
		],
		['alsoReportedBy an unlisted source', (v) => void (v.items[0].alsoReportedBy = ['zzz'])],
		['categories without the own category', (v) => void (v.items[0].categories = ['safety'])],
		[
			'a publication time its raw value does not support',
			(v) => void (v.items[0].publishedAt = '2026-09-28T18:00:00.000Z')
		],
		[
			'an item fetched after the view was generated',
			(v) => void (v.items[0].fetchedAt = '2026-09-28T20:06:00.000Z')
		],
		['a duplicate story id', (v) => void v.items.push({ ...v.items[0] })],
		['items that are not an array', (v) => void (v.items = {} as never)],
		[
			'stories from a source that carries none (Codex r2 #7 repro)',
			(v) => void Object.assign(v.sources[0], { status: 'empty', itemCount: 0 })
		],
		[
			"a story fetched after its source's last success",
			(v) => void (v.items[0].fetchedAt = '2026-09-28T20:01:00.000Z')
		],
		[
			'alsoReportedBy a source that now carries nothing',
			(v) =>
				void Object.assign(v.sources[1], {
					status: 'failed',
					itemCount: 0,
					lastError: 'x',
					consecutiveFailures: 1
				})
		],
		[
			'more public stories than the source carries',
			(v) => void v.items.push({ ...v.items[0], id: 'a:2', title: 'Story 2' })
		],
		[
			'two stories citing a source that carries one item (Codex r3 #4)',
			(v) => {
				v.sources[0].itemCount = 2;
				v.items.push({ ...v.items[0], id: 'a:2', title: 'Story 2', alsoReportedBy: ['b'] });
			}
		]
	])('rejects %s', (_name, mutate) => {
		expect(parseNewsSnapshotView(viewWith(mutate))).toBeNull();
	});
});

describe('parseNewsSnapshotResponse', () => {
	it('accepts ok with a valid view, and each honest failure', () => {
		expect(parseNewsSnapshotResponse({ status: 'ok', snapshot: viewWith() })).toEqual({
			status: 'ok',
			snapshot: toNewsSnapshotView(valid())
		});
		expect(parseNewsSnapshotResponse({ status: 'unavailable', reason: 'missing' })).toEqual({
			status: 'unavailable',
			reason: 'missing'
		});
		for (const reason of ['invalid', 'read-failed', 'not-configured'] as const) {
			expect(parseNewsSnapshotResponse({ status: 'unknown', reason })).toEqual({
				status: 'unknown',
				reason
			});
		}
	});

	it.each<[string, unknown]>([
		['ok with an invalid view', { status: 'ok', snapshot: viewWith((v) => void (v.revision = 0)) }],
		['ok without a view', { status: 'ok' }],
		['unavailable for an unknown reason', { status: 'unavailable', reason: 'invalid' }],
		['unknown with an inherited reason', { status: 'unknown', reason: 'toString' }],
		['an unknown status', { status: 'error', reason: 'missing' }],
		['null', null],
		['an array', []]
	])('rejects %s', (_name, value) => {
		expect(parseNewsSnapshotResponse(value)).toBeNull();
	});
});
