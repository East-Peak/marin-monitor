/**
 * Client-side adapter for Strava segment and leaderboard data
 */

import { logger } from '$lib/config/api';
import { fetchWithTimeout } from './fetch-helpers';
import type { StravaSegmentCatalog, StravaLeaderboard, StravaEventLog } from '$lib/types/strava';

export async function fetchStravaSegments(): Promise<StravaSegmentCatalog> {
	try {
		logger.log('Strava', 'Loading Strava segments from /api/data/strava-segments');

		const response = await fetchWithTimeout('/api/data/strava-segments', { cache: 'no-store' });
		if (!response.ok) {
			throw new Error(`Strava segments fetch failed: ${response.status}`);
		}

		return (await response.json()) as StravaSegmentCatalog;
	} catch (error) {
		logger.warn('Strava', `Strava segments fetch failed: ${(error as Error).message}`);
		return { segments: [], lastUpdated: '' };
	}
}

export async function fetchStravaLeaderboard(segmentId: number): Promise<StravaLeaderboard | null> {
	if (!segmentId) return null;

	try {
		logger.log('Strava', `Loading Strava leaderboard for segment ${segmentId}`);

		const response = await fetchWithTimeout(`/api/data/strava-leaderboard/${segmentId}`, {
			cache: 'no-store'
		});
		if (!response.ok) {
			throw new Error(`Strava leaderboard fetch failed: ${response.status}`);
		}

		return (await response.json()) as StravaLeaderboard;
	} catch (error) {
		logger.warn('Strava', `Strava leaderboard fetch failed: ${(error as Error).message}`);
		return null;
	}
}

export async function fetchStravaEvents(): Promise<StravaEventLog> {
	try {
		logger.log('Strava', 'Loading Strava events from /api/data/strava-events');

		const response = await fetchWithTimeout('/api/data/strava-events', { cache: 'no-store' });
		if (!response.ok) {
			throw new Error(`Strava events fetch failed: ${response.status}`);
		}

		return (await response.json()) as StravaEventLog;
	} catch (error) {
		logger.warn('Strava', `Strava events fetch failed: ${(error as Error).message}`);
		return { events: [], lastUpdated: '' };
	}
}
