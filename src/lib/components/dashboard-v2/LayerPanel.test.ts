import { render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import LayerPanel from './LayerPanel.svelte';

const row = (id: string, name: string) => ({
	id,
	name,
	swatch: '#fff',
	on: true,
	count: null,
	status: `${name} · loading…`
});
const props = (over: Record<string, unknown> = {}) => ({
	stories: { rows: [row('news', 'News')], count: null, status: 'News snapshot · loading…' },
	layers: [row('traffic', 'Traffic')],
	ontoggle: vi.fn(),
	...over
});

describe('LayerPanel', () => {
	it('on the map, the checklist sits behind its Layers button', () => {
		render(LayerPanel, props());
		expect(screen.getByRole('button', { name: 'Layers' }).getAttribute('aria-expanded')).toBe(
			'false'
		);
		expect(screen.queryByRole('group', { name: 'Map layers' })).toBeNull();
	});

	it('as a rail (/map on desktop), always open, with no button to close it', () => {
		render(LayerPanel, props({ rail: true }));
		expect(screen.queryByRole('button', { name: 'Layers' })).toBeNull();
		expect(screen.getByRole('group', { name: 'Map layers' })).toBeTruthy();
		expect(screen.getByText('Traffic')).toBeTruthy();
	});
});
