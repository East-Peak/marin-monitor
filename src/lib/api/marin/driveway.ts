/**
 * Client-side adapter for Marin Driveway Index data
 */

import { createDataFetcher } from './data-fetcher';
import type { DrivewayData } from '$lib/types/driveway';

export const fetchDrivewayData = createDataFetcher<DrivewayData>(
	'/api/data/driveway',
	'Driveway',
	{ current: null, history: [] }
);
