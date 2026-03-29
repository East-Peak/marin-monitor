import { put, head } from '@vercel/blob';
import { env } from '$env/dynamic/private';
import { scrapeCappuccino } from '$lib/server/scrapers/cappuccino';
import { verifyCronAuth } from '$lib/server/cron-auth';
import { CAPPUCCINO_BLOB_KEY, MAX_CAPPUCCINO_HISTORY } from '$lib/config/coffee';
import type { RequestHandler } from './$types';
import type { CoffeeData, CoffeeSnapshot } from '$lib/types/coffee';

export const config = { maxDuration: 120 };

/** Strip shops[] from a snapshot to keep history entries small */
function toHistoryEntry(
	snapshot: CoffeeSnapshot
): Omit<CoffeeSnapshot, 'shops'> & { shops: [] } {
	return {
		timestamp: snapshot.timestamp,
		shopCount: snapshot.shopCount,
		medianPrice: snapshot.medianPrice,
		avgPrice: snapshot.avgPrice,
		minPrice: snapshot.minPrice,
		maxPrice: snapshot.maxPrice,
		shops: []
	};
}

export const GET: RequestHandler = async ({ request }) => {
	const authError = verifyCronAuth(request);
	if (authError) return authError;

	const start = Date.now();
	try {
		const snapshot = await scrapeCappuccino();

		// Read existing blob to append history
		let existing: CoffeeData = { current: null, history: [] };
		try {
			const blob = await head(CAPPUCCINO_BLOB_KEY, { token: env.BLOB_READ_WRITE_TOKEN });
			const res = await fetch(blob.downloadUrl, {
				headers: { Authorization: `Bearer ${env.BLOB_READ_WRITE_TOKEN}` }
			});
			if (res.ok) {
				existing = (await res.json()) as CoffeeData;
			}
		} catch {
			// No existing blob -- start fresh
		}

		// Append to history (capped), omitting shops[] from history entries
		const history = [toHistoryEntry(snapshot), ...existing.history].slice(
			0,
			MAX_CAPPUCCINO_HISTORY
		);

		const data: CoffeeData = {
			current: snapshot,
			history
		};

		await put(CAPPUCCINO_BLOB_KEY, JSON.stringify(data), {
			access: 'private',
			contentType: 'application/json',
			addRandomSuffix: false,
			allowOverwrite: true,
			token: env.BLOB_READ_WRITE_TOKEN
		});

		const pricesFound = snapshot.shops.filter((s) => s.price !== null).length;
		console.log(
			`[sync-cappuccino] OK: ${pricesFound}/${snapshot.shopCount} shops priced, median $${snapshot.medianPrice?.toFixed(2) ?? 'N/A'} in ${Date.now() - start}ms`
		);

		return new Response(
			JSON.stringify({
				ok: true,
				shopCount: snapshot.shopCount,
				pricesFound,
				medianPrice: snapshot.medianPrice
			}),
			{ headers: { 'Content-Type': 'application/json' } }
		);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.error(`[sync-cappuccino] FAILED after ${Date.now() - start}ms:`, message);
		return new Response(JSON.stringify({ ok: false, error: message }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};
