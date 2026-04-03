/**
 * Generic data-fetcher factory.
 *
 * Eliminates the identical try/catch + fetchWithTimeout + logger boilerplate
 * duplicated across 12+ client-side API adapters.
 *
 * Usage:
 *   export const fetchFooData = createDataFetcher<FooData>(
 *     '/api/data/foo',
 *     'FOO',
 *     { current: null, history: [] }
 *   );
 */

import { logger } from '$lib/config/api';
import { fetchWithTimeout } from './fetch-helpers';

export function createDataFetcher<T>(
	endpoint: string,
	serviceId: string,
	fallback: T
): () => Promise<T> {
	return async (): Promise<T> => {
		try {
			logger.log(serviceId, `Loading from ${endpoint}`);
			const response = await fetchWithTimeout(endpoint);
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			return (await response.json()) as T;
		} catch (error) {
			logger.warn(serviceId, `Fetch failed: ${(error as Error).message}`);
			return fallback;
		}
	};
}
