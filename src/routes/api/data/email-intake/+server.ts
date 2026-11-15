/**
 * The intake's public read (email intake v1): shown items sent in the last 14 days, revisions
 * collapsed. Held items are never served. A failed read is a 503, never an empty list.
 */
import { env } from '$env/dynamic/private';
import { readEmailIntake } from '$lib/server/email-intake/store';
import { vercelBlobLister } from '$lib/server/email-intake/vercel-lister';
import { vercelBlobApi } from '$lib/server/news/vercel-blob-api';
import type { RequestHandler } from './$types';

const READ_BUDGET_MS = 8_000;

export const GET: RequestHandler = async () => {
	try {
		const token = env.BLOB_READ_WRITE_TOKEN;
		if (!token) throw new Error('BLOB_READ_WRITE_TOKEN not set');
		const read = await readEmailIntake({
			api: { ...vercelBlobApi(token), ...vercelBlobLister(token) },
			now: () => new Date(),
			signal: AbortSignal.timeout(READ_BUDGET_MS)
		});
		return new Response(JSON.stringify(read), {
			headers: {
				'Content-Type': 'application/json',
				'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
				'X-Data-Source': 'live'
			}
		});
	} catch (err) {
		console.error('[data/email-intake] read failed:', err instanceof Error ? err : String(err));
		return new Response(JSON.stringify({ error: 'email intake unavailable' }), {
			status: 503,
			headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, s-maxage=10' }
		});
	}
};
