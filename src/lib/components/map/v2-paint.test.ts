import { describe, expect, it, vi } from 'vitest';
import { LAYER_COLORS } from '$lib/config/map';
import { applyV2Paint, V2_TOWN_FILL } from './v2-paint';

function fakeMap(layers: string[]) {
	const have = new Set(layers);
	return {
		getLayer: (id: string) => (have.has(id) ? {} : undefined),
		getPaintProperty: (layer: string, prop: string) => `orig ${layer} ${prop}`,
		setPaintProperty: vi.fn(),
		addLayer: vi.fn((l: { id: string }) => have.add(l.id)),
		removeLayer: vi.fn((id: string) => have.delete(id))
	};
}

describe('V2_TOWN_FILL', () => {
	it('every story colour gets a brighter fill, so circles read against the dark basemap', () => {
		for (const id of ['news', 'civic', 'safety', 'housing', 'activity', 'satire'] as const) {
			const fill = V2_TOWN_FILL[LAYER_COLORS[id]];
			expect(fill, id).toBeDefined();
			const lum = (hex: string) =>
				[1, 3, 5].reduce((s, i) => s + parseInt(hex.slice(i, i + 2), 16), 0);
			expect(lum(fill), id).toBeGreaterThan(lum(LAYER_COLORS[id]));
		}
	});
});

describe('applyV2Paint', () => {
	it('repaints towns and 311 and adds the town count label, once', () => {
		const map = fakeMap(['towns-layer', '311-reports-layer']);
		applyV2Paint(map as never);
		applyV2Paint(map as never);
		const props = map.setPaintProperty.mock.calls.map(([layer, prop]) => `${layer} ${prop}`);
		expect(props).toContain('towns-layer circle-color');
		expect(props).toContain('towns-layer circle-stroke-width');
		expect(props).toContain('311-reports-layer circle-radius');
		expect(props).toContain('311-reports-layer circle-opacity');
		expect(map.addLayer).toHaveBeenCalledTimes(1);
		expect(map.addLayer.mock.calls[0][0]).toMatchObject({ id: 'v2-towns-count', source: 'towns' });
	});
	it('311 dots are radius 4 at zoom ≤ 11 and grow with zoom; kept dots stay dimmed', () => {
		const map = fakeMap(['towns-layer', '311-reports-layer']);
		applyV2Paint(map as never);
		const get = (prop: string) =>
			map.setPaintProperty.mock.calls.find(
				([l, p]) => l === '311-reports-layer' && p === prop
			)?.[2];
		expect(get('circle-radius')).toEqual([
			'interpolate',
			['linear'],
			['zoom'],
			11,
			4,
			14,
			6.5,
			17,
			9
		]);
		expect(get('circle-opacity')).toEqual(['case', ['==', ['get', 'retained'], true], 0.4, 0.75]);
	});
	it('the returned restore puts the shared style back (leaving desktop: phone stays as it was)', () => {
		const map = fakeMap(['towns-layer', '311-reports-layer']);
		const restore = applyV2Paint(map as never);
		map.setPaintProperty.mockClear();
		restore();
		expect(map.setPaintProperty).toHaveBeenCalledWith(
			'311-reports-layer',
			'circle-radius',
			'orig 311-reports-layer circle-radius'
		);
		expect(map.removeLayer).toHaveBeenCalledWith('v2-towns-count');
	});

	it('before the layers exist it does nothing (a style swap re-runs it)', () => {
		const map = fakeMap([]);
		applyV2Paint(map as never);
		expect(map.setPaintProperty).not.toHaveBeenCalled();
		expect(map.addLayer).not.toHaveBeenCalled();
	});
});
