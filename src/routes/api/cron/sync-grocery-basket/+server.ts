import { put, head } from '@vercel/blob';
import { env } from '$env/dynamic/private';
import { scrapeGroceryBasket } from '$lib/server/scrapers/grocery-basket';
import { verifyCronAuth } from '$lib/server/cron-auth';
import type { RequestHandler } from './$types';
import type { GroceryBasketData, GrocerySnapshot } from '$lib/types/grocery';

export const config = { maxDuration: 120 };

const BLOB_KEY = 'marin-grocery-basket.json';
const MAX_HISTORY_ENTRIES = 104; // ~2 years at weekly cadence

/** Strip per-item storePrices from a snapshot to keep history entries small */
function toHistoryEntry(
	snapshot: GrocerySnapshot
): GrocerySnapshot {
	return {
		timestamp: snapshot.timestamp,
		totalCheapest: snapshot.totalCheapest,
		totalExpensive: snapshot.totalExpensive,
		itemsFound: snapshot.itemsFound,
		items: snapshot.items.map((item) => ({
			itemId: item.itemId,
			itemName: item.itemName,
			cheapest: item.cheapest,
			cheapestStore: item.cheapestStore,
			mostExpensive: item.mostExpensive,
			mostExpensiveStore: item.mostExpensiveStore,
			storePrices: [] // Strip store-level detail from history
		}))
	};
}

export const GET: RequestHandler = async ({ request }) => {
	const authError = verifyCronAuth(request);
	if (authError) return authError;

	const start = Date.now();
	try {
		const snapshot = await scrapeGroceryBasket();

		// Read existing blob to append history
		let existing: GroceryBasketData = { current: null, history: [] };
		try {
			const blob = await head(BLOB_KEY, { token: env.BLOB_READ_WRITE_TOKEN });
			const res = await fetch(blob.downloadUrl, {
				headers: { Authorization: `Bearer ${env.BLOB_READ_WRITE_TOKEN}` }
			});
			if (res.ok) {
				existing = (await res.json()) as GroceryBasketData;
			}
		} catch {
			// No existing blob -- start fresh
		}

		// Append to history (capped), with stripped-down entries
		const history = [toHistoryEntry(snapshot), ...existing.history].slice(
			0,
			MAX_HISTORY_ENTRIES
		);

		const data: GroceryBasketData = {
			current: snapshot,
			history
		};

		await put(BLOB_KEY, JSON.stringify(data), {
			access: 'private',
			contentType: 'application/json',
			addRandomSuffix: false,
			allowOverwrite: true,
			token: env.BLOB_READ_WRITE_TOKEN
		});

		console.log(
			`[sync-grocery-basket] OK: ${snapshot.itemsFound}/12 items priced, ` +
			`total $${snapshot.totalCheapest?.toFixed(2) ?? 'N/A'} in ${Date.now() - start}ms`
		);
		return new Response(
			JSON.stringify({
				ok: true,
				itemsFound: snapshot.itemsFound,
				totalCheapest: snapshot.totalCheapest
			}),
			{ headers: { 'Content-Type': 'application/json' } }
		);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.error(
			`[sync-grocery-basket] FAILED after ${Date.now() - start}ms:`,
			message
		);
		return new Response(JSON.stringify({ ok: false, error: message }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};
