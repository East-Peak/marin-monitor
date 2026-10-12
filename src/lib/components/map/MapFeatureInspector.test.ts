import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import MapFeatureInspector from './MapFeatureInspector.svelte';

const base = { kind: '311-report' as const, title: 'Pothole', source: 'Fix It Marin' };
describe('MapFeatureInspector note', () => {
	it('legacy (no note): no note line', () => {
		const { container } = render(MapFeatureInspector, { props: { feature: base } });
		expect(container.querySelector('[data-inspector-note]')).toBeNull();
	});
	it('an owner’s note is shown with its own time', () => {
		render(MapFeatureInspector, {
			props: {
				feature: { ...base, itemId: 'seeclickfix-901', note: 'Kept from 7:40 AM · HTTP 503' }
			}
		});
		expect(screen.getByText('Kept from 7:40 AM · HTTP 503')).toBeTruthy();
	});
});
