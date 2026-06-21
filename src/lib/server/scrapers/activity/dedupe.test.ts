import { describe, it, expect } from 'vitest';
import { dedupeItems } from './dedupe';
import type { NewsItem } from '$lib/types';

const NOW = new Date('2026-03-01T12:00:00Z').getTime();

function makeItem(overrides: Partial<NewsItem> = {}): NewsItem {
	return {
		id: 'test:id',
		title: 'Test Item',
		link: 'https://example.com/item',
		pubDate: new Date(NOW).toISOString(),
		timestamp: NOW,
		source: 'Test Source',
		category: 'shows',
		verification: 'community',
		topics: [],
		...overrides
	};
}

describe('dedupeItems', () => {
	it('returns empty for empty input', () => {
		expect(dedupeItems([], NOW)).toEqual([]);
	});

	it('keeps unique items', () => {
		const items = [
			makeItem({ link: 'https://a.com/1', title: 'A' }),
			makeItem({ link: 'https://a.com/2', title: 'B' })
		];
		expect(dedupeItems(items, NOW)).toHaveLength(2);
	});

	it('deduplicates by link within same category', () => {
		const items = [
			makeItem({ link: 'https://a.com/1', title: 'A', timestamp: NOW }),
			makeItem({ link: 'https://a.com/1', title: 'A copy', timestamp: NOW - 1000 })
		];
		const result = dedupeItems(items, NOW);
		expect(result).toHaveLength(1);
	});

	it('keeps items with same link in different categories', () => {
		const items = [
			makeItem({ link: 'https://a.com/1', category: 'shows' }),
			makeItem({ link: 'https://a.com/1', category: 'farm' })
		];
		const result = dedupeItems(items, NOW);
		expect(result).toHaveLength(2);
	});

	it('title-dedupes recurring events, keeping next upcoming', () => {
		const pastTime = NOW - 7 * 24 * 60 * 60 * 1000;
		const futureTime = NOW + 7 * 24 * 60 * 60 * 1000;
		const farFutureTime = NOW + 14 * 24 * 60 * 60 * 1000;

		const items = [
			makeItem({
				title: 'Summit Shorty Series',
				link: 'https://b17racing.com/1',
				timestamp: pastTime,
				pubDate: new Date(pastTime).toISOString()
			}),
			makeItem({
				title: 'Summit Shorty Series',
				link: 'https://b17racing.com/2',
				timestamp: futureTime,
				pubDate: new Date(futureTime).toISOString()
			}),
			makeItem({
				title: 'Summit Shorty Series',
				link: 'https://b17racing.com/3',
				timestamp: farFutureTime,
				pubDate: new Date(farFutureTime).toISOString()
			})
		];

		const result = dedupeItems(items, NOW);
		// Should keep only the next upcoming one
		expect(result).toHaveLength(1);
		expect(result[0].timestamp).toBe(futureTime);
	});

	it('keeps the latest past item when no upcoming exists', () => {
		const past1 = NOW - 14 * 24 * 60 * 60 * 1000;
		const past2 = NOW - 7 * 24 * 60 * 60 * 1000;

		const items = [
			makeItem({
				title: 'Old Series',
				link: 'https://example.com/old-1',
				timestamp: past1,
				pubDate: new Date(past1).toISOString()
			}),
			makeItem({
				title: 'Old Series',
				link: 'https://example.com/old-2',
				timestamp: past2,
				pubDate: new Date(past2).toISOString()
			})
		];

		const result = dedupeItems(items, NOW);
		expect(result).toHaveLength(1);
		expect(result[0].timestamp).toBe(past2);
	});

	it('normalizes links with trailing numeric IDs for dedupe', () => {
		const items = [
			makeItem({ link: 'https://example.com/event-123/', title: 'Same event' }),
			makeItem({ link: 'https://example.com/event-456/', title: 'Same event copy' })
		];
		const result = dedupeItems(items, NOW);
		// Both links normalize to the same key after -\d+ removal
		expect(result).toHaveLength(1);
	});

	it('returns results sorted newest first', () => {
		const t1 = NOW - 2 * 24 * 60 * 60 * 1000;
		const t2 = NOW - 1 * 24 * 60 * 60 * 1000;
		const t3 = NOW;

		const items = [
			makeItem({
				title: 'A',
				link: 'https://a.com/1',
				timestamp: t1,
				pubDate: new Date(t1).toISOString()
			}),
			makeItem({
				title: 'C',
				link: 'https://a.com/3',
				timestamp: t3,
				pubDate: new Date(t3).toISOString()
			}),
			makeItem({
				title: 'B',
				link: 'https://a.com/2',
				timestamp: t2,
				pubDate: new Date(t2).toISOString()
			})
		];

		const result = dedupeItems(items, NOW);
		expect(result[0].timestamp).toBeGreaterThanOrEqual(result[1].timestamp);
		expect(result[1].timestamp).toBeGreaterThanOrEqual(result[2].timestamp);
	});
});
