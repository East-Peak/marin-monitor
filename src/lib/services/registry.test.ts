import { describe, it, expect } from 'vitest';
import { ServiceRegistry } from './registry';

describe('ServiceRegistry', () => {
	describe('get', () => {
		it('should return config for registered service', () => {
			const config = ServiceRegistry.get('NWS');

			expect(config).not.toBeNull();
			expect(config?.id).toBe('nws');
			expect(config?.baseUrl).toBe('https://api.weather.gov');
		});

		it('should return null for unknown service', () => {
			const config = ServiceRegistry.get('UNKNOWN');

			expect(config).toBeNull();
		});
	});

	describe('getServiceIds', () => {
		it('should return all registered service IDs', () => {
			const ids = ServiceRegistry.getServiceIds();

			expect(ids).toContain('NWS');
			expect(ids).toContain('NOAA_TIDES');
			expect(ids).toContain('USGS');
			expect(ids).toContain('AIRNOW');
			expect(ids).toContain('MARIN_OPENDATA');
			expect(ids).toContain('CORS_PROXY');
		});
	});

	describe('has', () => {
		it('should return true for registered services', () => {
			expect(ServiceRegistry.has('NWS')).toBe(true);
			expect(ServiceRegistry.has('AIRNOW')).toBe(true);
		});

		it('should return false for unknown services', () => {
			expect(ServiceRegistry.has('UNKNOWN')).toBe(false);
		});
	});

	describe('getCorsProxies', () => {
		it('should return list of CORS proxies', () => {
			const proxies = ServiceRegistry.getCorsProxies();

			expect(proxies).toBeInstanceOf(Array);
			expect(proxies.length).toBeGreaterThan(0);
			expect(proxies[0]).toContain('corsproxy');
		});
	});

	describe('getAll', () => {
		it('should return all service configurations', () => {
			const all = ServiceRegistry.getAll();

			expect(all.NWS).toBeDefined();
			expect(all.NOAA_TIDES).toBeDefined();
			expect(all.MARIN_OPENDATA).toBeDefined();
		});
	});

	describe('service configurations', () => {
		it('should have valid cache config for NWS', () => {
			const config = ServiceRegistry.get('NWS');

			expect(config?.cache?.ttl).toBe(15 * 60 * 1000);
			expect(config?.cache?.staleWhileRevalidate).toBe(true);
		});

		it('should have valid circuit breaker config for AIRNOW', () => {
			const config = ServiceRegistry.get('AIRNOW');

			expect(config?.circuitBreaker?.failureThreshold).toBe(3);
			expect(config?.circuitBreaker?.resetTimeout).toBe(120000);
		});

		it('should have longer TTL for MARIN_OPENDATA (infrequent updates)', () => {
			const config = ServiceRegistry.get('MARIN_OPENDATA');

			expect(config?.cache?.ttl).toBe(6 * 60 * 60 * 1000); // 6 hours
		});
	});
});
