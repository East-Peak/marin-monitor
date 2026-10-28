import { render } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DetailDialog from './DetailDialog.svelte';

const content = createRawSnippet(() => ({
	render: () => '<div><h2 id="t">Title</h2><a href="https://example.test/">Link</a></div>'
}));

afterEach(() => {
	document.body.innerHTML = '';
	document.documentElement.removeAttribute('style');
	document.documentElement.removeAttribute('data-dialog-open');
});

function page() {
	const main = document.createElement('main');
	const opener = document.createElement('button');
	opener.textContent = 'Open';
	main.append(opener);
	document.body.append(main);
	opener.focus();
	return { main, opener };
}

describe('DetailDialog (rule 6: a dialog that never moves the page)', () => {
	it('sits over the page: the rest inert, the root locked, the gutter kept; all undone on close', () => {
		const { main, opener } = page();
		const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
		Object.defineProperty(window, 'scrollY', { value: 300, configurable: true });
		const { unmount } = render(DetailDialog, {
			target: main,
			props: { labelledby: 't', onclose: () => {}, children: content }
		});
		const dialog = document.querySelector('[role="dialog"]')!;
		expect(dialog.closest('main')).toBeNull(); // portalled out of the page it covers
		expect(main.hasAttribute('inert')).toBe(true);
		expect(document.documentElement.style.overflow).toBe('hidden');
		expect(document.documentElement.hasAttribute('data-dialog-open')).toBe(true);

		const focus = vi.spyOn(opener, 'focus');
		unmount();
		expect(main.hasAttribute('inert')).toBe(false);
		expect(document.documentElement.style.overflow).toBe('');
		expect(scrollTo).toHaveBeenCalledWith({ top: 300, behavior: 'instant' });
		return Promise.resolve().then(() =>
			expect(focus).toHaveBeenCalledWith({ preventScroll: true })
		);
	});

	it('a dialog opened from a dialog nests: the inner one closes back to the outer, still locked', () => {
		const { main } = page();
		const outer = render(DetailDialog, {
			target: main,
			props: { labelledby: 't', onclose: () => {}, children: content }
		});
		const outerPanel = document.querySelector('[role="dialog"]')!;
		const inner = render(DetailDialog, {
			target: outerPanel as HTMLElement,
			props: { labelledby: 't', onclose: () => {}, children: content }
		});
		const outerLayer = outerPanel.closest('[data-dialog-layer]')!;
		expect(outerLayer.hasAttribute('inert')).toBe(true);
		inner.unmount();
		expect(outerLayer.hasAttribute('inert')).toBe(false);
		expect(main.hasAttribute('inert')).toBe(true);
		expect(document.documentElement.style.overflow).toBe('hidden');
		outer.unmount();
		expect(main.hasAttribute('inert')).toBe(false);
		expect(document.documentElement.style.overflow).toBe('');
	});

	it('"auto" is left to a media query: a sheet on the phone, a side panel above it (Codex 1c #4)', () => {
		const { main } = page();
		render(DetailDialog, {
			target: main,
			props: { labelledby: 't', variant: 'auto', onclose: () => {}, children: content }
		});
		// No window read at render: the layout follows a rotation and needs nothing on the server.
		expect(document.querySelector('[role="dialog"]')!.getAttribute('data-variant')).toBe('auto');
	});
});
