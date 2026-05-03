/**
 * Generic data-fetcher factory.
 *
 * Two flavors:
 *
 * - `createDataFetcher` — silent fallback. Returns the fallback value on any
 *   failure. Used by panels that have no way to surface a degraded state.
 *
 * - `createDataFetcherWithStatus` — tagged result. Returns
 *   `{ ok: true, data, dataSource }` on success or
 *   `{ ok: false, error, fallback }` on any failure. The `dataSource` field
 *   distinguishes live blob data from server-side fallback paths
 *   (static-file fallback, legacy-format fallback, etc.) so status-aware
 *   callers don't conflate degraded data with healthy data.
 *
 * Both flavors emit the same logger.log / logger.warn output for operator
 * visibility — they only differ in what they return to the caller.
 */

import { logger } from '$lib/config/api';
import { fetchWithTimeout } from './fetch-helpers';

/**
 * How the server produced a successful response. `live` is the normal path;
 * other values mean the primary blob was unavailable and the server served
 * a degraded source. Communicated via the `X-Data-Source` response header.
 */
export type DataSource = 'live' | 'static-fallback' | 'local-fallback' | 'legacy';

export type FetchResult<T> =
	| { ok: true; data: T; dataSource: DataSource }
	| { ok: false; error: string; fallback: T };

const KNOWN_DATA_SOURCES: ReadonlySet<DataSource> = new Set([
	'live',
	'static-fallback',
	'local-fallback',
	'legacy'
]);

function parseDataSource(headerValue: string | null): DataSource {
	if (headerValue && (KNOWN_DATA_SOURCES as Set<string>).has(headerValue)) {
		return headerValue as DataSource;
	}
	return 'live';
}

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
			const dataSource = parseDataSource(response.headers?.get('X-Data-Source') ?? null);
			if (dataSource !== 'live') {
				logger.warn(serviceId, `Served from ${dataSource} (live blob unavailable)`);
			}
			return { ok: true, data: (await response.json()) as T, dataSource };
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
