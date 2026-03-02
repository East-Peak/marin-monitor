import { error } from '@sveltejs/kit';
import { fetchWithTimeout } from '$lib/server/fetch-utils';
import type { RequestHandler } from './$types';

function isAllowedArticleUrl(value: string): boolean {
	try {
		const parsed = new URL(value);
		return parsed.protocol === 'https:' || parsed.protocol === 'http:';
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
