/**
 * The Lifestyle Index card's data: one summary per household (LIFE2).
 * 404 while the flag is off, so the dashboard and the TV keep the old composite.
 * Each household carries its highlights (LIFE3) only under their own flag.
 */
import { env } from '$env/dynamic/private';
import { SHEETS } from '$lib/lifestyle/sheets';
import { blobErrorResponse } from '$lib/server/blob-endpoint';
import {
	highlightsOn,
	lifestyleBlobApi,
	lifestyleCard,
	lifestyleHighlights,
	lifestyleOn,
	readLifestyleDoc
} from '$lib/server/lifestyle/read';
import type { RequestHandler } from './$types';

const READ_MS = 8000;

export const GET: RequestHandler = async () => {
	if (!lifestyleOn(env))
		return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
	const api = lifestyleBlobApi(env);
	const read = api ? await readLifestyleDoc(api, AbortSignal.timeout(READ_MS)) : null;
	if (!read) {
		return blobErrorResponse({
			error: 'blob_unavailable',
			message: 'The Lifestyle Index could not be read',
			timestamp: new Date().toISOString()
		});
	}
	const highlights = highlightsOn(env) ? lifestyleHighlights(read, SHEETS) : undefined;
	return new Response(JSON.stringify(lifestyleCard(read.current, SHEETS, highlights)), {
		headers: {
			'Content-Type': 'application/json',
			'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200'
		}
	});
};
