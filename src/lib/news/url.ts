/**
 * URL helpers with NO parser dependency, so modules the browser loads eagerly
 * (stores → identity) can use them without pulling htmlparser2 into the
 * initial bundle.
 */
const TRACKING_PARAMS = new Set(['fbclid', 'gclid', 'mc_cid', 'mc_eid', 'cmpid', 'ncid']);

export function httpUrl(raw: string | null): URL | null {
	if (!raw) return null;
	try {
		const url = new URL(raw);
		return url.protocol === 'https:' || url.protocol === 'http:' ? url : null;
	} catch {
		return null;
	}
}

export function canonicalizeUrl(raw: string | null): string | null {
	const url = httpUrl(raw);
	if (!url) return null;
	for (const key of [...url.searchParams.keys()]) {
		if (/^utm_/i.test(key) || TRACKING_PARAMS.has(key.toLowerCase())) url.searchParams.delete(key);
	}
	url.searchParams.sort();
	const host = url.hostname.toLowerCase().replace(/^www\./, '');
	const path = url.pathname.replace(/\/+$/, '') || '/';
	return `https://${host}${path}${url.search}`;
}
