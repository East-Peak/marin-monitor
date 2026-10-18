import { expression, featureFilter } from '@maplibre/maplibre-gl-style-spec';
import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/config/api', () => ({ MAPBOX_TOKEN: 'test-token' }));
const { setupSources } = await import('./map-layers');

/**
 * TRAFFIC1: road speeds draw free-flowing roads too, as a quiet line under the slowdowns, so an
 * empty Sunday map reads as "roads covered, nothing slow" rather than "nothing loaded".
 */
type Layer = {
	id: string;
	filter?: unknown;
	layout?: Record<string, unknown>;
	paint?: Record<string, unknown>;
};

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
	return layers;
}

const layers = registered();
const roads = layers.find((l) => l.id === 'traffic-congestion-layer')!;
const wedges = layers.find((l) => l.id === 'camera-wedges-line')!;
const segment = (congestion: string, closed?: unknown) =>
	({ type: 'LineString', properties: { congestion, ...(closed ? { closed } : {}) } }) as never;

function value(layer: Layer, group: 'paint' | 'layout', prop: string, f: never, zoom = 11) {
	const parsed = expression.createExpression(layer[group]?.[prop]);
	if (parsed.result !== 'success') throw new Error(`${layer.id} ${prop}: does not parse`);
	return parsed.value.evaluate({ zoom }, f, {}) as number | string;
}
const drawn = (f: never) => featureFilter(roads.filter as never).filter({ zoom: 11 }, f);

describe('road speeds paint (TRAFFIC1)', () => {
	it('free-flowing (low) segments are drawn, as are the slowdowns and closures', () => {
		for (const c of ['low', 'moderate', 'heavy', 'severe']) expect(drawn(segment(c)), c).toBe(true);
		expect(drawn(segment('unknown', true))).toBe(true);
		expect(drawn(segment('unknown'))).toBe(false);
	});

	it('the key colours: green-grey free flow, amber moderate, orange heavy, red severe, dark red closed', () => {
		const colour = (f: never) => String(value(roads, 'paint', 'line-color', f));
		expect(
			['low', 'moderate', 'heavy', 'severe']
				.map((c) => colour(segment(c)))
				.concat(colour(segment('low', 'yes')))
		).toEqual(['#9fbfa5', '#f59e0b', '#f97316', '#dc2626', '#7f1d1d']);
	});

	it('free flow is quieter than a camera wedge at rest: fainter and thinner, at every zoom', () => {
		const rest = (prop: string, z: number) => Number(value(wedges, 'paint', prop, {} as never, z));
		for (const z of [9, 11, 13]) {
			const low = (prop: string) => Number(value(roads, 'paint', prop, segment('low'), z));
			expect(low('line-opacity'), `opacity z${z}`).toBeLessThan(rest('line-opacity', z));
			expect(low('line-width'), `width z${z}`).toBeLessThan(rest('line-width', z));
			expect(low('line-opacity'), `opacity z${z}`).toBeGreaterThan(0);
		}
	});

	it('a closed road is drawn as a closure even when its congestion reads low (Codex #6)', () => {
		const closedLow = segment('low', 'yes');
		for (const z of [9, 14]) {
			const width = (f: never) => Number(value(roads, 'paint', 'line-width', f, z));
			expect(width(closedLow), `z${z}`).toBe(width(segment('severe')));
		}
		expect(value(roads, 'paint', 'line-opacity', closedLow)).toBe(0.78);
	});

	it('slowdowns draw over free flow, and keep their own strength', () => {
		const key = (c: string) => Number(value(roads, 'layout', 'line-sort-key', segment(c)));
		expect(key('low')).toBeLessThan(key('moderate'));
		expect(key('moderate')).toBeLessThan(key('severe'));
		const opacity = (c: string) => Number(value(roads, 'paint', 'line-opacity', segment(c)));
		expect([opacity('moderate'), opacity('heavy')]).toEqual([0.46, 0.78]);
	});
});
