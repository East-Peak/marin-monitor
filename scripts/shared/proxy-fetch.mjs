import { randomUUID } from 'node:crypto';

/**
 * Fetch a URL through the residential scrape proxy when one is configured.
 *
 * Configured (SCRAPE_PROXY_URL + SCRAPE_PROXY_SECRET) means required: a proxy
 * failure throws. It never falls back to a direct fetch, which the target
 * sites block from datacenter IPs — a silent fallback turned a dead proxy into
 * empty scrapes that looked like successful runs. Unconfigured means direct.
 *
 * @param {string} url
 * @param {RequestInit & { headers?: Record<string, string> }} [options]
 * @returns {Promise<Response>}
 */
export async function proxyFetch(url, options = {}) {
	const proxyUrl = process.env.SCRAPE_PROXY_URL;
	const proxySecret = process.env.SCRAPE_PROXY_SECRET;
	if (!proxyUrl && !proxySecret) return fetch(url, options);
	if (!proxyUrl || !proxySecret) {
		throw new Error('SCRAPE_PROXY_URL and SCRAPE_PROXY_SECRET must be set together');
	}

	const requestId = randomUUID();
	let res;
	try {
		res = await fetch(`${proxyUrl}/proxy`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${proxySecret}`,
				'X-Request-Id': requestId
			},
			body: JSON.stringify({
				url,
				headers: options.headers || {},
				method: options.method || 'GET',
				timeout: 30000
			})
		});
	} catch (err) {
		throw new Error(
			`[proxy ${requestId}] proxy unreachable: ${err instanceof Error ? err.message : String(err)}`
		);
	}
	if (!res.ok) throw new Error(`[proxy ${requestId}] proxy returned HTTP ${res.status}`);

	const result = await res.json();
	console.log(`[proxy ${requestId}] ${new URL(url).hostname} -> ${result.status}`);
	return new Response(result.data, {
		status: result.status,
		headers: new Headers(result.headers || {})
	});
}
