import { put, head } from '@vercel/blob';
import { env } from '$env/dynamic/private';
import { computeFitnessSnapshot } from '$lib/server/scrapers/fitness';
import { verifyCronAuth } from '$lib/server/cron-auth';
import { cronErrorResponse } from '$lib/server/cron-response';
import { FITNESS_BLOB_KEY, MAX_FITNESS_HISTORY } from '$lib/config/fitness';
import type { RequestHandler } from './$types';
import type { FitnessData, FitnessSnapshot } from '$lib/types/fitness';

export const config = { maxDuration: 60 };

/** Strip studios[] from a snapshot to keep history entries small */
function toHistoryEntry(
	snapshot: FitnessSnapshot
): Omit<FitnessSnapshot, 'studios'> & { studios?: never } {
	return {
		timestamp: snapshot.timestamp,
		studioCount: snapshot.studioCount,
		medianPrice: snapshot.medianPrice,
		avgPrice: snapshot.avgPrice,
		minPrice: snapshot.minPrice,
		maxPrice: snapshot.maxPrice,
		medianByType: snapshot.medianByType
	};
}

export const GET: RequestHandler = async ({ request }) => {
	const authError = verifyCronAuth(request);
	if (authError) return authError;

	const start = Date.now();
	try {
		const snapshot = computeFitnessSnapshot();

		// Read existing blob to append history
		let existing: FitnessData = { current: null, history: [] };
		try {
			const blob = await head(FITNESS_BLOB_KEY, { token: env.BLOB_READ_WRITE_TOKEN });
			const res = await fetch(blob.downloadUrl, {
				headers: { Authorization: `Bearer ${env.BLOB_READ_WRITE_TOKEN}` }
			});
			if (res.ok) {
				existing = (await res.json()) as FitnessData;
			}
		} catch {
			// No existing blob -- start fresh
		}

		// Append to history (capped), omitting studios[] from history entries
		const history = [toHistoryEntry(snapshot), ...existing.history].slice(0, MAX_FITNESS_HISTORY);

		const data: FitnessData = {
			current: snapshot,
			history
		};

		await put(FITNESS_BLOB_KEY, JSON.stringify(data), {
			access: 'private',
			contentType: 'application/json',
			addRandomSuffix: false,
			allowOverwrite: true,
			token: env.BLOB_READ_WRITE_TOKEN
		});

		console.log(
			`[sync-fitness] OK: ${snapshot.studioCount} studios, median $${snapshot.medianPrice?.toFixed(2) ?? 'N/A'} in ${Date.now() - start}ms`
		);

		return new Response(
			JSON.stringify({
				ok: true,
				studioCount: snapshot.studioCount,
				medianPrice: snapshot.medianPrice,
				medianByType: snapshot.medianByType
			}),
			{ headers: { 'Content-Type': 'application/json' } }
		);
	} catch (err) {
		return cronErrorResponse('sync-fitness', err, start);
	}
};
