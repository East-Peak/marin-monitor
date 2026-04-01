import { put } from '@vercel/blob';
import { env } from '$env/dynamic/private';
import { verifyCronAuth } from '$lib/server/cron-auth';
import { fetchWithTimeout } from '$lib/server/fetch-utils';
import type { RequestHandler } from './$types';

export const config = { maxDuration: 30 };

const SEECLICKFIX_API = 'https://seeclickfix.com/api/v2/issues';
const BLOB_KEY = 'marin-311.json';

export const GET: RequestHandler = async ({ request }) => {
	const authError = verifyCronAuth(request);
	if (authError) return authError;

	const start = Date.now();

	try {
		// Fetch last 7 days of issues (covers the gap between 4-hour syncs with margin)
		const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
		const params = new URLSearchParams({
			place_url: 'marin-county',
			per_page: '100',
			status: 'open,acknowledged,closed',
			sort: 'created_at',
			sort_direction: 'DESC',
			after: cutoff
		});

		const url = `${SEECLICKFIX_API}?${params}`;
		const response = await fetchWithTimeout(
			url,
			{ headers: { 'User-Agent': 'MarinMonitor/1.0' } },
			15000
		);

		if (!response.ok) {
			throw new Error(`SeeClickFix API returned ${response.status}`);
		}

		const data = await response.json();
		const issues = data.issues ?? [];

		const blob = {
			issues,
			lastUpdated: new Date().toISOString(),
			count: issues.length
		};

		await put(BLOB_KEY, JSON.stringify(blob), {
			access: 'private',
			contentType: 'application/json',
			addRandomSuffix: false,
			allowOverwrite: true,
			token: env.BLOB_READ_WRITE_TOKEN
		});

		console.log(`[sync-311] OK: ${issues.length} issues in ${Date.now() - start}ms`);
		return new Response(
			JSON.stringify({ ok: true, count: issues.length }),
			{ headers: { 'Content-Type': 'application/json' } }
		);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.error(`[sync-311] FAILED after ${Date.now() - start}ms:`, message);
		return new Response(
			JSON.stringify({ ok: false, error: message }),
			{ status: 500, headers: { 'Content-Type': 'application/json' } }
		);
	}
};
