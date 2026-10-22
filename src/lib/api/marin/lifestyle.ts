/**
 * Client-side adapter for the Lifestyle Index card (404 while its flag is off).
 */
import { createDataFetcherWithStatus } from './data-fetcher';
import type { LifestyleCard } from '$lib/lifestyle/view';

const FALLBACK: LifestyleCard = { computedAt: '', lastSuccessfulScrapeAt: null, households: [] };

export const fetchLifestyleWithStatus = createDataFetcherWithStatus<LifestyleCard>(
	'/api/data/lifestyle',
	'Lifestyle',
	FALLBACK
);
