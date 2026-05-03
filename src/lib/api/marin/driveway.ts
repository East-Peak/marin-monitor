/**
 * Client-side adapter for Marin Driveway Index data
 */

import { createDataFetcher, createDataFetcherWithStatus } from './data-fetcher';
import type { DrivewayData } from '$lib/types/driveway';

const FALLBACK: DrivewayData = { current: null, history: [] };

export const fetchDrivewayData = createDataFetcher<DrivewayData>(
	'/api/data/driveway',
	'Driveway',
	FALLBACK
);

export const fetchDrivewayDataWithStatus = createDataFetcherWithStatus<DrivewayData>(
	'/api/data/driveway',
	'Driveway',
	FALLBACK
);
