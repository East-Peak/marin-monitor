/**
 * Getting Around (spec §2.5, §13.10; cameras live in the Cams strip, decision 5a).
 * Freshness limits for its detail datasets: FAA status through /api/airport-status (5-minute
 * caches) and 511 traffic through /api/traffic/corridors (2-minute CDN cache).
 */
import type { TransitAgencyRead } from '$lib/api/marin/transit';

export const AIRPORT_MAX_AGE_MS = 30 * 60_000;
export const TRAFFIC_MAX_AGE_MS = 15 * 60_000;

/** v2's one transit read: each agency's last complete read, and the error if the latest read failed. */
export interface TransitState {
	reads: readonly TransitAgencyRead[] | null;
	error: string | null;
}
