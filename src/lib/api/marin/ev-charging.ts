/**
 * Client-side adapter for EV charging station data
 */

import { createDataFetcher, createDataFetcherWithStatus } from './data-fetcher';
import type { EvChargingData } from '$lib/types/ev-charging';

const FALLBACK: EvChargingData = { current: null, history: [] };

export const fetchEvChargingData = createDataFetcher<EvChargingData>(
	'/api/data/ev-charging',
	'EvCharging',
	FALLBACK
);

/** Status-aware and owner-aware: the v2 dataset owner needs failures and fallbacks reported (spec §13.7). */
export const fetchEvChargingDataWithStatus = createDataFetcherWithStatus<EvChargingData>(
	'/api/data/ev-charging',
	'EvCharging',
	FALLBACK
);
