import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseSegmentPage } from './strava-leaderboards';

const FIXTURES = resolve(__dirname, '../../../../tests/fixtures');
const hawkHillHtml = readFileSync(resolve(FIXTURES, 'strava-hawk-hill.html'), 'utf-8');
const dipseaHtml = readFileSync(resolve(FIXTURES, 'strava-dipsea.html'), 'utf-8');

describe('parseSegmentPage', () => {
	describe('Hawk Hill (ride segment 229781)', () => {
		const result = parseSegmentPage(229781, hawkHillHtml);

		it('returns a non-null result', () => {
			expect(result).not.toBeNull();
		});

		it('extracts CR from React props with athleteId, effortId, and time', () => {
			expect(result!.cr).not.toBeNull();
			expect(result!.cr!.athleteId).toBeTypeOf('number');
			expect(result!.cr!.athleteId).toBeGreaterThan(0);
			expect(result!.cr!.effortId).toBeTypeOf('number');
			expect(result!.cr!.effortId).toBeGreaterThan(0);
			expect(result!.cr!.time).toBe('5:17');
			expect(result!.cr!.athleteName).toBe('J K');
			expect(result!.cr!.activityId).toBe(15911228828);
		});

		it('extracts QOM from React props', () => {
			expect(result!.qom).not.toBeNull();
			expect(result!.qom!.athleteId).toBeTypeOf('number');
			expect(result!.qom!.athleteId).toBeGreaterThan(0);
			expect(result!.qom!.time).toBe('6:38');
			expect(result!.qom!.athleteName).toBe('Courtney N');
			expect(result!.qom!.activityId).toBe(6122756795);
		});

		it('extracts leaderboard rows from HTML table', () => {
			expect(result!.rows.length).toBeGreaterThan(0);
			expect(result!.rows.length).toBeLessThanOrEqual(10);

			for (const row of result!.rows) {
				expect(row.rank).toBeTypeOf('number');
				expect(row.rank).toBeGreaterThan(0);
				expect(row.athleteName).toBeTypeOf('string');
				expect(row.athleteName.length).toBeGreaterThan(0);
				expect(row.time).toBeTypeOf('string');
				expect(row.activityId).toBeTypeOf('number');
				expect(row.activityId).toBeGreaterThan(0);
			}
		});

		it('has 7 leaderboard rows with non-contiguous ranks', () => {
			expect(result!.rows).toHaveLength(7);
			// Ranks include duplicates: 2, 3, 5, 5, 5, 8, 9
			const ranks = result!.rows.map((r) => r.rank);
			expect(ranks).toContain(2);
			expect(ranks).toContain(5);
			expect(ranks).not.toContain(1); // rank 1 is missing (privacy)
		});

		it('extracts speed, power, and vam for ride rows', () => {
			const firstRow = result!.rows[0];
			expect(firstRow.speed).not.toBeNull();
			// Some riders have power, some don't
			expect(firstRow.vam).not.toBeNull();
		});

		it('extracts attempt counts', () => {
			expect(result!.totalAttempts).toBeGreaterThan(900000);
			expect(result!.totalAthletes).toBeGreaterThan(70000);
		});

		it('extracts segment name', () => {
			expect(result!.segmentName).toBe('Hawk Hill');
		});

		it('sets segmentId correctly', () => {
			expect(result!.segmentId).toBe(229781);
		});

		it('sets scrapedAt as ISO timestamp', () => {
			expect(result!.scrapedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
		});
	});

	describe('Dipsea (running segment 907022)', () => {
		const result = parseSegmentPage(907022, dipseaHtml);

		it('returns a non-null result', () => {
			expect(result).not.toBeNull();
		});

		it('extracts CR from React props', () => {
			expect(result!.cr).not.toBeNull();
			expect(result!.cr!.athleteName).toBe('David Roche');
			expect(result!.cr!.time).toBe('23:19');
		});

		it('extracts QOM from React props', () => {
			expect(result!.qom).not.toBeNull();
			expect(result!.qom!.athleteName).toBe('Megan Roche');
			expect(result!.qom!.time).toBe('26:05');
		});

		it('extracts leaderboard rows', () => {
			expect(result!.rows.length).toBeGreaterThan(0);
			expect(result!.rows.length).toBeLessThanOrEqual(10);
		});

		it('has pace in speed field for running segment', () => {
			const firstRow = result!.rows[0];
			expect(firstRow.speed).not.toBeNull();
			expect(firstRow.speed).toMatch(/\d+:\d+/); // pace like "5:40"
		});

		it('has no power for running segment', () => {
			for (const row of result!.rows) {
				expect(row.power).toBeNull();
			}
		});

		it('extracts segment name', () => {
			expect(result!.segmentName).toBe('Dipsea/Steep Ravine (Stinson To Pantoll)');
		});

		it('extracts attempt counts', () => {
			expect(result!.totalAttempts).toBeGreaterThan(0);
			expect(result!.totalAthletes).toBeGreaterThan(0);
		});
	});

	describe('garbage HTML', () => {
		it('returns null for empty string', () => {
			expect(parseSegmentPage(1, '')).toBeNull();
		});

		it('returns null for short garbage', () => {
			expect(parseSegmentPage(1, '<html><body>Not a Strava page</body></html>')).toBeNull();
		});

		it('returns null for random text', () => {
			expect(parseSegmentPage(1, 'hello world')).toBeNull();
		});
	});
});
