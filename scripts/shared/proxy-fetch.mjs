const PROXY_URL = process.env.SCRAPE_PROXY_URL;
const PROXY_SECRET = process.env.SCRAPE_PROXY_SECRET;

/**
 * Fetch a URL, optionally routing through the residential proxy.
 * Falls back to direct fetch if proxy is not configured or fails.
 */
export async function proxyFetch(url, options = {}) {
	if (PROXY_URL && PROXY_SECRET) {
		try {
			const res = await fetch(`${PROXY_URL}/proxy`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${PROXY_SECRET}`
				},
				body: JSON.stringify({
					url,
					headers: options.headers || {},
					method: options.method || 'GET',
					timeout: 30000
				})
			});
			if (res.ok) {
				const result = await res.json();
				return new Response(result.data, {
					status: result.status,
					headers: new Headers(result.headers || {})
				});
			}
			console.warn(`[proxy] Proxy returned ${res.status}, falling back to direct fetch`);
		} catch (err) {
			console.warn(
				`[proxy] Proxy failed: ${err instanceof Error ? err.message : String(err)}, falling back to direct fetch`
			);
		}
	}

	return fetch(url, options);
}
