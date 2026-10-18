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
