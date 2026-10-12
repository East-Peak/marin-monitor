import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import MapInspector from './MapInspector.svelte';
import type { NewsItem } from '$lib/types';

const item: NewsItem = {
	id: 'q1',
	title: 'M3.1 near Novato',
	link: 'https://e.example/q1',
	timestamp: 0,
	source: 'USGS',
	category: 'safety',
	verification: 'official',
	townSlug: 'novato'
};

describe('MapInspector noteFor', () => {
	it('legacy (no noteFor): no note line', () => {
		const { container } = render(MapInspector, {
			props: { mode: 'pin', items: [item], selectedItemId: 'q1' }
		});
		expect(container.querySelector('[data-inspector-note]')).toBeNull();
	});
	it('an owner’s note is shown under the item, with its own time', () => {
		render(MapInspector, {
			props: {
				mode: 'pin',
				items: [item],
				selectedItemId: 'q1',
				noteFor: () => 'Kept from 7:40 AM · refresh failed'
			}
		});
		expect(screen.getByText('Kept from 7:40 AM · refresh failed')).toBeTruthy();
	});
});
