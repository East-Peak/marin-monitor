/**
 * Client-side adapter for Marin Driveway Index data
 */

import { createDataFetcherWithStatus } from './data-fetcher';
import type { DrivewayData } from '$lib/types/driveway';

const FALLBACK: DrivewayData = { current: null, history: [] };

export const fetchDrivewayDataWithStatus = createDataFetcherWithStatus<DrivewayData>(
	'/api/data/driveway',
	'Driveway',
	FALLBACK
);
