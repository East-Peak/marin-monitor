// @ts-check
/**
 * The Silver Oak line's live price (COSTDATA-2) comes from PlumpJack only for
 * an exact match: Alexander Valley, 2022, 750 ml, at its regular price. A
 * listing that does not state all of that is not the same thing, so it is not
 * a price. PlumpJack's JSON often states no size at all; then there is no
 * match, and the sheet keeps its dated citation. The blob keeps the matched
 * variant's id, title, size and regular-versus-sale price as evidence.
 */

/** We say who we are to PlumpJack's public JSON, rather than looking like a browser. */
export const IDENTIFYING_USER_AGENT = 'MarinMonitor/1.0 (+https://marinmonitor.com)';

const MAGNUM_OR_HALF = /\b(1\.5\s?l|3\s?l|375\s?ml|1500\s?ml|magnum|half[- ]bottle|case)\b/i;
/** A product or variant that is a pack or set, or another vintage, is not one bottle of the 2022. */
const OTHER_PACKAGE = /\b(\d+\s?(pack|pk|bottles?)|case|gift|set|vertical)\b/i;
const SIZE_750 = /\b(750\s?ml|0?\.75\s?l)\b/i;

/** @param {unknown} v */
const price = (v) => {
	const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
	return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * @param {any[]} products PlumpJack's products, as its public JSON lists them
 * @returns {{ status: 'none' | 'ambiguous', reason: string } | {
 *   status: 'match', productId: number, productTitle: string, handle: string, variantId: number,
 *   variantTitle: string, size: '750 ml', regularPrice: number, price: number,
 *   compareAtPrice: number | null, onSale: boolean, available: true
 * }}
 */
export function matchSilverOakAlexanderValley2022(products) {
	/** @type {any[]} */
	const hits = [];
	for (const product of products) {
		const title = String(product?.title ?? '');
		if (!/silver oak/i.test(title) || !/alexander valley/i.test(title)) continue;
		if (!/\b2022\b/.test(title)) continue;
		for (const variant of Array.isArray(product.variants) ? product.variants : []) {
			const stated = [title, variant.title, variant.option1, variant.option2, variant.option3]
				.filter((s) => typeof s === 'string')
				.join(' | ');
			const own = [variant.title, variant.option1, variant.option2, variant.option3]
				.filter((x) => typeof x === 'string')
				.join(' | ');
			const years = own.match(/\b(19|20)\d\d\b/g) ?? [];
			if (years.some((y) => y !== '2022') || OTHER_PACKAGE.test(stated)) continue;
			if (!SIZE_750.test(stated) || MAGNUM_OR_HALF.test(stated)) continue;
			if (variant.available !== true || price(variant.price) === null) continue;
			hits.push({ product, variant });
		}
	}
	if (hits.length === 0)
		return {
			status: 'none',
			reason: 'no available Silver Oak Alexander Valley 2022 listing states 750 ml'
		};
	if (hits.length > 1)
		return { status: 'ambiguous', reason: `${hits.length} listings match; none is the price` };
	const { product, variant } = hits[0];
	const sale = /** @type {number} */ (price(variant.price));
	const compare = price(variant.compare_at_price);
	const onSale = compare !== null && compare > sale;
	return {
		status: 'match',
		productId: product.id,
		productTitle: product.title,
		handle: String(product.handle ?? ''),
		variantId: variant.id,
		variantTitle: String(variant.title ?? ''),
		size: '750 ml',
		regularPrice: onSale ? /** @type {number} */ (compare) : sale,
		price: sale,
		compareAtPrice: compare,
		onSale,
		available: true
	};
}

/**
 * The evidence the wine sync writes: the match, or why there is none. The
 * catalogue lookup is optional, so its failure is recorded as unavailable
 * evidence (replacing any earlier match) and never stops the wine publication.
 * @param {() => Promise<any[]>} readCatalogue
 * @param {Date} now
 */
export async function silverOakEvidence(readCatalogue, now) {
	const readAt = now.toISOString();
	try {
		const catalogue = await readCatalogue();
		if (catalogue.length === 0) throw new Error('the catalogue is empty');
		return { ...matchSilverOakAlexanderValley2022(catalogue), readAt, products: catalogue.length };
	} catch (err) {
		return {
			status: 'unavailable',
			reason: `catalogue read failed: ${err instanceof Error ? err.message : String(err)}`,
			readAt
		};
	}
}
