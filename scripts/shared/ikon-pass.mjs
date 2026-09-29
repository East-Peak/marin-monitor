/** The pass page; /en/shop-passes now redirects to a JS-only homepage. */
export const IKON_PASS_URL = 'https://www.ikonpass.com/en/shop-passes/ikon-pass';

/**
 * Adult season price from the rendered pass page ("From $1,449" above
 * "(Age 23+)"). Monthly-payment and discount amounts are ignored, and a value
 * outside a plausible season-pass range means a broken page, not a price.
 *
 * @param {string} text rendered `document.body.innerText`
 * @returns {number | null}
 */
export function parseIkonAdultPrice(text) {
	const match = /From\s+\$([\d,]+)(?:\.\d{2})?\s*(?:USD)?\s*\n\s*\(Age 23\+\)/i.exec(text);
	if (!match) return null;
	const price = Number(match[1].replace(/,/g, ''));
	return price >= 500 && price <= 5000 ? price : null;
}
