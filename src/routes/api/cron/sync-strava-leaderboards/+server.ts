import { put, head } from '@vercel/blob';
import { env } from '$env/dynamic/private';
import { scrapeSegmentLeaderboard } from '$lib/server/scrapers/strava-leaderboards';
import { verifyCronAuth } from '$lib/server/cron-auth';
import {
	STRAVA_ENABLED,
	STRAVA_SEGMENTS_BLOB,
	STRAVA_EVENTS_BLOB,
	STRAVA_EVENT_MAX_AGE_MS,
	stravaLeaderboardBlob
} from '$lib/config/strava';
import type { RequestHandler } from './$types';
import type {
	StravaSegment,
	StravaSegmentCatalog,
	StravaLeaderboard,
	StravaEventLog,
	StravaEvent
} from '$lib/types/strava';

export const config = { maxDuration: 60 };

const CONCURRENCY = 5;

/** Read a JSON blob by key, returning null if it doesn't exist or fails to parse. */
async function readBlob<T>(key: string): Promise<T | null> {
	try {
		const blob = await head(key, { token: env.BLOB_READ_WRITE_TOKEN });
		const res = await fetch(blob.downloadUrl, {
			headers: { Authorization: `Bearer ${env.BLOB_READ_WRITE_TOKEN}` }
		});
		if (!res.ok) return null;
		return (await res.json()) as T;
	} catch {
		return null;
	}
}

/**
 * Compare current and previous leaderboard records.
 * Returns a StravaEvent if the CR or QOM effort ID changed, null otherwise.
 */
function detectChanges(
	current: StravaLeaderboard,
	previous: StravaLeaderboard | null
): StravaEvent[] {
	const events: StravaEvent[] = [];

	// Check CR change
	if (current.cr && current.cr.effortId !== 0) {
		const prevCr = previous?.cr ?? null;
		if (!prevCr || prevCr.effortId !== current.cr.effortId) {
			events.push({
				type: 'new_kom',
				segmentId: current.segmentId,
				segmentName: current.segmentName,
				athlete: current.cr.athleteName,
				time: current.cr.time,
				effortId: current.cr.effortId,
				activityId: current.cr.activityId,
				previous: prevCr
					? { athlete: prevCr.athleteName, time: prevCr.time, effortId: prevCr.effortId }
					: null,
				detectedAt: new Date().toISOString()
			});
		}
	}

	// Check QOM change
	if (current.qom && current.qom.effortId !== 0) {
		const prevQom = previous?.qom ?? null;
		if (!prevQom || prevQom.effortId !== current.qom.effortId) {
			events.push({
				type: 'new_qom',
				segmentId: current.segmentId,
				segmentName: current.segmentName,
				athlete: current.qom.athleteName,
				time: current.qom.time,
				effortId: current.qom.effortId,
				activityId: current.qom.activityId,
				previous: prevQom
					? { athlete: prevQom.athleteName, time: prevQom.time, effortId: prevQom.effortId }
					: null,
				detectedAt: new Date().toISOString()
			});
		}
	}

	return events;
}

/** Process a single segment: scrape, detect changes, write leaderboard blob. */
async function processSegment(segment: StravaSegment): Promise<StravaEvent[]> {
	const blobKey = stravaLeaderboardBlob(segment.id);

	const [current, previous] = await Promise.all([
		scrapeSegmentLeaderboard(segment.id),
		readBlob<StravaLeaderboard>(blobKey)
	]);

	if (!current) return [];

	// Write new leaderboard to blob
	await put(blobKey, JSON.stringify(current), {
		access: 'private',
		contentType: 'application/json',
		addRandomSuffix: false,
		allowOverwrite: true,
		token: env.BLOB_READ_WRITE_TOKEN
	});

	return detectChanges(current, previous);
}

export const GET: RequestHandler = async ({ request }) => {
	const authError = verifyCronAuth(request);
	if (authError) return authError;

	if (!STRAVA_ENABLED) {
		return new Response(JSON.stringify({ ok: false, error: 'Strava disabled' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const start = Date.now();
	try {
		// Read segment catalog — required to know what to scrape
		const catalog = await readBlob<StravaSegmentCatalog>(STRAVA_SEGMENTS_BLOB);
		if (!catalog) {
			return new Response(
				JSON.stringify({ ok: false, error: 'No segment catalog found. Run sync-strava-segments first.' }),
				{ status: 400, headers: { 'Content-Type': 'application/json' } }
			);
		}

		const segments = catalog.segments;

		// Read existing events log
		const existingEventLog = await readBlob<StravaEventLog>(STRAVA_EVENTS_BLOB);
		const existingEvents: StravaEvent[] = existingEventLog?.events ?? [];

		// Scrape all segments in batches of CONCURRENCY
		let scraped = 0;
		let failed = 0;
		const newEvents: StravaEvent[] = [];

		for (let i = 0; i < segments.length; i += CONCURRENCY) {
			const batch = segments.slice(i, i + CONCURRENCY);
			const results = await Promise.allSettled(batch.map((seg) => processSegment(seg)));

			for (const result of results) {
				if (result.status === 'fulfilled') {
					scraped++;
					newEvents.push(...result.value);
				} else {
					failed++;
					console.warn('[sync-strava-leaderboards] Segment failed:', result.reason);
				}
			}
		}

		// Prepend new events and prune old ones
		const now = Date.now();
		const allEvents = [...newEvents, ...existingEvents].filter(
			(e) => now - new Date(e.detectedAt).getTime() < STRAVA_EVENT_MAX_AGE_MS
		);

		const eventLog: StravaEventLog = {
			events: allEvents,
			lastUpdated: new Date().toISOString()
		};

		await put(STRAVA_EVENTS_BLOB, JSON.stringify(eventLog), {
			access: 'private',
			contentType: 'application/json',
			addRandomSuffix: false,
			allowOverwrite: true,
			token: env.BLOB_READ_WRITE_TOKEN
		});

		console.log(
			`[sync-strava-leaderboards] OK: ${scraped} scraped, ${failed} failed, ${newEvents.length} new events in ${Date.now() - start}ms`
		);
		return new Response(
			JSON.stringify({ ok: true, scraped, failed, newEvents: newEvents.length }),
			{ headers: { 'Content-Type': 'application/json' } }
		);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.error(`[sync-strava-leaderboards] FAILED after ${Date.now() - start}ms:`, message);
		return new Response(JSON.stringify({ ok: false, error: message }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};
