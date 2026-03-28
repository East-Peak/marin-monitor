import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchStravaSegments, fetchStravaLeaderboard, fetchStravaEvents } from './strava';

vi.mock('$lib/config/api', () => ({
	logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

describe('strava client adapter', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it('fetchStravaSegments returns data on success', async () => {
		const mockData = {
			segments: [{ id: 229781, name: 'Hawk Hill', activityType: 'ride' }],
			lastUpdated: '2026-03-28T00:00:00Z'
		};
		global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(mockData) });
		const result = await fetchStravaSegments();
		expect(result.segments).toHaveLength(1);
		expect(result.segments[0].name).toBe('Hawk Hill');
	});

	it('fetchStravaSegments returns empty on failure', async () => {
		global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
		const result = await fetchStravaSegments();
		expect(result.segments).toEqual([]);
	});

	it('fetchStravaLeaderboard returns data for valid ID', async () => {
		const mockData = { segmentId: 229781, cr: { athleteName: 'J K', time: '5:17' }, rows: [] };
		global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(mockData) });
		const result = await fetchStravaLeaderboard(229781);
		expect(result).not.toBeNull();
		expect(result!.cr!.athleteName).toBe('J K');
	});

	it('fetchStravaEvents returns empty on failure', async () => {
		global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
		const result = await fetchStravaEvents();
		expect(result.events).toEqual([]);
	});
});
