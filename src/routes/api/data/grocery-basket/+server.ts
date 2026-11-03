import { blobErrorResponse, tryReadBlobText } from '$lib/server/blob-endpoint';
import { frozenBasket } from '$lib/server/grocery-frozen';
import type { RequestHandler } from './$types';

/** The basket's last real read (the Instacart scrape stopped 2026-11-03). */
export const GET: RequestHandler = async () => {
	const result = await tryReadBlobText('marin-grocery-basket.json');
	if (!result.ok) return blobErrorResponse(result.error);
	let raw: unknown = null;
	try {
		raw = JSON.parse(result.text);
	} catch {
		// Unparseable reads as no real read.
	}
	return new Response(JSON.stringify(frozenBasket(raw)), {
		headers: {
			'Content-Type': 'application/json',
			'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600'
		}
	});
};
