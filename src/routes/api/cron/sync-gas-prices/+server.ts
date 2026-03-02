import { put, head } from '@vercel/blob';
import { env } from '$env/dynamic/private';
import { scrapeGasPrices } from '$lib/server/scrapers/gas-prices';
import type { RequestHandler } from './$types';
import type { GasPriceData, GasPriceSnapshot } from '$lib/types/gas';

export const config = { maxDuration: 60 };

const BLOB_KEY = 'marin-gas-prices.json';
const MAX_HISTORY_ENTRIES = 540; // 90 days at 6 polls/day

/** Strip stations[] from a snapshot to keep history entries small */
function toHistoryEntry(
	snapshot: GasPriceSnapshot
): Omit<GasPriceSnapshot, 'stations'> & { stations: [] } {
	return {
		timestamp: snapshot.timestamp,
		stationCount: snapshot.stationCount,
		avgRegular: snapshot.avgRegular,
		avgMidgrade: snapshot.avgMidgrade,
		avgPremium: snapshot.avgPremium,
		avgDiesel: snapshot.avgDiesel,
		minRegular: snapshot.minRegular,
		maxRegular: snapshot.maxRegular,
		stations: []
	};
}

export const GET: RequestHandler = async ({ request }) => {
	if (request.headers.get('authorization') !== `Bearer ${env.CRON_SECRET}`) {
		return new Response('Unauthorized', { status: 401 });
	}

	try {
		const snapshot = await scrapeGasPrices();

		// Read existing blob to append history
		let existing: GasPriceData = { current: null, history: [] };
		try {
			const blob = await head(BLOB_KEY, { token: env.BLOB_READ_WRITE_TOKEN });
			const res = await fetch(blob.downloadUrl);
			if (res.ok) {
				existing = (await res.json()) as GasPriceData;
			}
		} catch {
			// No existing blob — start fresh
		}

		// Append to history (capped), omitting stations[] from history entries
		const history = [toHistoryEntry(snapshot), ...existing.history].slice(0, MAX_HISTORY_ENTRIES);

		const data: GasPriceData = {
			current: snapshot,
			history
		};

		await put(BLOB_KEY, JSON.stringify(data), {
			access: 'private',
			contentType: 'application/json',
			addRandomSuffix: false,
			token: env.BLOB_READ_WRITE_TOKEN
		});

		return new Response(
			JSON.stringify({ ok: true, stationCount: snapshot.stationCount, avgRegular: snapshot.avgRegular }),
			{ headers: { 'Content-Type': 'application/json' } }
		);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.error('[sync-gas-prices]', message);
		return new Response(JSON.stringify({ ok: false, error: message }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};
