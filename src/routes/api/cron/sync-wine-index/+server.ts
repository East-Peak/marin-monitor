import { put, head } from '@vercel/blob';
import { env } from '$env/dynamic/private';
import { scrapeWineIndex } from '$lib/server/scrapers/wine-index';
import { verifyCronAuth } from '$lib/server/cron-auth';
import { cronErrorResponse } from '$lib/server/cron-response';
import { WINE_INDEX_BLOB_KEY, MAX_WINE_HISTORY } from '$lib/config/wine';
import type { RequestHandler } from './$types';
import type { WineIndexData, WineSnapshot } from '$lib/types/wine';

export const config = { maxDuration: 300 };

/** Strip bottle listings from a snapshot to keep history entries small */
function toHistoryEntry(snapshot: WineSnapshot): {
	timestamp: string;
	categories: WineSnapshot['categories'];
} {
	return {
		timestamp: snapshot.timestamp,
		categories: snapshot.categories
	};
}

export const GET: RequestHandler = async ({ request }) => {
	const authError = verifyCronAuth(request);
	if (authError) return authError;

	const start = Date.now();
	try {
		const snapshot = await scrapeWineIndex();

		// Read existing blob to append history
		let existing: WineIndexData = { current: null, history: [] };
		try {
			const blob = await head(WINE_INDEX_BLOB_KEY, { token: env.BLOB_READ_WRITE_TOKEN });
			const res = await fetch(blob.downloadUrl, {
				headers: { Authorization: `Bearer ${env.BLOB_READ_WRITE_TOKEN}` }
			});
			if (res.ok) {
				existing = (await res.json()) as WineIndexData;
			}
		} catch {
			// No existing blob -- start fresh
		}

		// Append to history (capped), omitting bottle listings from history entries
		const history = [toHistoryEntry(snapshot), ...existing.history].slice(0, MAX_WINE_HISTORY);

		const data: WineIndexData = {
			current: snapshot,
			history
		};

		await put(WINE_INDEX_BLOB_KEY, JSON.stringify(data), {
			access: 'private',
			contentType: 'application/json',
			addRandomSuffix: false,
			allowOverwrite: true,
			token: env.BLOB_READ_WRITE_TOKEN
		});

		const categorySummary = snapshot.categories
			.map((c) => `${c.label}: $${c.medianPrice?.toFixed(2) ?? 'N/A'} (${c.productCount} wines)`)
			.join(', ');

		console.log(
			`[sync-wine-index] OK: ${categorySummary}, ${snapshot.staffPicks.length} staff picks, ${snapshot.allocatedWines.length} allocated in ${Date.now() - start}ms`
		);

		return new Response(
			JSON.stringify({
				ok: true,
				categories: snapshot.categories.map((c) => ({
					category: c.category,
					medianPrice: c.medianPrice,
					productCount: c.productCount
				})),
				staffPickCount: snapshot.staffPicks.length,
				allocatedCount: snapshot.allocatedWines.length
			}),
			{ headers: { 'Content-Type': 'application/json' } }
		);
	} catch (err) {
		return cronErrorResponse('sync-wine-index', err, start);
	}
};
