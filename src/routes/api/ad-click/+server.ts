import { put, list } from '@vercel/blob';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

interface ClickData {
	counts: Record<string, number>;
	log: Array<{ adId: string; ts: string }>;
}

const BLOB_KEY = 'ad-clicks.json';
const MAX_LOG = 5000;

export const POST: RequestHandler = async ({ request }) => {
	try {
		const contentLength = request.headers.get('content-length');
		if (contentLength && parseInt(contentLength) > 1024) {
			return new Response(JSON.stringify({ error: 'Request too large' }), {
				status: 413,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		const body = await request.json();
		const { adId } = body;

		if (!adId || typeof adId !== 'string' || adId.length > 100) {
			return new Response(JSON.stringify({ error: 'Invalid adId' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
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
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.error('[ad-click]', message);
		return new Response(JSON.stringify({ error: 'Internal error' }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};
