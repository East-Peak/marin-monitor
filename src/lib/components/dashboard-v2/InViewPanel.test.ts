import { fireEvent, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import type { InViewItem } from '$lib/dashboard/map-in-view';
import InViewPanel from './InViewPanel.svelte';

const item = (id: string, layer: InViewItem['layer'] = 'news'): InViewItem => ({
	id,
	layer,
	title: `Title ${id}`,
	at: 1,
	lon: -122.5,
	lat: 37.9,
	detail: { title: `Title ${id}`, meta: ['Src'], paragraphs: ['Body'], source: null }
});
const props = (over: Record<string, unknown> = {}) => ({
	items: [item('news:a'), item('311:b', '311')],
	selected: null,
	hovered: null,
	collapsed: false,
	emptyText: null,
	ontoggle: vi.fn(),
	onselect: vi.fn(),
	onhover: vi.fn(),
	onback: vi.fn(),
	...over
});

describe('InViewPanel', () => {
	it('lists one group per layer; a row click selects its namespaced id', async () => {
		const p = props();
		render(InViewPanel, p);
		expect(screen.getByText('Stories')).toBeTruthy();
		expect(screen.getByText('Fix It Marin (311)')).toBeTruthy();
		await fireEvent.click(screen.getByText('Title 311:b'));
		expect(p.onselect).toHaveBeenCalledWith('311:b');
	});

	it("a layer's window is said once (MAPFRESH1)", () => {
		render(
			InViewPanel,
			props({
				items: [item('news:a'), item('news:c'), item('311:b', '311')],
				windows: { news: 'Stories from the last 7 days' }
			})
		);
		expect(screen.getAllByText('Stories from the last 7 days')).toHaveLength(1);
	});

	it('the window is said even when no story is listed (Codex MAPFRESH1 #5)', () => {
		render(
			InViewPanel,
			props({ items: [item('311:b', '311')], windows: { news: 'Stories from the last 7 days' } })
		);
		expect(screen.getAllByText('Stories from the last 7 days')).toHaveLength(1);
	});

	it("a row click ends the row's hover: the row leaves without a mouseleave (Codex CAMQUIET1 #1)", async () => {
		const p = props({ items: [item('cams:alert-vision', 'cams')] });
		render(InViewPanel, p);
		const row = screen.getByText('Title cams:alert-vision');
		await fireEvent.mouseEnter(row.closest('button')!);
		expect(p.onhover).toHaveBeenLastCalledWith('cams:alert-vision');
		await fireEvent.click(row);
		expect(p.onhover).toHaveBeenLastCalledWith(null);
		expect(p.onselect).toHaveBeenCalledWith('cams:alert-vision');
	});

	it('Esc goes back from a detail to the list, wherever focus is', async () => {
		const p = props({ selected: item('news:a') });
		render(InViewPanel, p);
		await fireEvent.keyDown(document.body, { key: 'Escape' });
		expect(p.onback).toHaveBeenCalledOnce();
	});

	it('an Esc a modal dialog already handled is not taken again', async () => {
		const p = props({ selected: item('news:a') });
		render(InViewPanel, p);
		const e = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
		e.preventDefault();
		document.body.dispatchEvent(e);
		expect(p.onback).not.toHaveBeenCalled();
	});

	it('keyboard: a row click moves focus to the detail heading; Back returns it to that row', async () => {
		const p = props();
		const { rerender } = render(InViewPanel, p);
		const row = screen.getByText('Title 311:b').closest('button')!;
		row.focus();
		await fireEvent.click(row);
		await rerender({ ...p, selected: item('311:b', '311') });
		await tick();
		await tick();
		expect(document.activeElement?.id).toBe('v2-in-view-detail-title');
		const backButton = screen.getByRole('button', { name: '← Back to list' });
		backButton.focus(); // a keyboard press on Back, as Enter would leave it
		await fireEvent.click(backButton);
		await rerender({ ...p, selected: null });
		await tick();
		await tick();
		expect((document.activeElement as HTMLElement)?.dataset.inViewRow).toBe('311:b');
	});

	describe('one Tab stop, arrow keys inside', () => {
		const many = () => [
			item('news:a'),
			item('news:b'),
			item('311:c', '311'),
			item('311:d', '311'),
			item('quake:e', 'quake')
		];
		const rows = (container: HTMLElement) => [
			...container.querySelectorAll<HTMLElement>('[data-in-view-row]')
		];
		const stops = (container: HTMLElement) =>
			rows(container)
				.filter((r) => r.tabIndex === 0)
				.map((r) => r.dataset.inViewRow);

		it('the rows are one composite control, named', () => {
			const { container } = render(InViewPanel, props({ items: many() }));
			const bar = container.querySelector('[role="toolbar"]')!;
			expect(bar.getAttribute('aria-label')).toBe('In view items');
			expect(bar.querySelectorAll('[data-in-view-row]')).toHaveLength(5);
		});

		it('only one row is in the Tab order, the first until another takes focus', () => {
			const { container } = render(InViewPanel, props({ items: many() }));
			expect(stops(container)).toEqual(['news:a']);
		});

		it('ArrowDown and ArrowUp move focus row to row, across layers, and stop at the ends', async () => {
			const { container } = render(InViewPanel, props({ items: many() }));
			const r = rows(container);
			r[0].focus();
			await fireEvent.keyDown(r[0], { key: 'ArrowUp' });
			expect(document.activeElement).toBe(r[0]);
			for (const next of [1, 2, 3, 4]) {
				await fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
				expect(document.activeElement).toBe(r[next]);
			}
			await fireEvent.keyDown(r[4], { key: 'ArrowDown' });
			expect(document.activeElement).toBe(r[4]);
			await fireEvent.keyDown(r[4], { key: 'ArrowUp' });
			expect(document.activeElement).toBe(r[3]);
		});

		it('Home and End go to the first and last row', async () => {
			const { container } = render(InViewPanel, props({ items: many() }));
			const r = rows(container);
			r[2].focus();
			await fireEvent.keyDown(r[2], { key: 'End' });
			expect(document.activeElement).toBe(r[4]);
			await fireEvent.keyDown(r[4], { key: 'Home' });
			expect(document.activeElement).toBe(r[0]);
		});

		it('the focused row is the one Tab stop, so Tab leaves the list from where the reader is', async () => {
			const { container } = render(InViewPanel, props({ items: many() }));
			const r = rows(container);
			r[3].focus();
			await tick();
			expect(stops(container)).toEqual(['311:d']);
		});

		it('when the list changes under the Tab stop, the first row takes it', async () => {
			const p = props({ items: many() });
			const { container, rerender } = render(InViewPanel, p);
			rows(container)[3].focus();
			await tick();
			await rerender({ ...p, items: [item('news:a'), item('news:b')] });
			expect(stops(container)).toEqual(['news:a']);
		});

		it('other keys are left alone', async () => {
			const { container } = render(InViewPanel, props({ items: many() }));
			const r = rows(container);
			r[0].focus();
			const e = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
			r[0].dispatchEvent(e);
			expect(e.defaultPrevented).toBe(false);
		});
	});

	it('names the enabled layers it cannot vouch for beside the list (Codex MAPX2 #5)', () => {
		render(InViewPanel, props({ gaps: ['Traffic', 'Fire'] }));
		expect(screen.getByText('Not shown, or not current: Traffic, Fire')).toBeTruthy();
	});

	it('with nothing in view and no coverage to vouch, it never claims "nothing here"', () => {
		render(InViewPanel, props({ items: [] }));
		expect(screen.getByText('Nothing listed in this view.')).toBeTruthy();
	});

	it("says why a linked item can't be shown, above the list (MAPX3)", () => {
		render(InViewPanel, props({ notice: 'Fix It Marin is unavailable right now' }));
		expect(screen.getByRole('status').textContent).toContain(
			'Fix It Marin is unavailable right now'
		);
		expect(screen.getByText('Title news:a')).toBeTruthy();
	});

	describe("as /map's phone sheet (MAPX3)", () => {
		it('peek shows the count on its handle and no rows; half lists them', async () => {
			const onsheet = vi.fn();
			const { rerender } = render(InViewPanel, props({ sheet: 'peek', onsheet }));
			expect(screen.getByRole('button', { name: /In view · 2/ })).toBeTruthy();
			expect(screen.queryByText('Title news:a')).toBeNull();
			await rerender(props({ sheet: 'half', onsheet }));
			expect(screen.getByText('Title news:a')).toBeTruthy();
		});

		it('a selection opens a modal dialog with its detail; Close goes back to the list', async () => {
			const p = props({ sheet: 'half', onsheet: vi.fn(), selected: item('311:b', '311') });
			render(InViewPanel, p);
			const dialog = screen.getByRole('dialog');
			expect(dialog.getAttribute('aria-modal')).toBe('true');
			expect(dialog.textContent).toContain('Title 311:b');
			await fireEvent.click(screen.getByRole('button', { name: 'Close' }));
			expect(p.onback).toHaveBeenCalled();
		});
	});
});
