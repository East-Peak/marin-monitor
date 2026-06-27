import { put, head } from '@vercel/blob';
import { env } from '$env/dynamic/private';
import { scrapeEvCharging } from '$lib/server/scrapers/ev-charging';
import { verifyCronAuth } from '$lib/server/cron-auth';
import { cronErrorResponse } from '$lib/server/cron-response';
import type { RequestHandler } from './$types';
import type { EvChargingData, EvChargingSnapshot } from '$lib/types/ev-charging';

export const config = { maxDuration: 60 };

const BLOB_KEY = 'marin-ev-charging.json';
const MAX_HISTORY_ENTRIES = 365; // 1 year at daily polling

/** Strip stations[] from a snapshot to keep history entries small */
function toHistoryEntry(
	snapshot: EvChargingSnapshot
): Omit<EvChargingSnapshot, 'stations'> & { stations: [] } {
	return {
		timestamp: snapshot.timestamp,
		stationCount: snapshot.stationCount,
		dcFastStationCount: snapshot.dcFastStationCount,
		level2StationCount: snapshot.level2StationCount,
		totalPorts: snapshot.totalPorts,
		networkBreakdown: snapshot.networkBreakdown,
		connectorBreakdown: snapshot.connectorBreakdown,
		stations: []
	};
}

export const GET: RequestHandler = async ({ request }) => {
	const authError = verifyCronAuth(request);
	if (authError) return authError;

	const start = Date.now();
	try {
		const snapshot = await scrapeEvCharging();

		// Read existing blob to append history
		let existing: EvChargingData = { current: null, history: [] };
		try {
			const blob = await head(BLOB_KEY, { token: env.BLOB_READ_WRITE_TOKEN });
			const res = await fetch(blob.downloadUrl, {
				headers: { Authorization: `Bearer ${env.BLOB_READ_WRITE_TOKEN}` }
			});
			if (res.ok) {
				existing = (await res.json()) as EvChargingData;
			}
		} catch {
			// No existing blob — start fresh
		}

		// Append to history (capped), omitting stations[] from history entries
		const history = [toHistoryEntry(snapshot), ...existing.history].slice(0, MAX_HISTORY_ENTRIES);

		const data: EvChargingData = {
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
			`[sync-ev-charging] OK: ${snapshot.stationCount} stations in ${Date.now() - start}ms`
		);
		return new Response(
			JSON.stringify({
				ok: true,
				stationCount: snapshot.stationCount,
				dcFastCount: snapshot.dcFastStationCount
			}),
			{ headers: { 'Content-Type': 'application/json' } }
		);
	} catch (err) {
		return cronErrorResponse('sync-ev-charging', err, start);
	}
};
