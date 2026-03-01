/**
 * ServiceRegistry - Service configurations for Marin Monitor external APIs
 */

export interface CacheConfig {
	ttl: number;
	staleWhileRevalidate: boolean;
}

export interface CircuitBreakerConfig {
	failureThreshold: number;
	resetTimeout: number;
}

export interface ServiceConfig {
	id: string;
	baseUrl: string | null;
	timeout: number;
	retries: number;
	cache?: CacheConfig;
	circuitBreaker?: CircuitBreakerConfig;
	proxies?: string[];
}

export type ServiceId = 'NWS' | 'NOAA_TIDES' | 'USGS' | 'AIRNOW' | 'MARIN_OPENDATA';

const SERVICE_CONFIG: Record<ServiceId, ServiceConfig> = {
	NWS: {
		id: 'nws',
		baseUrl: 'https://api.weather.gov',
		timeout: 10000,
		retries: 2,
		cache: {
			ttl: 15 * 60 * 1000, // 15 minutes
			staleWhileRevalidate: true
		},
		circuitBreaker: {
			failureThreshold: 3,
			resetTimeout: 60000
		}
	},

	NOAA_TIDES: {
		id: 'noaa_tides',
		baseUrl: 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter',
		timeout: 10000,
		retries: 2,
		cache: {
			ttl: 60 * 60 * 1000, // 1 hour
			staleWhileRevalidate: true
		},
		circuitBreaker: {
			failureThreshold: 3,
			resetTimeout: 60000
		}
	},

	USGS: {
		id: 'usgs',
		baseUrl: 'https://earthquake.usgs.gov',
		timeout: 10000,
		retries: 2,
		cache: {
			ttl: 5 * 60 * 1000, // 5 minutes
			staleWhileRevalidate: true
		},
		circuitBreaker: {
			failureThreshold: 3,
			resetTimeout: 60000
		}
	},

	AIRNOW: {
		id: 'airnow',
		baseUrl: 'https://www.airnowapi.org',
		timeout: 10000,
		retries: 2,
		cache: {
			ttl: 30 * 60 * 1000, // 30 minutes
			staleWhileRevalidate: true
		},
		circuitBreaker: {
			failureThreshold: 3,
			resetTimeout: 120000
		}
	},

	MARIN_OPENDATA: {
		id: 'marin_opendata',
		baseUrl: 'https://data.marincounty.org/resource',
		timeout: 15000,
		retries: 2,
		cache: {
			ttl: 6 * 60 * 60 * 1000, // 6 hours
			staleWhileRevalidate: true
		},
		circuitBreaker: {
			failureThreshold: 3,
			resetTimeout: 120000
		}
	}
};

export class ServiceRegistry {
	/**
	 * Get configuration for a service
	 */
	static get(serviceId: ServiceId | string): ServiceConfig | null {
		return SERVICE_CONFIG[serviceId as ServiceId] || null;
	}

	/**
	 * Get all service IDs
	 */
	static getServiceIds(): ServiceId[] {
		return Object.keys(SERVICE_CONFIG) as ServiceId[];
	}

	/**
	 * Get all service configurations
	 */
	static getAll(): Record<ServiceId, ServiceConfig> {
		return { ...SERVICE_CONFIG };
	}

	/**
	 * Check if a service is registered
	 */
	static has(serviceId: string): serviceId is ServiceId {
		return Object.hasOwn(SERVICE_CONFIG, serviceId);
	}
}

export { SERVICE_CONFIG };
