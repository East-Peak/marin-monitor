import { describe, expect, it } from 'vitest';
import type { NewsItem } from '$lib/types';
import { compareStoryGroups, selectFreshStories, topAlerts } from './signals-model';

const NOW = 1_000_000_000;
const item = (id: string, timestamp: number, extra: Partial<NewsItem> = {}): NewsItem => ({
	id,
	title: id,
	link: '',
	timestamp,
	source: id,
	category: 'safety',
	verification: 'official',
	...extra
});

describe('topAlerts', () => {
	it('holds only active alerts, newest first: an undated or expired one is left out', () => {
		const items = [
			item('nixle-u', NaN, { isAlert: true }),
			item('nixle-old', NOW - 10, { isAlert: true }),
			item('nixle-expired', NOW - 25 * 3_600_000, { isAlert: true }),
			item('nixle-not-alert', NOW),
			item('nixle-new', NOW, { isAlert: true })
		];
		expect(topAlerts(items, 5, NOW).map((i) => i.id)).toEqual(['nixle-new', 'nixle-old']);
	});
});

describe('compareStoryGroups', () => {
	const group = (size: number, lead: NewsItem) => ({ sources: { size }, items: [lead] });
	it('ranks by source count, then lead time with an undated lead last', () => {
		const groups = [
			group(2, item('undated', NaN)),
			group(3, item('big', NOW - 100)),
			group(2, item('dated', NOW))
		];
		expect(groups.sort(compareStoryGroups).map((g) => g.items[0].id)).toEqual([
			'big',
			'dated',
			'undated'
		]);
	});
});

describe('selectFreshStories', () => {
	it('never counts an undated or unknown-status item as fresh', () => {
		const items = [
			item('recent', NOW - 60_000),
			item('undated', NaN, { publishedAtStatus: 'missing' }),
			item('stale', NOW - 5 * 3_600_000)
		];
		expect(selectFreshStories(items, NOW, 4 * 3_600_000).map((i) => i.id)).toEqual(['recent']);
	});
});
