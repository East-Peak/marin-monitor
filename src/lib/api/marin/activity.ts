import { logger } from '$lib/config/api';
import type { NewsItem } from '$lib/types';
import { fetchWithTimeout } from './fetch-helpers';

export async function fetchSupplementalActivityFeeds(): Promise<NewsItem[]> {
	try {
		logger.log(
			'ACTIVITY',
			'Loading supplemental activity feeds from static/data/marin-activity.json'
		);

		const response = await fetchWithTimeout('/data/marin-activity.json');
		if (!response.ok) {
			throw new Error(`Supplemental activity feed fetch failed: ${response.status}`);
		}

		return (await response.json()) as NewsItem[];
	} catch (error) {
		logger.warn('ACTIVITY', `Supplemental activity feed fetch failed: ${(error as Error).message}`);
		return [];
	}
}
