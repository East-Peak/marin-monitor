import { logger } from '$lib/config/api';
import type { NewsItem } from '$lib/types';
import { fetchWithTimeout } from './fetch-helpers';

export async function fetchSupplementalPoliceLogs(): Promise<NewsItem[]> {
	try {
		logger.log('POLICE', 'Loading supplemental police logs from /api/data/police-logs');

		const response = await fetchWithTimeout('/api/data/police-logs');
		if (!response.ok) {
			throw new Error(`Supplemental police logs fetch failed: ${response.status}`);
		}

		return (await response.json()) as NewsItem[];
	} catch (error) {
		logger.warn('POLICE', `Supplemental police logs fetch failed: ${(error as Error).message}`);
		return [];
	}
}
