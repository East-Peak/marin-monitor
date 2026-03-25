/**
 * Service layer exports
 *
 * Internal: CacheManager, CircuitBreaker, RequestDeduplicator, ServiceRegistry
 * are used by ServiceClient internally. Not exported — import from client.ts directly.
 *
 * External: Only serviceClient is used by API adapters (nws, tides, usgs, blotter, nws-hourly).
 */
export { serviceClient, type RequestOptions, type RequestResult } from './client';
