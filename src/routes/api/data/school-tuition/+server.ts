import { head } from '@vercel/blob';
import { env } from '$env/dynamic/private';
import { fetchWithTimeout } from '$lib/server/fetch-utils';
import { SCHOOL_TUITION_BLOB_KEY } from '$lib/config/schools';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	try {
		const blob = await head(SCHOOL_TUITION_BLOB_KEY, {
			token: env.BLOB_READ_WRITE_TOKEN
		});
		const response = await fetchWithTimeout(
			blob.downloadUrl,
			{
				headers: { Authorization: `Bearer ${env.BLOB_READ_WRITE_TOKEN}` }
			},
			8000
		);
		if (response.ok) {
			return new Response(await response.text(), {
				headers: {
					'Content-Type': 'application/json',
					'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200'
				}
			});
		}
	} catch {
		// Blob not available -- return empty data
	}

	return new Response(JSON.stringify({ current: null, history: [] }), {
		headers: {
			'Content-Type': 'application/json',
			'Cache-Control': 'public, s-maxage=60'
		}
	});
};
