/**
 * GET /api/news/snapshot — the published news snapshot's public view.
 * 200 { status: 'ok', snapshot } · 503 { status: 'unavailable' | 'unknown', reason }.
 * Never serves a snapshot that fails the strict reader. Headers: see read-snapshot.ts.
 */
import { env } from '$env/dynamic/private';
import { readNewsSnapshot, snapshotHttp } from '$lib/server/news/read-snapshot';
import { vercelBlobApi } from '$lib/server/news/vercel-blob-api';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	const token = env.BLOB_READ_WRITE_TOKEN;
	const body = await readNewsSnapshot(token ? vercelBlobApi(token) : null);
	const { status, headers } = snapshotHttp(body);
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json', ...headers }
	});
};
