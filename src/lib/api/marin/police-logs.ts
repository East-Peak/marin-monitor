import { logger } from '$lib/config/api';
import type { NewsItem } from '$lib/types';

export async function fetchSupplementalPoliceLogs(): Promise<NewsItem[]> {
	try {
		logger.log(
			'POLICE',
			'Loading supplemental police logs from static/data/marin-police-logs.json'
		);

		const response = await fetch('/data/marin-police-logs.json');
		if (!response.ok) {
			throw new Error(`Supplemental police logs fetch failed: ${response.status}`);
		}

		return (await response.json()) as NewsItem[];
	} catch (error) {
		logger.warn('POLICE', `Supplemental police logs fetch failed: ${(error as Error).message}`);
		return [];
	}
}
