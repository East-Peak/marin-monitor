// src/lib/server/scrapers/fitness.ts

import { FITNESS_STUDIOS, computeMedian, computeMedianByType } from '$lib/config/fitness';
import { withSuccessfulScrapeMetadata } from '$lib/server/scrape-metadata';
import type { FitnessStudio, FitnessSnapshot } from '$lib/types/fitness';

/**
 * Convert a FitnessStudioConfig to a FitnessStudio (runtime type).
 */
function toStudio(config: (typeof FITNESS_STUDIOS)[number]): FitnessStudio {
	return {
		id: config.id,
		name: config.name,
		town: config.town,
		type: config.type,
		dropInPrice: config.dropInPrice,
		lat: config.lat,
		lon: config.lon
	};
}

/**
 * Compute a FitnessSnapshot from the hardcoded config values.
 * For v1 this does not perform any live scraping -- the drop-in
 * prices are maintained in the config file and updated manually.
 * A future version could scrape studio booking platforms
 * (MindBody, Mariana Tek, etc.) to verify/update the values.
 */
export function computeFitnessSnapshot(): FitnessSnapshot {
	const studios = FITNESS_STUDIOS.map(toStudio);
	const prices = studios.map((s) => s.dropInPrice);
	const medianByType = computeMedianByType(FITNESS_STUDIOS);

	const sorted = [...prices].sort((a, b) => a - b);
	const avg =
		prices.length > 0
			? Math.round((prices.reduce((sum, p) => sum + p, 0) / prices.length) * 100) / 100
			: null;

	return withSuccessfulScrapeMetadata({
		timestamp: new Date().toISOString(),
		studioCount: studios.length,
		medianPrice: computeMedian(prices),
		avgPrice: avg,
		minPrice: sorted.length > 0 ? sorted[0] : null,
		maxPrice: sorted.length > 0 ? sorted[sorted.length - 1] : null,
		medianByType,
		studios
	});
}
