import { describe, expect, it } from 'vitest';
import type { NewsItem } from '$lib/types';
import { selectNearby } from './tv-nearby';

const NOW = Date.parse('2026-09-28T20:00:00.000Z');
const DAY = 86_400_000;
const Q = {
	lat: 38.1,
	lon: -122.57,
	radius: 0.05,
	nearbyTownSlugs: new Set(['novato']),
	nowMs: NOW,
	maxAgeMs: 7 * DAY
};
const item = (
	id: string,
	category: NewsItem['category'],
	timestamp: number,
	extra: Partial<NewsItem> = {}
): NewsItem => ({
	id,
	title: id,
	link: '',
	timestamp,
	source: 's',
	category,
	verification: 'local_media',
	townSlug: 'novato',
	...extra
});

describe('selectNearby', () => {
	it('excludes undated and future-status items from the seven-day window', () => {
		const items = [
			item('dated', 'local', NOW - DAY),
			item('undated', 'local', NaN, { publishedAtStatus: 'missing' }),
			item('meeting', 'civic', NaN, {
				publishedAtStatus: 'missing',
				eventAt: '2026-10-06T17:00:00.000Z'
			}),
			item('too-old', 'local', NOW - 8 * DAY)
		];
		expect(selectNearby(items, Q).map((i) => i.id)).toEqual(['dated']);
	});

	it('orders across categories globally, newest first', () => {
		// allNewsItems concatenates by category: local first, then safety.
		const items = [
			item('local-old', 'local', NOW - 3 * DAY),
			item('safety-new', 'safety', NOW - 1_000)
		];
		expect(selectNearby(items, Q).map((i) => i.id)).toEqual(['safety-new', 'local-old']);
	});

	it('keeps exact pins within the radius and drops other towns', () => {
		const items = [
			item('pin', 'local', NOW, { townSlug: undefined, lat: 38.11, lon: -122.56 }),
			item('far', 'local', NOW, { townSlug: 'sausalito' })
		];
		expect(selectNearby(items, Q).map((i) => i.id)).toEqual(['pin']);
	});
});
