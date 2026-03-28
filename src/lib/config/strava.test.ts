import { describe, it, expect } from 'vitest';
import { SEED_SEGMENTS, MARIN_BOUNDING_BOXES, stravaLeaderboardBlob, STRAVA_ENABLED } from './strava';

describe('strava config', () => {
	it('has unique segment IDs in seed list', () => {
		const ids = SEED_SEGMENTS.map((s) => s.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('all seed segments have valid coordinates', () => {
		for (const seg of SEED_SEGMENTS) {
			expect(seg.startLatlng[0]).toBeGreaterThan(37);
			expect(seg.startLatlng[0]).toBeLessThan(39);
			expect(seg.startLatlng[1]).toBeGreaterThan(-123);
			expect(seg.startLatlng[1]).toBeLessThan(-122);
		}
	});

	it('all seed segments have valid activity types', () => {
		for (const seg of SEED_SEGMENTS) {
			expect(['ride', 'run']).toContain(seg.activityType);
		}
	});

	it('bounding boxes cover Marin latitude range', () => {
		const allSouth = MARIN_BOUNDING_BOXES.map((b) => b[0]);
		const allNorth = MARIN_BOUNDING_BOXES.map((b) => b[2]);
		expect(Math.min(...allSouth)).toBeLessThanOrEqual(37.84);
		expect(Math.max(...allNorth)).toBeGreaterThanOrEqual(38.07);
	});

	it('generates correct blob key', () => {
		expect(stravaLeaderboardBlob(229781)).toBe('strava-leaderboard-229781.json');
	});

	it('feature flag is enabled', () => {
		expect(STRAVA_ENABLED).toBe(true);
	});
});
