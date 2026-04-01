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

	it('returns null for unknown screen', () => {
		expect(getScrollPosition('unknown')).toBeNull();
	});

	it('saves and retrieves scroll position with content height', () => {
		saveScrollPosition('news-wire', 150, 800);
		const saved = getScrollPosition('news-wire');
		expect(saved).toEqual({ scrollTop: 150, contentHeight: 800 });
	});

	it('overwrites previous position', () => {
		saveScrollPosition('safety', 100, 600);
		saveScrollPosition('safety', 250, 900);
		const saved = getScrollPosition('safety');
		expect(saved).toEqual({ scrollTop: 250, contentHeight: 900 });
	});

	it('resets individual screen position', () => {
		saveScrollPosition('safety', 100, 600);
		resetScrollPosition('safety');
		expect(getScrollPosition('safety')).toBeNull();
	});

	it('resets all positions', () => {
		saveScrollPosition('safety', 100, 600);
		saveScrollPosition('news-wire', 200, 1000);
		resetAllScrollPositions();
		expect(getScrollPosition('safety')).toBeNull();
		expect(getScrollPosition('news-wire')).toBeNull();
	});
});
