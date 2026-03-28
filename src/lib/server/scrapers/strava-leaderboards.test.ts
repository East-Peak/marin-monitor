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

		it('extracts distance from stats section', () => {
			expect(result!.distance).not.toBeNull();
			// Hawk Hill is 2.65km = 2650m
			expect(result!.distance).toBeCloseTo(2650, -1);
		});

		it('extracts elevation gain from stats section', () => {
			expect(result!.elevationGain).not.toBeNull();
			expect(result!.elevationGain).toBe(156);
		});

		it('extracts avg grade from stats section', () => {
			expect(result!.avgGrade).not.toBeNull();
			expect(result!.avgGrade).toBe(6.8);
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

		it('extracts distance from stats section', () => {
			expect(result!.distance).not.toBeNull();
			// Dipsea is 4.11km = 4110m
			expect(result!.distance).toBeCloseTo(4110, -1);
		});

		it('extracts elevation gain from stats section', () => {
			expect(result!.elevationGain).not.toBeNull();
			expect(result!.elevationGain).toBe(493);
		});

		it('extracts avg grade from stats section', () => {
			expect(result!.avgGrade).not.toBeNull();
			expect(result!.avgGrade).toBe(9.9);
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

	describe('HTML cleanup', () => {
		it('strips inline tags and decodes entities in leaderboard cells', () => {
			const html = `
				<html>
					<head>
						<title>Encoded &amp; Scenic | Strava Ride Segment in Marin County, California</title>
					</head>
					<body>
						<div
							data-react-class='SegmentDetailsSideBar'
							data-react-props='{&quot;sideBarProps&quot;:{&quot;segmentId&quot;:99,&quot;fastestTimes&quot;:{&quot;overall&quot;:{&quot;id&quot;:1,&quot;name&quot;:&quot;Ana &amp; Co&quot;,&quot;stats&quot;:[{&quot;label&quot;:&quot;CR (Everyone)&quot;,&quot;value&quot;:&quot;31s&quot;}],&quot;date&quot;:&quot;Jan 1, 2026&quot;,&quot;segmentEffortId&quot;:&quot;10&quot;,&quot;activityId&quot;:20}}}}'
						></div>
						<span data-full-name='Encoded &amp; Scenic' id='js-full-name'></span>
						<table class='table table-striped table-leaderboard'>
							<thead>
								<tr>
									<th>Rank</th>
									<th>Name</th>
									<th>Speed</th>
									<th>Power</th>
									<th>VAM</th>
									<th>Time</th>
								</tr>
							</thead>
							<tbody>
								<tr>
									<td>1</td>
									<td>Ana &amp; Co</td>
									<td>29.3<abbr title='kilometers per hour'> km/h</abbr></td>
									<td>355<abbr title='watts'>w</abbr></td>
									<td>900<abbr title='meters per hour'>vam</abbr></td>
									<td><a href="/activities/20">31<abbr class='unit' title='second'>s</abbr></a></td>
								</tr>
							</tbody>
						</table>
						12 Attempts By 7 People
						<span class="stat-subtext">Distance</span><b class="stat-text">1.23<abbr title='kilometers'>km</abbr></b>
						<span class="stat-subtext">Elevation Gain</span><b class="stat-text">45<abbr title='meters'>m</abbr></b>
						<span class="stat-subtext">Avg Grade</span><b class="stat-text">3.7<abbr title='percent'>%</abbr></b>
					</body>
				</html>
			`;

			const result = parseSegmentPage(99, html);

			expect(result).not.toBeNull();
			expect(result!.segmentName).toBe('Encoded & Scenic');
			expect(result!.cr?.athleteName).toBe('Ana & Co');
			expect(result!.cr?.time).toBe('31s');
			expect(result!.rows[0]?.athleteName).toBe('Ana & Co');
			expect(result!.rows[0]?.time).toBe('31s');
			expect(result!.rows[0]?.speed).toBe('29.3');
			expect(result!.rows[0]?.power).toBe('355');
		});
	});
});
