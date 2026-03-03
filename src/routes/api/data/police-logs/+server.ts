import { head } from '@vercel/blob';
import { env } from '$env/dynamic/private';
import { fetchWithTimeout } from '$lib/server/fetch-utils';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	try {
		const blob = await head('marin-police-logs.json', {
			token: env.BLOB_READ_WRITE_TOKEN
		});
		const response = await fetchWithTimeout(blob.downloadUrl, {
			headers: { Authorization: `Bearer ${env.BLOB_READ_WRITE_TOKEN}` }
		}, 8000);
		if (response.ok) {
			return new Response(await response.text(), {
				headers: {
					'Content-Type': 'application/json',
					'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600'
				}
			});
		}
	} catch {
		// Blob not available — fall through to static file
	}

	try {
		const staticRes = await fetchWithTimeout(new URL('/data/marin-police-logs.json', url.origin).href, undefined, 5000);
		if (staticRes.ok) {
			return new Response(await staticRes.text(), {
				headers: {
					'Content-Type': 'application/json',
					'Cache-Control': 'public, s-maxage=60'
				}
			});
		}
	} catch {
		// Static file not available
	}

	return new Response(JSON.stringify([]), {
		headers: {
			'Content-Type': 'application/json',
			'Cache-Control': 'public, s-maxage=60'
		}
	});
};
