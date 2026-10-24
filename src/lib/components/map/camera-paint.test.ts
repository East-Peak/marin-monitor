import { expression } from '@maplibre/maplibre-gl-style-spec';
import { describe, expect, it } from 'vitest';
import { setupSources } from './map-layers';

/**
 * CAMQUIET1: the camera wedges whisper at rest and show full strength while their camera is
 * emphasised (hovered anywhere or selected), and sit under every layer's dots.
 */
type Layer = { id: string; type: string; source?: string; paint?: Record<string, unknown> };

function registered() {
	const layers: Layer[] = [];
	const sources = new Map<string, Record<string, unknown>>();
	const map = {
		getSource: (id: string) => sources.get(id),
		addSource: (id: string, s: Record<string, unknown>) => sources.set(id, s),
		addLayer: (l: Layer) => layers.push(l),
		getCanvas: () => ({ style: {} })
	};
	setupSources(map as never);
	return { layers, sources };
}

/** A paint value for a wedge of `style`, with or without its camera emphasised. */
function paint(layer: Layer, prop: string, style: string, emphasis: boolean) {
	const value = layer.paint?.[prop];
	const parsed = expression.createExpression(value);
	if (parsed.result !== 'success') throw new Error(`${layer.id} ${prop}: does not parse`);
	return parsed.value.evaluate(
		{ zoom: 11 },
		{ type: 'Polygon', properties: { style } } as never,
		emphasis ? { emphasis: true } : {}
	);
}

const { layers, sources } = registered();
const layer = (id: string) => layers.find((l) => l.id === id)!;

describe('camera wedges paint (CAMQUIET1; visible at rest, MAPFRESH1)', () => {
	it('fill: seen at rest (solid 0.12, sweeping and approximate 0.08), 0.30 when emphasised', () => {
		const fill = layer('camera-wedges-fill');
		expect(paint(fill, 'fill-opacity', 'solid', false)).toBe(0.12);
		expect(paint(fill, 'fill-opacity', 'sweeping', false)).toBe(0.08);
		expect(paint(fill, 'fill-opacity', 'approximate', false)).toBe(0.08);
		for (const style of ['solid', 'sweeping', 'approximate'])
			expect(paint(fill, 'fill-opacity', style, true), style).toBe(0.3);
	});

	it('outlines: 0.5 × 1 px at rest, 0.9 × 1.5 px when emphasised, dashes kept', () => {
		for (const [id, style] of [
			['camera-wedges-line', 'solid'],
			['camera-wedges-sweeping', 'sweeping'],
			['camera-wedges-approximate', 'approximate']
		]) {
			const l = layer(id);
			expect(paint(l, 'line-opacity', style, false), id).toBe(0.5);
			expect(paint(l, 'line-width', style, false), id).toBe(1);
			expect(paint(l, 'line-opacity', style, true), id).toBe(0.9);
			expect(paint(l, 'line-width', style, true), id).toBe(1.5);
		}
		expect(layer('camera-wedges-line').paint?.['line-dasharray']).toBeUndefined();
		expect(layer('camera-wedges-sweeping').paint?.['line-dasharray']).toEqual([2, 2]);
		expect(layer('camera-wedges-approximate').paint?.['line-dasharray']).toEqual([0.5, 1.5]);
	});

	it("pin and wedge share one key: each source's features are addressed by the camera id", () => {
		expect(sources.get('cameras')).toMatchObject({ promoteId: 'itemId' });
		expect(sources.get('camera-wedges')).toMatchObject({ promoteId: 'itemId' });
	});

	it("wedges sit under every data layer's dots and over the town boundaries", () => {
		const at = (id: string) => layers.findIndex((l) => l.id === id);
		const wedges = layers.filter((l) => l.source === 'camera-wedges').map((l) => at(l.id));
		const dots = layers.filter((l) => l.type === 'circle' || l.type === 'symbol').map((l) => l.id);
		expect(dots).toEqual(
			expect.arrayContaining([
				'traffic-events-layer',
				'311-reports-layer',
				'news-pins-layer',
				'gas-stations-layer',
				'coffee-shops-layer',
				'fitness-studios-layer',
				'airports-layer'
			])
		);
		for (const dot of dots) expect(Math.max(...wedges), dot).toBeLessThan(at(dot));
		expect(Math.min(...wedges)).toBeGreaterThan(at('town-boundary-stroke'));
		expect(Math.max(...wedges)).toBeLessThan(at('fire-zones-layer'));
	});
});
