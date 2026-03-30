/**
 * Price sanity bounds — prevents obviously wrong scraped values
 * from polluting data blobs.
 *
 * Usage in scrapers:
 *   import { isWithinBounds } from '$lib/server/sanity';
 *   if (!isWithinBounds('cappuccino', price)) { ... }
 */

export const PRICE_BOUNDS: Record<string, { min: number; max: number }> = {
	cappuccino: { min: 2, max: 15 },
	'grocery-item': { min: 0.25, max: 200 },
	'wine-median': { min: 10, max: 500 },
	'school-tuition': { min: 5000, max: 150000 },
	'fitness-dropin': { min: 5, max: 100 }
};

/**
 * Returns true if the price falls within the expected bounds for the given category.
 * If the category has no configured bounds, returns true (permissive).
 */
export function isWithinBounds(category: string, price: number): boolean {
	const bounds = PRICE_BOUNDS[category];
	if (!bounds) return true;
	return price >= bounds.min && price <= bounds.max;
}
