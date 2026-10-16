import { describe, it, expect } from 'vitest';
import { gasChangeOverDays } from './gas-change';
import oct15 from './__fixtures__/gas-prices-2026-10-15.json';

const H = 3_600_000;
const NOW = Date.parse('2026-10-15T08:00:00Z');
const snap = (ms: number, avgRegular: number | null) => ({
	timestamp: new Date(ms).toISOString(),
	avgRegular
});

describe('gasChangeOverDays', () => {
	it('uses the snapshot nearest to (but not after) 7 days before current, regardless of array order', () => {
		// Ten days of 4-hourly snapshots, the price falling a tenth of a cent each reading.
		const fourHourly = Array.from({ length: 60 }, (_, i) => snap(NOW - i * 4 * H, 6.3 + i * 0.001));
		const july = snap(Date.parse('2026-07-07T08:00:00Z'), 5.579);
		// The legacy panel read history[41]: put the July entry exactly there, and shuffle the rest.
		const shuffled = [...fourHourly].sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1));
		shuffled.reverse();
		shuffled.splice(7, 0, shuffled.splice(30, 1)[0]);
		shuffled.splice(41, 0, july);
		expect(shuffled[41]).toBe(july);

		const current = fourHourly[0];
		// Exactly 7 days back is snapshot 42 (42 × 4 h = 168 h).
		const weekAgo = fourHourly[42];
		const change = gasChangeOverDays(shuffled, current, 7);
		expect(change).toBeCloseTo(current.avgRegular! - weekAgo.avgRegular!, 10);
		expect(gasChangeOverDays([...shuffled].reverse(), current, 7)).toBeCloseTo(change!, 10);
	});

	it('takes the newest snapshot at or before the cutoff when none sits exactly on it', () => {
		const current = snap(NOW, 6.3);
		const history = [snap(NOW - 7 * 24 * H + H, 9), snap(NOW - 7 * 24 * H - 2 * H, 6.5)];
		history.push(snap(NOW - 9 * 24 * H, 7));
		expect(gasChangeOverDays(history, current, 7)).toBeCloseTo(-0.2, 10);
	});

	it('Oct 15 fixture → −0.222', () => {
		const change = gasChangeOverDays(oct15.history, oct15.current, 7);
		expect(change).not.toBeNull();
		expect(change!.toFixed(3)).toBe('-0.222');
	});

	it('returns null with < 7 days of history, or a null avg', () => {
		const current = snap(NOW, 6.3);
		const sixDays = Array.from({ length: 36 }, (_, i) => snap(NOW - i * 4 * H, 6.4));
		expect(gasChangeOverDays(sixDays, current, 7)).toBeNull();
		expect(gasChangeOverDays([], current, 7)).toBeNull();
		const weekAgo = snap(NOW - 7 * 24 * H, 6.5);
		expect(gasChangeOverDays([weekAgo], snap(NOW, null), 7)).toBeNull();
		expect(gasChangeOverDays([snap(NOW - 7 * 24 * H, null)], current, 7)).toBeNull();
		expect(gasChangeOverDays([weekAgo], null, 7)).toBeNull();
	});
});
