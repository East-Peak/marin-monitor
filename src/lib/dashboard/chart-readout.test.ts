import { describe, expect, it } from 'vitest';
import {
	clockTime,
	gapStop,
	gapWords,
	nearestPoint,
	pixelAtTime,
	rangeWords,
	readingWords,
	silences,
	stamp,
	timeAtPixel,
	timeSpan,
	wordsText,
	type PlotScale,
	type Reading
} from './chart-readout';

const MIN = 60_000;
const at = (m: number) => ({ at: m * MIN });

describe('nearestPoint', () => {
	it('snaps to the nearer reading and never makes one up', () => {
		expect(nearestPoint([at(0), at(20), at(40)], 12 * MIN)).toEqual(at(20));
		expect(nearestPoint([at(0), at(20), at(40)], 8 * MIN)).toEqual(at(0));
	});
	it('a tie goes to the earlier point, in any order', () => {
		expect(nearestPoint([at(20), at(0)], 10 * MIN)).toEqual(at(0));
		expect(nearestPoint([at(0), at(20)], 10 * MIN)).toEqual(at(0));
	});
	it('reads irregular spacing by time, not by index', () => {
		expect(nearestPoint([at(0), at(1), at(2), at(100)], 80 * MIN)).toEqual(at(100));
	});
	it('out-of-order points read the same', () => {
		expect(nearestPoint([at(40), at(0), at(20)], 39 * MIN)).toEqual(at(40));
	});
	it('empty and one-point series', () => {
		expect(nearestPoint([], 0)).toBeNull();
		expect(nearestPoint([at(5)], 500 * MIN)).toEqual(at(5));
	});
	it('inside a silence returns the silence, at its ends the reading', () => {
		const gap = { at: 50 * MIN, from: 0, to: 100 * MIN };
		const stops = [at(0), gap, at(100)];
		expect(nearestPoint(stops, 40 * MIN)).toBe(gap);
		expect(nearestPoint(stops, 0)).toEqual(at(0));
		expect(nearestPoint(stops, 100 * MIN)).toEqual(at(100));
	});
	it('never snaps onto a silence from outside it', () => {
		const gap = { at: 50 * MIN, from: 40 * MIN, to: 60 * MIN };
		expect(nearestPoint([at(0), gap, at(100)], 30 * MIN)).toEqual(at(0));
	});
});

describe('silences', () => {
	it('finds stretches over the rule; exactly the rule is not one', () => {
		expect(silences([0, 60 * MIN, 121 * MIN], 60 * MIN)).toEqual([
			{ from: 60 * MIN, to: 121 * MIN, start: 60 * MIN, end: 121 * MIN }
		]);
	});
	it('a gap at either end of the domain is a gap like any other', () => {
		const domain = [0, 300 * MIN] as const;
		expect(silences([100 * MIN, 120 * MIN], 60 * MIN, domain)).toEqual([
			{ from: null, to: 100 * MIN, start: 0, end: 100 * MIN },
			{ from: 120 * MIN, to: null, start: 120 * MIN, end: 300 * MIN }
		]);
	});
	it('no readings: nothing to anchor a silence to', () => {
		expect(silences([], 60 * MIN, [0, MIN])).toEqual([]);
	});
});

const OCT31 = Date.parse('2026-10-31T21:15:00Z'); // Saturday 2:15 PM PDT
const r = (value: number | null, kind: Reading['kind'], unit = '°'): Reading => ({
	at: OCT31,
	value,
	kind,
	unit
});
const say = (rd: Reading, o: Partial<Parameters<typeof readingWords>[1]> = {}) =>
	wordsText(readingWords(rd, { when: clockTime(rd.at), ...o }));

describe('the words', () => {
	it('observed', () => expect(say(r(58, 'observed'))).toBe('58° · 2:15 PM'));
	it('forecast', () => expect(say(r(62, 'forecast'))).toBe('forecast 62° · 2:15 PM'));
	it('prediction, with its own form', () =>
		expect(say(r(6.3, 'prediction', ' ft'), { format: (v) => `${v.toFixed(1)} ft` })).toBe(
			'predicted 6.3 ft · 2:15 PM'
		));
	it('reference keeps its word', () =>
		expect(say(r(412, 'reference', 'k'), { format: (v) => `$${v}k`, notes: ['recomputed'] })).toBe(
			'$412k · 2:15 PM · recomputed · reference'
		));
	it('stale', () => expect(say(r(58, 'observed'), { stale: true })).toBe('58° · 2:15 PM · stale'));
	it('null reads as no reading, never 0', () =>
		expect(say(r(null, 'forecast'))).toBe('No reading · 2:15 PM'));
	it('0 is a reading', () => expect(say(r(0, 'forecast', '%'))).toBe('forecast 0% · 2:15 PM'));
	it('a range', () =>
		expect(wordsText(rangeWords('$5.89', '$5.29', '$6.79', 'Oct 30'))).toBe(
			'$5.89 average · $5.29–$6.79 · Oct 30'
		));
	it('a range with either end missing shows only the average', () => {
		expect(wordsText(rangeWords('$5.89', null, '$6.79', 'Oct 30'))).toBe('$5.89 average · Oct 30');
		expect(wordsText(rangeWords('$5.89', '$5.29', null, 'Oct 30'))).toBe('$5.89 average · Oct 30');
	});
	it('a silence, its first end sharing AM or PM', () => {
		expect(timeSpan('9:55 AM', '11:15 AM')).toBe('9:55–11:15 AM');
		expect(timeSpan('11:40 AM', '1:15 PM')).toBe('11:40 AM–1:15 PM');
		expect(timeSpan('Oct 30', 'Oct 31')).toBe('Oct 30–Oct 31');
	});
	it('a silence at the ends of a chart', () => {
		const t = (ms: number) => clockTime(ms);
		expect(wordsText(gapWords({ from: null, to: OCT31 }, t))).toBe('No readings before 2:15 PM');
		expect(wordsText(gapWords({ from: OCT31, to: null }, t))).toBe('No readings since 2:15 PM');
	});
	it('a silence between two readings', () =>
		expect(wordsText(gapWords({ from: OCT31, to: OCT31 + 80 * MIN }, clockTime))).toBe(
			'No readings 2:15–3:35 PM'
		));
	it('a silence stop has no dot and spans its stretch', () => {
		const s = gapStop({ from: 0, to: 100, start: 0, end: 100 }, clockTime);
		expect(s).toMatchObject({ at: 50, y: null, from: 0, to: 100 });
	});
});

describe('stamp across midnight and DST', () => {
	const NOW = Date.parse('2026-10-31T23:00:00Z'); // Saturday 4 PM PDT
	it('today has no weekday', () => expect(stamp(NOW, NOW)).toBe('4 PM'));
	it('after Pacific midnight it carries one', () =>
		expect(stamp(Date.parse('2026-11-01T08:00:00Z'), NOW)).toBe('Sun 1 AM'));
	it('before Pacific midnight it is still today, though UTC has moved on', () =>
		expect(stamp(Date.parse('2026-11-01T06:30:00Z'), NOW)).toBe('11:30 PM'));
	it('a multi-day chart always carries it', () => expect(stamp(NOW, NOW, true)).toBe('Sat 4 PM'));
	it('the repeated hour at fall-back reads as it does on the clock', () => {
		const first = Date.parse('2026-11-01T08:30:00Z');
		const second = Date.parse('2026-11-01T09:30:00Z');
		expect(clockTime(first)).toBe('1:30 AM');
		expect(clockTime(second)).toBe('1:30 AM');
	});
	it('the skipped hour at spring-forward', () => {
		expect(clockTime(Date.parse('2027-03-14T09:59:00Z'))).toBe('1:59 AM');
		expect(clockTime(Date.parse('2027-03-14T10:00:00Z'))).toBe('3 AM');
	});
});

describe('pixels and time', () => {
	const plot: PlotScale = { domain: [1000, 2000], left: 34, right: 748, width: 760 };
	it('applies margins and scaling', () => {
		expect(pixelAtTime(1000, plot, 760)).toBe(34);
		expect(pixelAtTime(2000, plot, 760)).toBe(748);
		expect(pixelAtTime(1500, plot, 380)).toBe(195.5);
	});
	it('round-trips under scaling', () => {
		for (const w of [760, 358, 1300])
			expect(timeAtPixel(pixelAtTime(1234, plot, w), plot, w)).toBeCloseTo(1234, 6);
	});
	it('a one-instant domain stays on the plot', () => {
		expect(pixelAtTime(5, { ...plot, domain: [5, 5] }, 760)).toBe(34);
	});
});
