import { describe, expect, it } from 'vitest';
import type { SourceStatusEntry } from './source-status';
import {
	emptyWording,
	mapMeasured,
	measuredFromEntry,
	measuredLoading,
	measuredUnavailable,
	measuredUnknown,
	measuredValue
} from './measured';

const NOW = Date.parse('2026-10-01T15:00:00Z');
const MIN = 60_000;
const entry = (
	state: SourceStatusEntry['state'],
	over: Partial<SourceStatusEntry> = {}
): SourceStatusEntry => ({
	id: 'part:snapshot',
	name: 'News snapshot',
	state,
	observedAt: NOW - MIN,
	maxAgeMs: 45 * MIN,
	detail: null,
	...over
});
const fresh = { now: NOW, maxAgeMs: 45 * MIN };

describe('nothing unvouched becomes a fact', () => {
	it('unknown and unavailable map to themselves, never to a value', () => {
		expect(mapMeasured(measuredUnknown<number>('X', 'no reading'), (n) => n * 2)).toEqual({
			kind: 'unknown',
			source: 'X',
			reason: 'no reading'
		});
		expect(mapMeasured(measuredUnavailable<number>('X', 'HTTP 503'), (n) => n * 2).kind).toBe(
			'unavailable'
		);
	});

	it('a value in a shared store that this owner never established is not shown (Codex r2 #3)', () => {
		// The stores outlive a controller: legacy or an earlier owner may have filled them.
		const inherited = ['inherited'];
		expect(measuredFromEntry(undefined, inherited, 'X', NOW).kind).toBe('loading');
		expect(measuredFromEntry(entry('loading'), inherited, 'X', NOW).kind).toBe('loading');
		expect(
			measuredFromEntry(entry('unavailable', { detail: 'HTTP 503' }), inherited, 'X', NOW)
		).toEqual({
			kind: 'unavailable',
			source: 'X',
			reason: 'HTTP 503'
		});
	});

	it('no value after a success is unknown, never an empty value', () => {
		expect(measuredFromEntry(entry('ok'), null, 'X', NOW).kind).toBe('unknown');
		expect(measuredFromEntry(entry('stale', { detail: 'HTTP 502' }), null, 'X', NOW).kind).toBe(
			'unavailable'
		);
	});
});

describe('values carry their own time and retention', () => {
	it("an ok entry within its age: a fresh value with the entry's own time", () => {
		expect(measuredFromEntry(entry('ok'), [1], 'X', NOW)).toEqual({
			kind: 'value',
			value: [1],
			observedAt: NOW - MIN,
			source: 'X',
			retainedAfter: null
		});
	});
	it('a stale entry: the value is retained, with the failure reason', () => {
		expect(measuredFromEntry(entry('stale', { detail: 'HTTP 502' }), [1], 'X', NOW)).toMatchObject({
			kind: 'value',
			retainedAfter: 'HTTP 502'
		});
	});
	it('an ok entry past its max age reads as retained "out of date" (the clock, not the stored state)', () => {
		expect(
			measuredFromEntry(entry('ok', { observedAt: NOW - 60 * MIN }), [1], 'X', NOW)
		).toMatchObject({ kind: 'value', retainedAfter: 'out of date' });
	});
	it('an "unknown" entry (fetched, age not reported) keeps the value with no time', () => {
		expect(
			measuredFromEntry(
				entry('unknown', { observedAt: null, detail: 'fetched; data age not reported' }),
				[1],
				'X',
				NOW
			)
		).toMatchObject({ kind: 'value', observedAt: null, retainedAfter: null });
	});
	it('mapMeasured keeps observedAt, source and retention', () => {
		const m = measuredValue(4.2, 'X', NOW - 90 * MIN, 'HTTP 503');
		expect(mapMeasured(m, (v) => `${v}`)).toEqual({
			kind: 'value',
			value: '4.2',
			observedAt: NOW - 90 * MIN,
			source: 'X',
			retainedAfter: 'HTTP 503'
		});
	});
});

describe('empty wording needs a fresh, successful, empty read', () => {
	it('fresh and empty: says it', () => {
		expect(emptyWording(measuredValue([], 'X', NOW - MIN), 'Nothing yet', fresh)).toBe(
			'Nothing yet'
		);
	});
	it('loading, unknown, unavailable, non-empty, retained, timeless or expired: never', () => {
		for (const m of [
			measuredLoading<readonly unknown[]>('X'),
			measuredUnknown<readonly unknown[]>('X', 'malformed'),
			measuredUnavailable<readonly unknown[]>('X', 'down'),
			measuredValue([1], 'X', NOW - MIN),
			measuredValue([], 'X', NOW - MIN, 'HTTP 503'),
			measuredValue([], 'X', null),
			measuredValue([], 'X', NOW - 60 * MIN)
		]) {
			expect(emptyWording(m, 'Nothing yet', fresh)).toBeNull();
		}
	});
	it('an empty list kept from an earlier owner, now unavailable, never says "nothing" (Codex r2 #3)', () => {
		const m = measuredFromEntry(entry('unavailable', { detail: 'HTTP 503' }), [], 'X', NOW);
		expect(emptyWording(m, 'Nothing yet', fresh)).toBeNull();
	});
});
