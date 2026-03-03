import { error } from '@sveltejs/kit';
import { fetchWithTimeout } from '$lib/server/fetch-utils';
import type { RequestHandler } from './$types';

/** Only proxy article pages from known local news domains */
const ALLOWED_ARTICLE_DOMAINS = new Set([
	'marinij.com',
	'www.marinij.com',
	'ptreyeslight.com',
	'www.ptreyeslight.com',
	'pacificsun.com',
	'www.pacificsun.com',
	'marinmagazine.com',
	'www.marinmagazine.com',
	'marinlately.com',
	'www.marinlately.com'
]);

function isAllowedArticleUrl(value: string): boolean {
	try {
		const parsed = new URL(value);
		if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
		return ALLOWED_ARTICLE_DOMAINS.has(parsed.hostname.toLowerCase());
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
