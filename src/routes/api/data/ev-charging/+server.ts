import { head } from '@vercel/blob';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	try {
		const blob = await head('marin-ev-charging.json', {
			token: env.BLOB_READ_WRITE_TOKEN
		});
		const response = await fetch(blob.downloadUrl, {
			headers: { Authorization: `Bearer ${env.BLOB_READ_WRITE_TOKEN}` }
		});
		if (response.ok) {
			return new Response(await response.text(), {
				headers: {
					'Content-Type': 'application/json',
					'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=1800'
				}
			});
		}
	} catch {
		// Blob not available — return empty data
	}

	return new Response(JSON.stringify({ current: null, history: [] }), {
		headers: {
			'Content-Type': 'application/json',
			'Cache-Control': 'public, s-maxage=60'
		}
	});
};
