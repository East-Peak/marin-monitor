/**
 * Stopped 2026-11-03 (COSTDATA Q1, Stuart): Instacart's terms bar automated
 * access ("Scrape, crawl, data-mine…"), so the Grocery Basket is no longer
 * read. Its blob keeps the last real read, which /api/data/grocery-basket
 * serves as no longer updated. Permitted sources are COSTDATA-2's question.
 */
import { verifyCronAuth } from '$lib/server/cron-auth';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ request }) => {
	const authError = verifyCronAuth(request);
	if (authError) return authError;
	return new Response(
		JSON.stringify({
			ok: false,
			stopped: '2026-11-03',
			reason: "Instacart's terms bar automated access"
		}),
		{ status: 410, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
	);
};
