import { beforeEach, describe, expect, it } from 'vitest';
import { fromSnapshotRead } from './source-adapters';
import { latelyView } from './lately';
import {
	resetStories,
	snapshotEntries,
	snapshotView,
	story,
	type StoryOver
} from './__fixtures__/snapshot-view';

const NOW = Date.parse('2026-10-15T18:00:00Z'); // 11:00 AM PDT
const LATELY_FEED = {
	id: 'marin-lately',
	name: 'Marin Lately',
	category: 'satire' as const,
	verification: 'satire' as const
};
const piece = (title: string, publishedAt: string, over: StoryOver = {}) =>
	story(NOW, {
		sourceId: 'marin-lately',
		source: 'Marin Lately',
		category: 'satire',
		categories: ['satire'],
		verification: 'satire',
		title,
		summary: `${title}, reportedly.`,
		publishedAt,
		...over
	});
const run = (items = [] as ReturnType<typeof piece>[]) => {
	const v = snapshotView(NOW, [story(NOW), ...items], [{}, LATELY_FEED]);
	return latelyView({ view: v, sources: snapshotEntries(v, NOW), now: NOW });
};

beforeEach(resetStories);

describe('Marin Lately band (Goal 4)', () => {
	it('quiet-for wording from newest item (Jan 2026 item at Oct 15 → "quiet for 9 months")', () => {
		const out = run([
			piece('Northern Spotted Owl Misgendered', '2025-06-11T18:00:35.000Z'),
			piece('Mother Nature Actually Kind of a Bitch', '2026-01-07T20:00:33.000Z')
		]);
		expect(out.latest).toBe('Latest piece Jan 7, 2026: the feed has been quiet for 9 months.');
		expect(out.pieces.map((p) => p.title)).toEqual([
			'Mother Nature Actually Kind of a Bitch',
			'Northern Spotted Owl Misgendered'
		]);
		// The band's source is marked stale while the feed is quiet.
		expect(out.source.kind).toBe('value');
		if (out.source.kind === 'value') expect(out.source.retainedAfter).toMatch(/9 months/);
	});

	it('a piece this month is not "quiet"', () => {
		const out = run([piece('Fresh Satire', '2026-10-10T18:00:00.000Z')]);
		expect(out.latest).toBe('Latest piece Oct 10, 2026.');
		if (out.source.kind === 'value') expect(out.source.retainedAfter).toBeNull();
	});

	it('drops subscriber-promo items', () => {
		const out = run([
			piece('Quick Update for Our Subscribers', '2026-01-08T23:30:38.000Z'),
			piece('Mother Nature Actually Kind of a Bitch', '2026-01-07T20:00:33.000Z')
		]);
		expect(out.pieces.map((p) => p.title)).toEqual(['Mother Nature Actually Kind of a Bitch']);
		expect(out.latest).toMatch(/^Latest piece Jan 7, 2026/);
	});

	it('at most six pieces, newest first', () => {
		const out = run(
			Array.from({ length: 9 }, (_, i) => piece(`Piece ${i}`, `2025-0${i + 1}-15T18:00:00.000Z`))
		);
		expect(out.pieces).toHaveLength(6);
		expect(out.pieces[0].title).toBe('Piece 8');
	});

	it('empty → "No pieces from the feed"', () => {
		const out = run([]);
		expect(out.pieces).toEqual([]);
		expect(out.empty).toBe('No pieces from the feed.');
		expect(out.latest).toBeNull();
	});

	it('a failed Lately feed in a good snapshot is unavailable, never "No pieces" (Codex desk4 #3)', () => {
		const v = snapshotView(
			NOW,
			[story(NOW)],
			[{}, { ...LATELY_FEED, status: 'failed', lastError: 'HTTP 500', lastSuccessAt: null }]
		);
		const out = latelyView({ view: v, sources: snapshotEntries(v, NOW), now: NOW });
		expect(out.empty).toBeNull();
		expect(out.source.kind).toBe('unavailable');
		const missing = snapshotView(NOW, [story(NOW)]);
		const gone = latelyView({ view: missing, sources: snapshotEntries(missing, NOW), now: NOW });
		expect(gone.empty).toBeNull();
		expect(gone.source.kind).toBe('unknown');
	});

	it('a failed snapshot read is unavailable: no pieces, no "no pieces" claim', () => {
		const out = latelyView({
			view: null,
			sources: [fromSnapshotRead({ ok: false, error: 'HTTP 503', at: NOW }, null)],
			now: NOW
		});
		expect(out.source.kind).toBe('unavailable');
		expect(out.pieces).toEqual([]);
		expect(out.empty).toBeNull();
		expect(out.latest).toBeNull();
	});
});
