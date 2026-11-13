import { proxyFetch } from './proxy-fetch.mjs';

/**
 * Fetch every product in a Shopify collection via `products.json` paging.
 *
 * Any failed page — HTTP error, transport error, timeout or a non-JSON bot
 * wall — throws. Returning the pages fetched so far would publish a partial
 * collection as if it were the whole one.
 *
 * @param {string} baseUrl
 * @param {string} handle
 * @param {{ fetchImpl?: typeof proxyFetch, pageLimit?: number, timeoutMs?: number, delayMs?: number, headers?: Record<string, string>, sleep?: (ms: number) => Promise<void>, maxRetries?: number }} [options]
 * @returns {Promise<any[]>}
 */
export async function fetchShopifyCollection(baseUrl, handle, options = {}) {
	const {
		fetchImpl = proxyFetch,
		pageLimit = 250,
		timeoutMs = 15000,
		delayMs = 500,
		headers = {},
		sleep = (/** @type {number} */ ms) => new Promise((resolve) => setTimeout(resolve, ms)),
		maxRetries = 3
	} = options;
	const products = [];
	for (let page = 1; ; page++) {
		const url = `${baseUrl}/collections/${handle}/products.json?limit=${pageLimit}&page=${page}`;
		const where = `${handle} page ${page}`;
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), timeoutMs);
		let body;
		try {
			let res = await fetchImpl(url, { signal: controller.signal, headers });
			// Back off when told to slow down: wait what the shop asks (capped), then ask again.
			for (let retry = 0; res.status === 429 && retry < maxRetries; retry++) {
				const asked = Number(res.headers.get('Retry-After'));
				await sleep(
					Math.min(60, Number.isFinite(asked) && asked > 0 ? asked : 5 * 2 ** retry) * 1000
				);
				res = await fetchImpl(url, { signal: controller.signal, headers });
			}
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			body = await res.json();
		} catch (err) {
			throw new Error(`${where}: ${err instanceof Error ? err.message : String(err)}`);
		} finally {
			clearTimeout(timer);
		}
		if (!Array.isArray(body?.products)) throw new Error(`${where}: no products array`);
		products.push(...body.products);
		if (body.products.length < pageLimit) return products;
		if (delayMs > 0) await sleep(delayMs);
	}
}

/**
 * @template T
 * @param {string} label
 * @param {T[]} items
 * @returns {T[]}
 */
export function requireNonEmpty(label, items) {
	if (items.length === 0) throw new Error(`${label}: 0 items`);
	return items;
}
