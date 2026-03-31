/**
 * Client-side adapter for the Marin Coffee Index.
 */

import { logger } from '$lib/config/api';
import { fetchWithTimeout } from './fetch-helpers';
import type { CoffeeIndexData } from '$lib/types/coffee';

export async function fetchCoffeeIndexData(): Promise<CoffeeIndexData> {
	try {
		logger.log('Coffee', 'Loading coffee index from /api/data/coffee');

		const response = await fetchWithTimeout('/api/data/coffee');
		if (!response.ok) {
			throw new Error(`Coffee index fetch failed: ${response.status}`);
		}

		return (await response.json()) as CoffeeIndexData;
	} catch (error) {
		logger.warn('Coffee', `Coffee index fetch failed: ${(error as Error).message}`);
		return { current: null, history: [] };
	}
}
