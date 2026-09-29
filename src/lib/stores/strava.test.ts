import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';

const { fetchStravaSegments, fetchStravaEvents } = vi.hoisted(() => ({
	fetchStravaSegments: vi.fn(),
	fetchStravaEvents: vi.fn()
}));
vi.mock('$lib/api/marin/strava', () => ({
	fetchStravaSegments,
	fetchStravaEvents,
	fetchStravaLeaderboard: vi.fn(),
	fetchAllStravaLeaderboards: vi.fn()
}));
vi.mock('$lib/config/strava', async (orig) => ({
	...(await orig<typeof import('$lib/config/strava')>()),
	STRAVA_ENABLED: true
}));

import { loadStravaData, stravaEvents, stravaSegments } from './strava';

const CATALOG = { segments: [], lastUpdated: '2026-09-28T00:00:00Z' };
const EVENTS = { events: [], lastUpdated: '2026-09-28T00:00:00Z' };

beforeEach(() => {
	stravaSegments.set({ segments: [], lastUpdated: '' });
	stravaEvents.set({ events: [], lastUpdated: '' });
	fetchStravaSegments.mockResolvedValue(CATALOG);
	fetchStravaEvents.mockResolvedValue(EVENTS);
});

describe('loadStravaData owner lifetime', () => {
	it('commits the fetched catalog and events', async () => {
		await loadStravaData();
		expect(get(stravaSegments).lastUpdated).toBe(CATALOG.lastUpdated);
		expect(get(stravaEvents).lastUpdated).toBe(EVENTS.lastUpdated);
	});
	it('does not write the shared stores once its owner is gone', async () => {
		const owner = new AbortController();
		fetchStravaSegments.mockImplementation(async () => {
			owner.abort();
			return CATALOG;
		});
		await loadStravaData({ signal: owner.signal });
		expect(get(stravaSegments).lastUpdated).toBe('');
		expect(get(stravaEvents).lastUpdated).toBe('');
	});
});
