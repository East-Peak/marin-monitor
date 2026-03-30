import { put, list } from '@vercel/blob';
import { env } from '$env/dynamic/private';
import { ADS } from '$lib/config/ads';
import {
	checkRateLimit,
	getClientIp,
	isJsonRequest,
	isTrustedMutationRequest,
	redactIp
} from '$lib/server/request-security';
import type { RequestHandler } from './$types';

interface ClickData {
	counts: Record<string, number>;
	log: Array<{ adId: string; ts: string }>;
}

const BLOB_KEY = 'ad-clicks.json';
const MAX_LOG = 5000;
const VALID_AD_IDS = new Set(ADS.map((ad) => ad.id));
const AD_CLICK_RATE_LIMIT = { limit: 30, windowMs: 10 * 60 * 1000 };

export const POST: RequestHandler = async ({ request, url, getClientAddress }) => {
	try {
		if (!isTrustedMutationRequest(request, url.origin)) {
			return new Response(JSON.stringify({ error: 'Forbidden' }), {
				status: 403,
				headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
			});
		}

		if (!isJsonRequest(request)) {
			return new Response(JSON.stringify({ error: 'Expected application/json' }), {
				status: 415,
				headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
			});
		}

		const clientIp = getClientIp(request, getClientAddress);
		const rateLimit = checkRateLimit({
			bucket: 'ad-click',
			key: clientIp,
			limit: AD_CLICK_RATE_LIMIT.limit,
			windowMs: AD_CLICK_RATE_LIMIT.windowMs
		});
		if (!rateLimit.allowed) {
			console.warn('[ad-click] rate-limited', redactIp(clientIp));
			return new Response(JSON.stringify({ error: 'Too many requests' }), {
				status: 429,
				headers: {
					'Content-Type': 'application/json',
					'Cache-Control': 'no-store',
					'Retry-After': String(rateLimit.retryAfterSec)
				}
			});
		}

		const contentLength = request.headers.get('content-length');
		if (contentLength && parseInt(contentLength) > 1024) {
			return new Response(JSON.stringify({ error: 'Request too large' }), {
				status: 413,
				headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
			});
		}

		const body = await request.json();
		const { adId } = body;

		if (!adId || typeof adId !== 'string' || adId.length > 100 || !VALID_AD_IDS.has(adId)) {
			return new Response(JSON.stringify({ error: 'Invalid adId' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
			});
		}

		let data: ClickData = { counts: {}, log: [] };
		try {
			const blobs = await list({ prefix: BLOB_KEY, token: env.BLOB_READ_WRITE_TOKEN });
			if (blobs.blobs.length > 0) {
				const res = await fetch(blobs.blobs[0].downloadUrl);
				if (res.ok) {
					data = await res.json();
				}
			}
		} catch {
			// First click or blob not found — start fresh
		}

		data.counts[adId] = (data.counts[adId] || 0) + 1;
		data.log.push({ adId, ts: new Date().toISOString() });
		if (data.log.length > MAX_LOG) {
			data.log = data.log.slice(-MAX_LOG);
		}

		await put(BLOB_KEY, JSON.stringify(data), {
			access: 'private',
			contentType: 'application/json',
			addRandomSuffix: false,
			token: env.BLOB_READ_WRITE_TOKEN
		});

		return new Response(JSON.stringify({ ok: true }), {
			headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.error('[ad-click]', message);
		return new Response(JSON.stringify({ error: 'Internal error' }), {
			status: 500,
			headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
		});
	}
};
