/**
 * Generic data-fetcher factory.
 *
 * Two flavors:
 *
 * - `createDataFetcher` — silent fallback. Returns the fallback value on any
 *   failure. Used by panels that have no way to surface a degraded state.
 *
 * - `createDataFetcherWithStatus` — tagged result. Returns
 *   `{ ok: true, data }` on success or `{ ok: false, error, fallback }` on
 *   any failure. Used by callers (e.g., TV wallboard) that need to know
 *   whether a refresh batch actually succeeded.
 *
 * Both flavors emit the same logger.log / logger.warn output for operator
 * visibility — they only differ in what they return to the caller.
 */

import { logger } from '$lib/config/api';
import { fetchWithTimeout } from './fetch-helpers';

export type FetchResult<T> =
	| { ok: true; data: T }
	| { ok: false; error: string; fallback: T };

export function createDataFetcherWithStatus<T>(
	endpoint: string,
	serviceId: string,
	fallback: T
): () => Promise<FetchResult<T>> {
	return async (): Promise<FetchResult<T>> => {
		try {
			logger.log(serviceId, `Loading from ${endpoint}`);
			const response = await fetchWithTimeout(endpoint);
			if (!response.ok) {
				const error = `HTTP ${response.status}`;
				logger.warn(serviceId, `Fetch failed: ${error}`);
				return { ok: false, error, fallback };
			}
			return { ok: true, data: (await response.json()) as T };
		} catch (error) {
			const message = (error as Error).message;
			logger.warn(serviceId, `Fetch failed: ${message}`);
			return { ok: false, error: message, fallback };
		}
	};
}

export function createDataFetcher<T>(
	endpoint: string,
	serviceId: string,
	fallback: T
): () => Promise<T> {
	const withStatus = createDataFetcherWithStatus<T>(endpoint, serviceId, fallback);
	return async (): Promise<T> => {
		const result = await withStatus();
		return result.ok ? result.data : result.fallback;
	};
}
