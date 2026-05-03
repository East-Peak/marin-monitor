import { blobErrorResponse, tryReadBlobText } from '$lib/server/blob-endpoint';
import { fetchWithTimeout } from '$lib/server/fetch-utils';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const blob = await tryReadBlobText('marin-activity.json');
	if (blob.ok) {
		return new Response(blob.text, {
			headers: {
				'Content-Type': 'application/json',
				'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600'
			}
		});
	}

	try {
		const staticRes = await fetchWithTimeout(
			new URL('/data/marin-activity.json', url.origin).href,
			undefined,
			5000
		);
		if (staticRes.ok) {
			return new Response(await staticRes.text(), {
				headers: {
					'Content-Type': 'application/json',
					'Cache-Control': 'public, s-maxage=60',
					'X-Data-Source': 'static-fallback'
				}
			});
		}
	} catch {
		// Static file unreachable — fall through to error response
	}

	return blobErrorResponse(blob.error);
};
