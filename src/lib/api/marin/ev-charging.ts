/**
 * Client-side adapter for EV charging station data
 */

import { createDataFetcher } from './data-fetcher';
import type { EvChargingData } from '$lib/types/ev-charging';

export const fetchEvChargingData = createDataFetcher<EvChargingData>(
	'/api/data/ev-charging',
	'EvCharging',
	{ current: null, history: [] }
);
