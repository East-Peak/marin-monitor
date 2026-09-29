import { decodeEntities } from '../../src/lib/server/html-text.js';

const SECTION = 'data-testid="CrossRetailerResultRowWrapper"';
const SIGN_POSTS = 'data-testid="CrossRetailerSearchRetailerSignPosts"';
/** Star rating and review count between the name and the size. */
const RATING = /<div[^>]*aria-label="Average rating[^"]*"[\s\S]*?<\/div>|\(\d[\d.,]*K?\)/g;
const CARD = 'data-item-card="true"';

/** @param {string} html */
const text = (html) =>
	decodeEntities(html.replace(/<[^>]*>/g, ' '))
		.replace(/\s+/g, ' ')
		.trim();

/**
 * Products from Instacart's rendered cross-retailer search (2026 markup):
 * retailer sections headed by an `aria-level="3"` store name, each holding
 * `data-item-card` cards with an `<h3>` name, a size line, a visually hidden
 * "Current price: $X" and, when on sale, "Original Price: $Y". A page with no
 * cards (a bot wall) yields nothing rather than a guess.
 *
 * @param {string} html
 * @returns {{ name: string, price: number, store: string, onSale: boolean }[]}
 */
export function parseCrossRetailerCards(html) {
	const products = [];
	for (const chunk of html.split(SECTION).slice(1)) {
		// A sign-posts block may precede the results or trail the last section.
		const section = chunk.split(SIGN_POSTS)[0];
		const heading = /aria-level="3"[^>]*>([^<]+)</.exec(section);
		if (!heading) continue;
		const store = decodeEntities(heading[1]).trim();
		for (const card of section.split(CARD).slice(1)) {
			const price = /Current price: \$(\d+(?:\.\d+)?)/.exec(card);
			// Name in <h3>; the size follows it inside the card link, after any rating.
			const name = /<h3[^>]*>([\s\S]*?)<\/h3>([\s\S]*?)<\/a>/.exec(card);
			if (!price || !name) continue;
			const value = Number(price[1]);
			if (!(value > 0)) continue;
			products.push({
				name: [text(name[1]), text(name[2].replace(RATING, ' '))].filter(Boolean).join(' '),
				price: value,
				store,
				onSale: /Original Price: \$/.test(card)
			});
		}
	}
	return products;
}

/**
 * A basket counts as a live observation only when at least half its items
 * were priced live; otherwise it is mostly reference prices.
 *
 * @param {number} liveItems
 * @param {number} totalItems
 */
export function hasLiveBasketCoverage(liveItems, totalItems) {
	return totalItems > 0 && liveItems >= Math.ceil(totalItems / 2);
}
