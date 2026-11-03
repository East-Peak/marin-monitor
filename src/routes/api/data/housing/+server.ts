import { blobErrorResponse, tryReadBlobText } from '$lib/server/blob-endpoint';
import { fetchWithTimeout } from '$lib/server/fetch-utils';
import { housingMonths } from '$lib/server/scrapers/housing';
import type { RequestHandler } from './$types';

const parseJson = (text: string): unknown => {
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
};

export const GET: RequestHandler = async ({ url }) => {
	const blob = await tryReadBlobText('marin-housing.json');
	// The client reads the months array, whichever shape the blob is in.
	const months = blob.ok ? housingMonths(parseJson(blob.text)) : null;
	if (months) {
		return new Response(JSON.stringify(months), {
			headers: {
				'Content-Type': 'application/json',
				'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600'
			}
		});
	}

	try {
		const staticRes = await fetchWithTimeout(
			new URL('/data/marin-housing.json', url.origin).href,
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

	return blobErrorResponse(
		blob.ok
			? {
					error: 'blob_fetch_failed',
					message: 'housing blob is not a months array or document',
					timestamp: new Date().toISOString(),
					blobKey: 'marin-housing.json'
				}
			: blob.error
	);
};
