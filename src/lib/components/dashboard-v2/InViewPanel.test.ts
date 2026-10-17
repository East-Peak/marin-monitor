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
});
