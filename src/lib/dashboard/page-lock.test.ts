import { afterEach, describe, expect, it, vi } from 'vitest';
import { overPage } from './page-lock';

afterEach(() => {
	document.body.innerHTML = '';
	document.documentElement.removeAttribute('style');
	document.documentElement.removeAttribute('data-dialog-open');
});

const layer = () => document.createElement('div');

describe('overPage (one owner of the page under modal layers; Codex 1c #1)', () => {
	it('layers closed out of order: the page stays locked and inert until the last one closes', () => {
		const main = document.body.appendChild(document.createElement('main'));
		const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
		const detail = layer();
		const viewer = layer();
		const a = overPage(detail)!;
		const b = overPage(viewer)!;
		expect([main.hasAttribute('inert'), detail.hasAttribute('inert')]).toEqual([true, true]);
		expect(viewer.hasAttribute('inert')).toBe(false);
		a.destroy!(); // the detail under the viewer goes first (a resize across the breakpoint)
		expect(main.hasAttribute('inert')).toBe(true);
		expect(document.documentElement.style.overflow).toBe('hidden');
		expect(scrollTo).not.toHaveBeenCalled();
		b.destroy!();
		expect(main.hasAttribute('inert')).toBe(false);
		expect(document.documentElement.style.overflow).toBe('');
		expect(scrollTo).toHaveBeenCalledTimes(1);
	});

	it('never clears an inert it didn’t set', () => {
		const other = document.body.appendChild(document.createElement('aside'));
		other.setAttribute('inert', '');
		const l = overPage(layer())!;
		l.destroy!();
		expect(other.hasAttribute('inert')).toBe(true);
	});

	it('the topmost layer is the live one; closing it hands the page back to the one beneath', () => {
		const first = layer();
		const second = layer();
		overPage(first);
		const b = overPage(second)!;
		expect(first.hasAttribute('inert')).toBe(true);
		b.destroy!();
		expect(first.hasAttribute('inert')).toBe(false);
	});
});
