import { put, head } from '@vercel/blob';
import { env } from '$env/dynamic/private';
import { computeDrivewaySnapshot } from '$lib/server/scrapers/driveway';
import { verifyCronAuth } from '$lib/server/cron-auth';
import { cronErrorResponse } from '$lib/server/cron-response';
import { DRIVEWAY_BLOB_KEY, MAX_DRIVEWAY_HISTORY } from '$lib/config/driveway';
import type { RequestHandler } from './$types';
import type { DrivewayData, DrivewaySnapshot } from '$lib/types/driveway';

export const config = { maxDuration: 60 };

/** Convert snapshot to history entry (same shape -- vehicle data is already compact) */
function toHistoryEntry(snapshot: DrivewaySnapshot): DrivewayData['history'][number] {
	return {
		timestamp: snapshot.timestamp,
		dataYear: snapshot.dataYear,
		totalVehicles: snapshot.totalVehicles,
		topMakes: snapshot.topMakes,
		fuelBreakdown: snapshot.fuelBreakdown,
		funStats: snapshot.funStats
	};
}

export const GET: RequestHandler = async ({ request }) => {
	const authError = verifyCronAuth(request);
	if (authError) return authError;

	const start = Date.now();
	try {
		let existing: DrivewayData = { current: null, history: [] };
		try {
			const blob = await head(DRIVEWAY_BLOB_KEY, { token: env.BLOB_READ_WRITE_TOKEN });
			const res = await fetch(blob.downloadUrl, {
				headers: { Authorization: `Bearer ${env.BLOB_READ_WRITE_TOKEN}` }
			});
			if (res.ok) {
				existing = (await res.json()) as DrivewayData;
			}
		} catch {
			// No existing blob -- start fresh
		}

		const snapshot = await computeDrivewaySnapshot(existing.current);

		// Deduplicate by dataYear -- only keep the latest snapshot for each year
		const historyMap = new Map<number, DrivewayData['history'][number]>();
		for (const entry of existing.history) {
			historyMap.set(entry.dataYear, entry);
		}
		historyMap.set(snapshot.dataYear, toHistoryEntry(snapshot));

		const history = [...historyMap.values()]
			.sort((a, b) => b.dataYear - a.dataYear)
			.slice(0, MAX_DRIVEWAY_HISTORY);

		const data: DrivewayData = {
			current: snapshot,
			history
		};

		await put(DRIVEWAY_BLOB_KEY, JSON.stringify(data), {
			access: 'private',
			contentType: 'application/json',
			addRandomSuffix: false,
			allowOverwrite: true,
			token: env.BLOB_READ_WRITE_TOKEN
		});

		const topMake = snapshot.topMakes[0];
		console.log(
			`[sync-driveway] OK: ${snapshot.totalVehicles.toLocaleString()} vehicles (${snapshot.dataYear}), #1 ${topMake?.make} (${topMake?.count.toLocaleString()}) in ${Date.now() - start}ms`
		);

		return new Response(
			JSON.stringify({
				ok: true,
				dataYear: snapshot.dataYear,
				totalVehicles: snapshot.totalVehicles,
				topMakesCount: snapshot.topMakes.length,
				fuelTypesCount: snapshot.fuelBreakdown.length
			}),
			{ headers: { 'Content-Type': 'application/json' } }
		);
	} catch (err) {
		return cronErrorResponse('sync-driveway', err, start);
	}
};
