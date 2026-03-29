/**
 * Client-side adapter for composite index data
 */

import { logger } from '$lib/config/api';
import { fetchWithTimeout } from './fetch-helpers';
import type { CompositeData } from '$lib/types/composite';

export async function fetchCompositeData(): Promise<CompositeData> {
	try {
		logger.log('Composite', 'Loading composite data from /api/data/composite');

		const response = await fetchWithTimeout('/api/data/composite');
		if (!response.ok) {
			throw new Error(`Composite data fetch failed: ${response.status}`);
		}

		return (await response.json()) as CompositeData;
	} catch (error) {
		logger.warn('Composite', `Composite data fetch failed: ${(error as Error).message}`);
		return { current: null, history: [] };
	}
}
