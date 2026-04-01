import { describe, it, expect, beforeEach } from 'vitest';
import {
	saveScrollPosition,
	getScrollPosition,
	resetScrollPosition,
	resetAllScrollPositions
} from './tv-scroll';

describe('tv-scroll store', () => {
	beforeEach(() => {
		resetAllScrollPositions();
	});

	it('returns 0 for unknown screen', () => {
		expect(getScrollPosition('unknown')).toBe(0);
	});

	it('saves and retrieves scroll position', () => {
		saveScrollPosition('news-wire', 150);
		expect(getScrollPosition('news-wire')).toBe(150);
	});

	it('overwrites previous position', () => {
		saveScrollPosition('safety', 100);
		saveScrollPosition('safety', 250);
		expect(getScrollPosition('safety')).toBe(250);
	});

	it('resets individual screen position', () => {
		saveScrollPosition('safety', 100);
		resetScrollPosition('safety');
		expect(getScrollPosition('safety')).toBe(0);
	});

	it('resets all positions', () => {
		saveScrollPosition('safety', 100);
		saveScrollPosition('news-wire', 200);
		resetAllScrollPositions();
		expect(getScrollPosition('safety')).toBe(0);
		expect(getScrollPosition('news-wire')).toBe(0);
	});
});
