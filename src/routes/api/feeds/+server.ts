/**
 * Server-side RSS feed proxy endpoint
 *
 * During dev, this runs via Vite's built-in server.
 * In production with adapter-static, this won't exist — the client falls back to CORS proxy.
 * If we switch to adapter-node or adapter-cloudflare, this just works.
 */

import { error } from '@sveltejs/kit';
import { getAllFeedUrls, MARINIJ_LOCATION_FEEDS, MARINIJ_TAG_FEEDS } from '$lib/config/feeds';
import { fetchWithTimeout } from '$lib/server/fetch-utils';
import type { RequestHandler } from './$types';

const USER_AGENT = 'Mozilla/5.0 (compatible; MarinMonitor/1.0; +https://marinmonitor.com)';

const feedCache = new Map<string, { data: string; fetchedAt: number; contentType: string }>();
const FEED_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

const ALLOWED_FEED_URLS = new Set([
	...getAllFeedUrls().map((feed) => feed.url),
	...Object.values(MARINIJ_TAG_FEEDS),
	...Object.values(MARINIJ_LOCATION_FEEDS)
]);

export const GET: RequestHandler = async ({ url }) => {
	const feedUrl = url.searchParams.get('url');

	if (!feedUrl) {
		throw error(400, 'Missing url parameter');
	}

	// Only allow known feed URLs from the checked-in source configuration.
	if (!ALLOWED_FEED_URLS.has(feedUrl)) {
		throw error(400, 'Invalid URL');
	}

	try {
		const cached = feedCache.get(feedUrl);
		if (cached && Date.now() - cached.fetchedAt < FEED_CACHE_TTL) {
			return new Response(cached.data, {
				headers: {
					'Content-Type': cached.contentType,
					'Cache-Control': 'public, max-age=300',
					'X-Cache': 'HIT'
				}
			});
		}

		const response = await fetchWithTimeout(feedUrl, {
			headers: {
				'User-Agent': USER_AGENT,
				Accept: 'application/rss+xml, application/xml, text/xml, */*',
				Referer: 'https://marinmonitor.com/'
			}
		});

		if (!response.ok) {
			throw error(response.status, `Feed returned ${response.status}`);
		}

		const xml = await response.text();
		if (xml.length > 2_000_000) {
			throw error(413, 'Feed response too large');
		}

		const contentType = response.headers.get('content-type') || 'application/xml';
		feedCache.set(feedUrl, { data: xml, fetchedAt: Date.now(), contentType });

		return new Response(xml, {
			headers: {
				'Content-Type': contentType,
				'Cache-Control': 'public, max-age=300',
				'X-Cache': 'MISS'
			}
		});
	} catch (e) {
		if ((e as { status?: number }).status) throw e; // Re-throw SvelteKit errors
		console.error('Feed fetch failed:', (e as Error).message);
		throw error(502, 'Failed to fetch upstream feed');
	}
};
