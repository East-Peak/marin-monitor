import { head } from '@vercel/blob';
import { env } from '$env/dynamic/private';
import { fetchWithTimeout } from '$lib/server/fetch-utils';
import type { RequestHandler } from './$types';

const BLOB_KEY = 'marin-311.json';

export const GET: RequestHandler = async () => {
	try {
		const blob = await head(BLOB_KEY, {
			token: env.BLOB_READ_WRITE_TOKEN
		});
		const response = await fetchWithTimeout(
			blob.downloadUrl,
			{ headers: { Authorization: `Bearer ${env.BLOB_READ_WRITE_TOKEN}` } },
			8000
		);
		if (response.ok) {
			return new Response(await response.text(), {
				headers: {
					'Content-Type': 'application/json',
					'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600'
				}
			});
		}
	} catch {
		// Blob not available yet
	}

	return new Response(JSON.stringify({ issues: [], lastUpdated: '', count: 0 }), {
		headers: {
			'Content-Type': 'application/json',
			'Cache-Control': 'public, s-maxage=60'
		}
	});
};
