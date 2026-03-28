import { put, head } from '@vercel/blob';
import { env } from '$env/dynamic/private';
import { scrapeSegmentLeaderboardResult } from '$lib/server/scrapers/strava-leaderboards';
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

	// First scrape — no changes to detect (avoids flooding events on initial setup)
	if (!previous) return events;

	// Check CR change
	if (current.cr && current.cr.effortId !== 0) {
		const prevCr = previous.cr ?? null;
		if (prevCr && prevCr.effortId !== current.cr.effortId) {
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
		const prevQom = previous.qom ?? null;
		if (prevQom && prevQom.effortId !== current.qom.effortId) {
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

function emptyLeaderboard(segment: StravaSegment): StravaLeaderboard {
	return {
		segmentId: segment.id,
		segmentName: segment.name,
		cr: null,
		qom: null,
		rows: [],
		totalAttempts: 0,
		totalAthletes: 0,
		distance: segment.distance > 0 ? segment.distance : null,
		elevationGain: segment.elevationGain > 0 ? segment.elevationGain : null,
		avgGrade: segment.avgGrade > 0 ? segment.avgGrade : null,
		scrapedAt: new Date().toISOString()
	};
}

/** Process a single segment: scrape, detect changes, write leaderboard blob. */
async function processSegment(segment: StravaSegment): Promise<StravaEvent[]> {
	const blobKey = stravaLeaderboardBlob(segment.id);

	const [scrapeResult, previous] = await Promise.all([
		scrapeSegmentLeaderboardResult(segment.id),
		readBlob<StravaLeaderboard>(blobKey)
	]);

	if (scrapeResult.kind === 'error') return [];

	const current =
		scrapeResult.kind === 'ok' ? scrapeResult.leaderboard : emptyLeaderboard(segment);

	// Write new leaderboard to blob
	await put(blobKey, JSON.stringify(current), {
		access: 'private',
		contentType: 'application/json',
		addRandomSuffix: false,
		allowOverwrite: true,
		token: env.BLOB_READ_WRITE_TOKEN
	});

	if (scrapeResult.kind === 'not_found') {
		console.warn(`[sync-strava-leaderboards] Segment ${segment.id} unavailable on Strava; wrote empty leaderboard placeholder`);
		return [];
	}

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
		const leaderboardResults = new Map<number, StravaLeaderboard>();

		for (let i = 0; i < segments.length; i += CONCURRENCY) {
			const batch = segments.slice(i, i + CONCURRENCY);
			const results = await Promise.allSettled(batch.map((seg) => processSegment(seg)));

			for (let j = 0; j < results.length; j++) {
				const result = results[j];
				if (result.status === 'fulfilled') {
					scraped++;
					newEvents.push(...result.value);
				} else {
					failed++;
					console.warn('[sync-strava-leaderboards] Segment failed:', result.reason);
				}
			}
		}

		// Read fresh leaderboard data to update segment catalog stats
		let catalogUpdated = false;
		for (const seg of segments) {
			const blobKey = stravaLeaderboardBlob(seg.id);
			const lb = await readBlob<StravaLeaderboard>(blobKey);
			if (lb) {
				leaderboardResults.set(seg.id, lb);
			}
		}

		// Update segment catalog with fresh stats from leaderboard scrapes
		for (const seg of catalog.segments) {
			const lb = leaderboardResults.get(seg.id);
			if (!lb) continue;

			if (lb.totalAttempts > 0) {
				seg.totalAttempts = lb.totalAttempts;
				catalogUpdated = true;
			}
			if (lb.totalAthletes > 0) {
				seg.totalAthletes = lb.totalAthletes;
				catalogUpdated = true;
			}
			if (lb.distance != null && lb.distance > 0) {
				seg.distance = lb.distance;
				catalogUpdated = true;
			}
			if (lb.elevationGain != null && lb.elevationGain > 0) {
				seg.elevationGain = lb.elevationGain;
				catalogUpdated = true;
			}
			if (lb.avgGrade != null && lb.avgGrade > 0) {
				seg.avgGrade = lb.avgGrade;
				catalogUpdated = true;
			}
		}

		// Write updated catalog back to blob if any stats changed
		if (catalogUpdated) {
			catalog.lastUpdated = new Date().toISOString();
			await put(STRAVA_SEGMENTS_BLOB, JSON.stringify(catalog), {
				access: 'private',
				contentType: 'application/json',
				addRandomSuffix: false,
				allowOverwrite: true,
				token: env.BLOB_READ_WRITE_TOKEN
			});
			console.log('[sync-strava-leaderboards] Updated segment catalog with fresh stats');
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
			JSON.stringify({ ok: true, scraped, failed, newEvents: newEvents.length, catalogUpdated }),
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
