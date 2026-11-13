import { blobErrorResponse, tryReadBlobText } from '$lib/server/blob-endpoint';
import { groceryInflation } from '$lib/grocery/inflation';
import type { RequestHandler } from './$types';

/** SF-area grocery inflation: BLS food at home, derived at read time (COSTDATA-2). */
export const GET: RequestHandler = async () => {
	const result = await tryReadBlobText('marin-bls-food-at-home.json');
	if (!result.ok) return blobErrorResponse(result.error);
	let raw: unknown = null;
	try {
		raw = JSON.parse(result.text);
	} catch {
		// Unparseable reads as no read at all.
	}
	return new Response(JSON.stringify(groceryInflation(raw, new Date())), {
		headers: {
			'Content-Type': 'application/json',
			'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600'
		}
	});
};
