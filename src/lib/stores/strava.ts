import { writable, derived, get } from 'svelte/store';
import { fetchStravaSegments, fetchStravaLeaderboard, fetchStravaEvents } from '$lib/api/marin/strava';
import { STRAVA_ENABLED } from '$lib/config/strava';
import type { StravaSegmentCatalog, StravaLeaderboard, StravaEventLog } from '$lib/types/strava';

export const stravaSegments = writable<StravaSegmentCatalog>({ segments: [], lastUpdated: '' });
export const stravaEvents = writable<StravaEventLog>({ events: [], lastUpdated: '' });

interface CachedLeaderboard {
	data: StravaLeaderboard;
	fetchedAt: number;
}

const LEADERBOARD_CACHE_TTL_MS = 5 * 60 * 1000;

const leaderboardCache = writable<Map<number, CachedLeaderboard>>(new Map());
export const stravaLeaderboards = derived(leaderboardCache, ($cache) => {
	return new Map(Array.from($cache.entries(), ([segmentId, entry]) => [segmentId, entry.data]));
});

function clearLeaderboardCache(): void {
	leaderboardCache.set(new Map());
}

function shouldCacheLeaderboard(data: StravaLeaderboard): boolean {
	return Boolean(
		data.cr ||
			data.qom ||
			data.rows.length > 0 ||
			data.totalAttempts > 0 ||
			data.totalAthletes > 0
	);
}

export async function loadStravaData(): Promise<void> {
	if (!STRAVA_ENABLED) return;

	const previousCatalog = get(stravaSegments);
	const previousEvents = get(stravaEvents);
	const [catalog, events] = await Promise.all([fetchStravaSegments(), fetchStravaEvents()]);

	const catalogChanged =
		Boolean(previousCatalog.lastUpdated) && previousCatalog.lastUpdated !== catalog.lastUpdated;
	const eventsChanged =
		Boolean(previousEvents.lastUpdated) && previousEvents.lastUpdated !== events.lastUpdated;
	if (catalogChanged || eventsChanged) {
		clearLeaderboardCache();
	}

	stravaSegments.set(catalog);
	stravaEvents.set(events);
}

export async function loadLeaderboard(segmentId: number): Promise<StravaLeaderboard | null> {
	const cached = get(leaderboardCache).get(segmentId);
	if (cached && Date.now() - cached.fetchedAt < LEADERBOARD_CACHE_TTL_MS) {
		return cached.data;
	}

	const data = await fetchStravaLeaderboard(segmentId);
	if (data && shouldCacheLeaderboard(data)) {
		leaderboardCache.update(($cache) => {
			const next = new Map($cache);
			next.set(segmentId, {
				data,
				fetchedAt: Date.now()
			});
			return next;
		});
	}
	return data;
}
