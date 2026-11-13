/** Client-side adapter for SF-area grocery inflation (BLS food at home). */
import { createDataFetcherWithStatus } from './data-fetcher';
import type { GroceryInflation } from '$lib/grocery/inflation';

const FALLBACK: GroceryInflation = { status: 'unavailable', reason: 'not read yet' };

export const fetchGroceryInflationWithStatus = createDataFetcherWithStatus<GroceryInflation>(
	'/api/data/grocery-inflation',
	'GroceryInflation',
	FALLBACK
);
