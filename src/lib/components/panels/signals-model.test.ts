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
	it('orders alerts dated newest first with undated alerts last', () => {
		const items = [
			item('u', NaN, { isAlert: true }),
			item('old', NOW - 10, { isAlert: true }),
			item('not-alert', NOW),
			item('new', NOW, { isAlert: true })
		];
		expect(topAlerts(items).map((i) => i.id)).toEqual(['new', 'old', 'u']);
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
