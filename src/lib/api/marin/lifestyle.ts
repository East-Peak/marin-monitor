/**
 * Client-side adapter for the Lifestyle Index card (404 while its flag is off).
 */
import { createDataFetcherWithStatus } from './data-fetcher';
import type { LifestyleCard } from '$lib/lifestyle/view';

const FALLBACK: LifestyleCard = { computedAt: '', lastSuccessfulScrapeAt: null, households: [] };

/** A household from before the receipt (a rollback, a cached response) reads as unread. */
function withReceipts(body: unknown): LifestyleCard {
	const card = body as LifestyleCard;
	return { ...card, households: card.households.filter((h) => Array.isArray(h.receipt)) };
}

export const fetchLifestyleWithStatus = createDataFetcherWithStatus<LifestyleCard>(
	'/api/data/lifestyle',
	'Lifestyle',
	FALLBACK,
	withReceipts
);
