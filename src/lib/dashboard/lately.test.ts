import { beforeEach, describe, expect, it } from 'vitest';
import { fromSnapshotRead } from './source-adapters';
import { LATELY_LINK, latelyView } from './lately';
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

const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();

describe('Marin Lately band (Goal 4; DASH-FLIP1 gate)', () => {
	it('links out to their own site, and each piece to its post there', () => {
		expect(LATELY_LINK).toBe('https://www.marinlately.com/');
		const link = 'https://www.marinlately.com/a-made-up-piece/';
		const out = run([piece('A Made-Up Piece', iso(NOW - DAY), { link })]);
		expect(out?.pieces[0].link).toBe(link);
	});

	it('newest piece exactly 30 days old → shown', () => {
		const out = run([piece('Edge Satire', iso(NOW - 30 * DAY))]);
		expect(out?.pieces.map((p) => p.title)).toEqual(['Edge Satire']);
	});

	it('newest piece 31 days old → hidden: no band, no "quiet" text', () => {
		expect(run([piece('Old Satire', iso(NOW - 31 * DAY))])).toBeNull();
		// Today's feed: the newest piece is Jan 7, 2026.
		expect(
			run([
				piece('Northern Spotted Owl Misgendered', '2025-06-11T18:00:35.000Z'),
				piece('Mother Nature Actually Kind of a Bitch', '2026-01-07T20:00:33.000Z')
			])
		).toBeNull();
	});

	it('no pieces → hidden', () => {
		expect(run([])).toBeNull();
	});

	it('a recent piece shows its date, never a "quiet" claim', () => {
		const out = run([piece('Fresh Satire', '2026-10-10T18:00:00.000Z')]);
		expect(out?.latest).toBe('Latest piece Oct 10, 2026.');
		if (out?.source.kind === 'value') expect(out.source.retainedAfter).toBeNull();
	});

	it('drops subscriber-promo items', () => {
		const out = run([
			piece('Quick Update for Our Subscribers', '2026-10-12T23:30:38.000Z'),
			piece('Mother Nature Actually Kind of a Bitch', '2026-10-07T20:00:33.000Z')
		]);
		expect(out?.pieces.map((p) => p.title)).toEqual(['Mother Nature Actually Kind of a Bitch']);
		expect(out?.latest).toBe('Latest piece Oct 7, 2026.');
		// A promo alone is no piece: hidden.
		expect(run([piece('Quick Update for Our Subscribers', '2026-10-12T23:30:38.000Z')])).toBeNull();
	});

	it('at most six pieces, newest first', () => {
		const out = run(
			Array.from({ length: 9 }, (_, i) => piece(`Piece ${i}`, iso(NOW - (i + 1) * DAY)))
		);
		expect(out?.pieces).toHaveLength(6);
		expect(out?.pieces[0].title).toBe('Piece 0');
	});

	it('a failed Lately feed carries its own status beside a recent piece', () => {
		const v = snapshotView(
			NOW,
			[story(NOW), piece('Fresh Satire', '2026-10-10T18:00:00.000Z')],
			[{}, { ...LATELY_FEED, status: 'retained', lastError: 'HTTP 500' }]
		);
		const out = latelyView({ view: v, sources: snapshotEntries(v, NOW), now: NOW });
		expect(out?.pieces).toHaveLength(1);
		expect(out?.source.kind).toBe('value');
	});

	it('a failed snapshot read → hidden', () => {
		const out = latelyView({
			view: null,
			sources: [fromSnapshotRead({ ok: false, error: 'HTTP 503', at: NOW }, null)],
			now: NOW
		});
		expect(out).toBeNull();
	});
});
