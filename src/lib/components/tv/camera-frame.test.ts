// src/lib/components/tv/camera-frame.test.ts
import { beforeEach, describe, expect, it } from 'vitest';
import {
	OFFLINE_AFTER_FAILURES,
	priorFailures,
	rememberFailure,
	initialTileState,
	lastGoodFrame,
	onFrameFailed,
	onFrameLoaded,
	rememberFrame,
	resetFrameCache,
	staleAfterMs,
	tileStatus,
	versionedFrameUrl
} from './camera-frame';

const T0 = Date.parse('2026-09-28T20:00:05.000Z');

describe('versionedFrameUrl', () => {
	it('buckets by refresh interval so preload and display compute the same URL', () => {
		const a = versionedFrameUrl('https://x/cam.jpg', 10, T0);
		const b = versionedFrameUrl('https://x/cam.jpg', 10, T0 + 4_000);
		expect(a).toBe(b);
		expect(a).toBe(`https://x/cam.jpg?t=${Math.floor(T0 / 10_000) * 10_000}`);
	});
	it('moves to a new bucket after the interval', () => {
		expect(versionedFrameUrl('https://x/cam.jpg', 10, T0)).not.toBe(
			versionedFrameUrl('https://x/cam.jpg', 10, T0 + 10_000)
		);
	});
	it('appends with & when the URL already has a query', () => {
		expect(versionedFrameUrl('https://x/tam.jpg?w=600', 10, T0)).toMatch(/\?w=600&t=\d+$/);
	});
	it('leaves URLs without a refresh interval untouched', () => {
		expect(versionedFrameUrl('https://x/cam.jpg', undefined, T0)).toBe('https://x/cam.jpg');
	});
});

describe('tile state', () => {
	const stale = staleAfterMs(10);

	it('is connecting before any frame and before repeated failures', () => {
		const s = onFrameFailed(initialTileState());
		expect(tileStatus(s, T0, stale)).toBe('connecting');
	});
	it(`is offline only after ${OFFLINE_AFTER_FAILURES} consecutive failures with no frame ever shown`, () => {
		let s = initialTileState();
		for (let i = 0; i < OFFLINE_AFTER_FAILURES; i++) s = onFrameFailed(s);
		expect(tileStatus(s, T0, stale)).toBe('offline');
	});
	it('is live after a frame loads and resets the failure count', () => {
		const s = onFrameLoaded(onFrameFailed(initialTileState()), 'u1', T0);
		expect(s.failures).toBe(0);
		expect(tileStatus(s, T0 + 1_000, stale)).toBe('live');
	});
	it('keeps the last good frame (stale, never offline) when later frames fail', () => {
		let s = onFrameLoaded(initialTileState(), 'u1', T0);
		for (let i = 0; i < 5; i++) s = onFrameFailed(s);
		expect(s.shownUrl).toBe('u1');
		expect(tileStatus(s, T0 + stale + 1, stale)).toBe('stale');
	});
	it('recovers to live when a frame succeeds after being offline', () => {
		let s = initialTileState();
		for (let i = 0; i < 3; i++) s = onFrameFailed(s);
		s = onFrameLoaded(s, 'u2', T0);
		expect(tileStatus(s, T0, stale)).toBe('live');
	});
	it('stale threshold is at least 60s and at least 3 refresh intervals', () => {
		expect(staleAfterMs(10)).toBe(60_000);
		expect(staleAfterMs(60)).toBe(180_000);
		expect(staleAfterMs(undefined)).toBe(60_000);
	});
	it('starts from a remembered last-good frame', () => {
		const s = initialTileState({ url: 'u0', at: T0 });
		expect(s.shownUrl).toBe('u0');
		expect(tileStatus(s, T0 + 1_000, stale)).toBe('live');
	});
});

describe('last-good frame cache', () => {
	beforeEach(() => resetFrameCache());
	it('remembers the most recent decoded frame per camera', () => {
		expect(lastGoodFrame('cam')).toBeNull();
		rememberFrame('cam', 'u1', T0);
		rememberFrame('cam', 'u2', T0 + 10_000);
		expect(lastGoodFrame('cam')).toEqual({ url: 'u2', at: T0 + 10_000 });
	});
	it('ignores an older frame arriving after a newer one', () => {
		rememberFrame('cam', 'u2', T0 + 10_000);
		rememberFrame('cam', 'u1', T0);
		expect(lastGoodFrame('cam')?.url).toBe('u2');
	});
	it('counts consecutive failures per camera across mounts until a frame loads', () => {
		expect(priorFailures('cam')).toBe(0);
		rememberFailure('cam');
		rememberFailure('cam');
		expect(priorFailures('cam')).toBe(2);
		expect(tileStatus(initialTileState(null, priorFailures('cam')), T0, 60_000)).toBe('offline');
		rememberFrame('cam', 'u1', T0);
		expect(priorFailures('cam')).toBe(0);
	});
});
