// src/lib/components/tv/swipe.test.ts
import { describe, it, expect } from 'vitest';
import { initSwipe, progressSwipe, commitSwipe } from './swipe';

describe('initSwipe', () => {
	it('returns state for a single touch, no bail', () => {
		const state = initSwipe(100, 200, 1, false);
		expect(state).toEqual({ startX: 100, startY: 200, axisLocked: false });
	});

	it('returns null for multi-touch (pinch/zoom)', () => {
		expect(initSwipe(100, 200, 2, false)).toBeNull();
	});

	it('returns null when bail is true (map canvas or scrollable target)', () => {
		expect(initSwipe(100, 200, 1, true)).toBeNull();
	});
});

describe('progressSwipe', () => {
	const base = { startX: 100, startY: 200, axisLocked: false };

	it('does not axis-lock when movement is below the 10px slop threshold', () => {
		const { state, preventDefault } = progressSwipe(108, 201, base);
		expect(state.axisLocked).toBe(false);
		expect(preventDefault).toBe(false);
	});

	it('does not axis-lock when vertical movement exceeds horizontal', () => {
		const { state, preventDefault } = progressSwipe(105, 240, base);
		expect(state.axisLocked).toBe(false);
		expect(preventDefault).toBe(false);
	});

	it('axis-locks when horizontal movement exceeds slop threshold and beats vertical', () => {
		// 15px horizontal, 2px vertical — clearly horizontal
		const { state, preventDefault } = progressSwipe(115, 202, base);
		expect(state.axisLocked).toBe(true);
		expect(preventDefault).toBe(true);
	});

	it('keeps preventDefault true once axis is locked, even for small subsequent movement', () => {
		const locked = { startX: 100, startY: 200, axisLocked: true };
		const { preventDefault } = progressSwipe(102, 200, locked);
		expect(preventDefault).toBe(true);
	});
});

describe('commitSwipe', () => {
	const locked = { startX: 100, startY: 200, axisLocked: true };
	const unlocked = { startX: 100, startY: 200, axisLocked: false };

	it('returns null if swipe was never axis-locked', () => {
		expect(commitSwipe(200, unlocked)).toBeNull();
	});

	it('returns null if displacement is below 50px commit threshold', () => {
		expect(commitSwipe(149, locked)).toBeNull(); // 49px
	});

	it('returns "next" for a left swipe (negative dx >= 50px)', () => {
		expect(commitSwipe(40, locked)).toBe('next'); // -60px
	});

	it('returns "prev" for a right swipe (positive dx >= 50px)', () => {
		expect(commitSwipe(160, locked)).toBe('prev'); // +60px
	});

	it('returns null for exactly 49px left', () => {
		expect(commitSwipe(51, locked)).toBeNull();
	});

	it('returns "next" for exactly 50px left', () => {
		expect(commitSwipe(50, locked)).toBe('next');
	});
});
