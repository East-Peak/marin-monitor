import { writable, derived } from 'svelte/store';
import { fetchStravaSegments, fetchStravaLeaderboard, fetchStravaEvents } from '$lib/api/marin/strava';
import { STRAVA_ENABLED } from '$lib/config/strava';
import type { StravaSegmentCatalog, StravaLeaderboard, StravaEventLog } from '$lib/types/strava';

export const stravaSegments = writable<StravaSegmentCatalog>({ segments: [], lastUpdated: '' });
export const stravaEvents = writable<StravaEventLog>({ events: [], lastUpdated: '' });

const leaderboardCache = writable<Map<number, StravaLeaderboard>>(new Map());
export const stravaLeaderboards = derived(leaderboardCache, ($cache) => $cache);

export async function loadStravaData(): Promise<void> {
	if (!STRAVA_ENABLED) return;
	const [catalog, events] = await Promise.all([fetchStravaSegments(), fetchStravaEvents()]);
	stravaSegments.set(catalog);
	stravaEvents.set(events);
}

export async function loadLeaderboard(segmentId: number): Promise<StravaLeaderboard | null> {
	let cached: StravaLeaderboard | undefined;
	leaderboardCache.subscribe(($cache) => {
		cached = $cache.get(segmentId);
	})();
	if (cached) return cached;

	const data = await fetchStravaLeaderboard(segmentId);
	if (data) {
		leaderboardCache.update(($cache) => {
			const next = new Map($cache);
			next.set(segmentId, data);
			return next;
		});
	}
	return data;
}
