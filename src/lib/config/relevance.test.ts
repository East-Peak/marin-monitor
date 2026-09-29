import { describe, expect, it } from 'vitest';
import { getRelevanceDecision } from './relevance';
import type { NewsItem } from '$lib/types';

function makeItem(overrides: Partial<NewsItem>): NewsItem {
	return {
		id: '1',
		title: 'Official advisory',
		link: 'https://example.com',
		timestamp: Date.now(),
		source: 'Central Marin PD',
		category: 'safety',
		verification: 'official',
		...overrides
	};
}

describe('getRelevanceDecision', () => {
	it('treats the City of Belvedere feed as strict-local official news', () => {
		const item = { title: 'City Council Report', description: 'Agenda highlights.' };
		const belvedere = getRelevanceDecision(makeItem({ ...item, source: 'City of Belvedere' }));
		const unlisted = getRelevanceDecision(makeItem({ ...item, source: 'Unlisted Source' }));
		expect(belvedere.score - unlisted.score).toBe(2);
	});

	it('keeps strict-local official sources even without an explicit town mention', () => {
		const decision = getRelevanceDecision(
			makeItem({
				title: 'Road Closure - Doherty Drive, Lucky Drive, and Fifer Ave',
				description: 'Official advisory from the agency alert feed.'
			})
		);

		expect(decision.keep).toBe(true);
	});

	it('still rejects mixed-source global politics without a local anchor', () => {
		const decision = getRelevanceDecision(
			makeItem({
				source: 'KQED News',
				verification: 'local_media',
				title: 'FBI fires agents who worked on Trump classified document investigation',
				description: 'AP sources say'
			})
		);

		expect(decision.keep).toBe(false);
	});
});
