import { afterEach, describe, expect, it, vi } from 'vitest';
import { holdStill } from './hold-still';

afterEach(() => vi.restoreAllMocks());

describe('holdStill (rule 5: the tapped header stays where it was)', () => {
	it('a header that moved is scrolled back; one that left the page stops the hold (Codex 1c #3)', () => {
		const el = document.body.appendChild(document.createElement('div'));
		let top = 100;
		vi.spyOn(el, 'getBoundingClientRect').mockImplementation(() => ({ top }) as DOMRect);
		const scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(() => {});
		let pin: () => void = () => {};
		vi.stubGlobal(
			'ResizeObserver',
			class {
				constructor(cb: () => void) {
					pin = cb;
				}
				observe() {}
				disconnect() {}
			}
		);
		holdStill(el);
		top = 160;
		pin();
		expect(scrollBy).toHaveBeenCalledWith({ top: 60, behavior: 'instant' });
		el.remove();
		scrollBy.mockClear();
		top = 0;
		pin();
		expect(scrollBy).not.toHaveBeenCalled();
		vi.unstubAllGlobals();
	});
});
