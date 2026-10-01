import { STRAVA_ENABLED } from '$lib/config/strava';

/**
 * While Strava is mothballed its routes answer 404, before any blob read or
 * scrape. Returns the response to send, or null to carry on.
 */
export function stravaMothballed(): Response | null {
	if (STRAVA_ENABLED) return null;
	return new Response(JSON.stringify({ error: 'not_found' }), {
		status: 404,
		headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
	});
}
