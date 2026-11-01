import { describe, expect, it } from 'vitest';
import { wordsText } from './chart-readout';
import { hourColumns, type HourColumnsInput } from './hour-columns';

const H = 3_600_000;
const MIN = 60_000;
/** Saturday 9:12 AM PDT; the current hour is 9 AM. */
const NOW = Date.parse('2026-10-31T16:12:00Z');
const HOUR0 = Math.floor(NOW / H) * H;
const rep = (minutesFromHour0: number, tempF = 50) => ({
	atMs: HOUR0 + minutesFromHour0 * MIN,
	tempF
});
const period = (i: number, f: number | null = 60 + i, pop: number | null = 10) => ({
	startMs: HOUR0 + i * H,
	endMs: HOUR0 + (i + 1) * H,
	temperatureF: f,
	pop
});
const periods = Array.from({ length: 30 }, (_, i) => period(i));
const input = (over: Partial<HourColumnsInput> = {}): HourColumnsInput => ({
	reports: [rep(-240), rep(-180), rep(-120), rep(-60), rep(-5, 55)],
	periods,
	now: NOW,
	ahead: 8,
	...over
});
const said = (c: { words: Parameters<typeof wordsText>[0] }) => wordsText(c.words);

describe('hourColumns', () => {
	it('4 past hours, now, then the forecast hours', () => {
		const cols = hourColumns(input());
		expect(cols).toHaveLength(13);
		expect(cols.map((c) => (c.at - HOUR0) / H)).toEqual([
			-4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8
		]);
		expect(cols.filter((c) => c.isNow).map((c) => c.at)).toEqual([HOUR0]);
		expect(hourColumns(input({ ahead: 24 }))).toHaveLength(29);
	});

	it('a past column takes the report nearest its hour, in its own time', () => {
		const cols = hourColumns(input({ reports: [rep(-70, 47), rep(-45, 48), rep(-5, 55)] }));
		expect(cols[3]).toMatchObject({ f: 47, kind: 'observed', reportAt: HOUR0 - 70 * MIN });
		expect(said(cols[3])).toBe('observed 47° · 7:50 AM · Gnoss Field');
	});

	it('±30 min is inside; a minute past it is not', () => {
		expect(hourColumns(input({ reports: [rep(-90, 44)] }))[3].f).toBe(44);
		expect(hourColumns(input({ reports: [rep(-30, 44)] }))[3].f).toBe(44);
		expect(hourColumns(input({ reports: [rep(-91, 44)] }))[3].f).toBeNull();
		expect(hourColumns(input({ reports: [rep(-29, 44)] }))[3].f).toBeNull();
	});

	it('a tie goes to the earlier report', () => {
		const cols = hourColumns(input({ reports: [rep(-70, 1), rep(-50, 2)] }));
		expect(cols[3].f).toBe(1);
	});

	it('a column with no temperature in its window says the real silence, not the clock hour', () => {
		const cols = hourColumns(input({ reports: [rep(-230, 40), rep(-105, 41), rep(-5, 55)] }));
		expect(cols[1]).toMatchObject({ f: null, kind: 'observed' }); // 6 AM: nothing 5:30–6:30
		expect(said(cols[1])).toBe('No readings 5:10–7:15 AM');
		expect(cols[1].from).toBe(cols[1].at - 30 * MIN);
		expect(cols[1].to).toBe(cols[1].at + 30 * MIN);
	});

	it('a silence at the edge names the one end it has', () => {
		const cols = hourColumns(input({ reports: [rep(-5, 55)] }));
		expect(said(cols[0])).toBe('No readings before 8:55 AM');
		const none = hourColumns(input({ reports: [] }));
		expect(said(none[0])).toBe('No readings');
		expect(said(none[4])).toBe('forecast 60° · 9 AM');
	});

	it('reports that are unavailable never read as a silence at the station', () => {
		const cols = hourColumns(input({ reports: null }));
		expect(cols[0].f).toBeNull();
		expect(said(cols[0])).toBe('Readings unavailable · 5 AM');
	});

	describe('Now', () => {
		it('is the latest report when it is at or after 30 min before the hour', () => {
			const at = hourColumns(input({ reports: [rep(-30, 52)] }))[4];
			expect(at).toMatchObject({ f: 52, kind: 'observed', isNow: true, pop: null });
			expect(said(at)).toBe('observed 52° · 8:30 AM · Gnoss Field');
		});
		it('is this hour’s forecast, labelled, when the latest report is older', () => {
			const at = hourColumns(input({ reports: [rep(-31, 52)] }))[4];
			expect(at).toMatchObject({ f: 60, kind: 'forecast', isNow: true });
			expect(said(at)).toBe('forecast 60° · 9 AM');
		});
		it('is the headline’s own report whatever the history says', () => {
			const headline = { atMs: HOUR0 - 5 * MIN, tempF: 55 };
			const newer = hourColumns(input({ reports: [rep(5, 59)], headline }))[4];
			expect(newer).toMatchObject({ f: 55, reportAt: headline.atMs, kind: 'observed' });
			const failed = hourColumns(input({ reports: null, headline }))[4];
			expect(failed).toMatchObject({ f: 55, kind: 'observed' });
		});
		it('an old headline does not hold Now; the forecast does', () => {
			const headline = { atMs: HOUR0 - 31 * MIN, tempF: 55 };
			expect(hourColumns(input({ reports: [], headline }))[4]).toMatchObject({
				f: 60,
				kind: 'forecast'
			});
		});
		it('a stale headline says stale, whatever the history’s freshness', () => {
			const headline = { atMs: HOUR0 - 5 * MIN, tempF: 55 };
			const at = hourColumns(input({ headline, staleHeadline: true }))[4];
			expect(said(at)).toBe('observed 55° · 8:55 AM · Gnoss Field · stale');
		});
		it('takes the newest of several', () => {
			const at = hourColumns(input({ reports: [rep(-25, 1), rep(-5, 2), rep(5, 3)] }))[4];
			expect(at.f).toBe(3);
		});
	});

	it('a screen reader hears the rain chance the column shows', () => {
		const pops = periods.map((p, i) => (i === 2 ? { ...p, pop: null } : p));
		const cols = hourColumns(input({ periods: pops }));
		expect(cols[5].spoken).toBe('forecast 61° · 10 AM · 10% chance of rain');
		expect(cols[6].spoken).toBe('forecast 62° · 11 AM · chance of rain unknown');
		expect(cols[3].spoken).toBeUndefined();
	});

	it('forecast columns carry the chance of rain; past columns none', () => {
		const cols = hourColumns(input());
		expect(cols[0].pop).toBeNull();
		expect(cols[5]).toMatchObject({ f: 61, pop: 10, kind: 'forecast' });
		expect(said(cols[5])).toBe('forecast 61° · 10 AM');
	});

	it('a forecast hour NWS omitted, or a period that isn’t that hour, is no forecast', () => {
		const gappy = periods.map((p, i) =>
			i === 2 ? { ...p, temperatureF: null } : i === 3 ? { ...p, endMs: p.endMs + H } : p
		);
		const cols = hourColumns(input({ periods: gappy }));
		expect(cols[6].f).toBeNull();
		expect(said(cols[6])).toBe('No forecast · 11 AM');
		expect(cols[7].f).toBeNull();
	});

	it('an unavailable forecast leaves its columns empty and takes nothing else', () => {
		const cols = hourColumns(input({ periods: null, reports: [rep(-60, 50)] }));
		expect(cols.slice(5).every((c) => c.f === null && c.pop === null)).toBe(true);
		expect(said(cols[6])).toBe('No forecast · 11 AM');
		expect(cols[4].f).toBeNull(); // the latest is too old for Now, and no forecast stands in
	});

	it('stale series say so, each on its own side', () => {
		const cols = hourColumns(input({ staleReports: true }));
		expect(said(cols[3])).toBe('observed 50° · 8 AM · Gnoss Field · stale');
		expect(said(cols[5])).toBe('forecast 61° · 10 AM');
		const fc = hourColumns(input({ staleForecast: true }));
		expect(said(fc[3])).toBe('observed 50° · 8 AM · Gnoss Field');
		expect(said(fc[5])).toBe('forecast 61° · 10 AM · stale');
	});

	it('across midnight the readout names the day', () => {
		const late = Date.parse('2026-11-01T06:30:00Z'); // Saturday 11:30 PM PDT
		const start = Math.floor(late / H) * H;
		const cols = hourColumns({
			reports: [],
			periods: Array.from({ length: 4 }, (_, i) => ({
				startMs: start + i * H,
				endMs: start + (i + 1) * H,
				temperatureF: 50,
				pop: 0
			})),
			now: late,
			ahead: 2
		});
		expect(said(cols[5])).toBe('forecast 50° · Sun 12 AM');
	});

	it('hours count real elapsed time through fall-back', () => {
		const dst = Date.parse('2026-11-01T10:10:00Z'); // 2:10 AM PST, an hour after the repeat
		const cols = hourColumns({ reports: [], periods: [], now: dst, ahead: 0 });
		expect(cols[1].at - cols[0].at).toBe(H);
		expect(said(cols[4])).toBe('No forecast · 2 AM');
	});
});
