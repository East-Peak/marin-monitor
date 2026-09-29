import { describe, expect, it } from 'vitest';
import { COUNTY_WIDE_RULE, isCountyScopedFeed } from './county-scope';
import { FEEDS } from './feeds';

describe('COUNTY_WIDE_RULE', () => {
	it('is the confirmed rule', () => {
		expect(COUNTY_WIDE_RULE).toEqual({
			status: 'confirmed',
			feedUrls: [
				'https://www.marinij.com/tag/marin-county/feed/',
				'https://www.nbcbayarea.com/tag/marin-county/feed/'
			],
			townSlots: 3,
			countySlots: 2,
			countyBackfillsTown: true
		});
	});
	it('every county-scoped feed is an active, fetched source', () => {
		const active = Object.values(FEEDS)
			.flat()
			.filter((f) => !f.broken)
			.map((f) => f.url);
		for (const url of COUNTY_WIDE_RULE.feedUrls) expect(active).toContain(url);
	});
	it('isCountyScopedFeed matches only listed feeds', () => {
		expect(isCountyScopedFeed('https://www.nbcbayarea.com/tag/marin-county/feed/')).toBe(true);
		expect(isCountyScopedFeed('https://www.marinij.com/tag/news/feed/')).toBe(false);
		expect(
			isCountyScopedFeed('https://www.marinij.com/tag/news/feed/', {
				...COUNTY_WIDE_RULE,
				feedUrls: ['https://www.marinij.com/tag/news/feed/']
			})
		).toBe(true);
	});
});
