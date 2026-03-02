import { error } from '@sveltejs/kit';
import { fetchWithTimeout } from '$lib/server/fetch-utils';
import type { RequestHandler } from './$types';

const ALLOWED_DOMAINS = [
	'marinij.com',
	'ptreyeslight.com',
	'pacificsun.com',
	'marinmagazine.com',
	'nbcbayarea.com',
	'kqed.org',
	'cityofsanrafael.org',
	'townoffairfaxca.gov',
	'marinwater.org',
	'marinhumane.org',
	'discoverwildcare.org',
	'marinlately.com',
	'granicus.com',
	'webscorer.com',
	'cityofmillvalley.gov'
];

function isAllowedArticleUrl(value: string): boolean {
	try {
		const parsed = new URL(value);
		if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
		const hostname = parsed.hostname.toLowerCase();
		return ALLOWED_DOMAINS.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
	} catch {
		return false;
	}
}

export const GET: RequestHandler = async ({ url }) => {
	const articleUrl = url.searchParams.get('url');
	if (!articleUrl || !isAllowedArticleUrl(articleUrl)) {
		throw error(400, 'Invalid article URL');
	}

	const response = await fetchWithTimeout(articleUrl, {
		headers: {
			Accept: 'text/html,application/xhtml+xml',
			'User-Agent': 'MarinMonitor/1.0'
		}
	});

	if (!response.ok) {
		throw error(response.status, `Article returned ${response.status}`);
	}

	return new Response(await response.text(), {
		headers: {
			'Content-Type': 'text/html; charset=utf-8',
			'Cache-Control': 'public, max-age=900'
		}
	});
};
