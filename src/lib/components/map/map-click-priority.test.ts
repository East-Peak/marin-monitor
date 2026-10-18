import { beforeAll, describe, expect, it } from 'vitest';
import type { Map as MapLibreMap } from 'maplibre-gl';

// maplibre-gl's bundle creates its worker URL at import time; jsdom lacks createObjectURL.
beforeAll(() => {
	if (!URL.createObjectURL) URL.createObjectURL = () => 'blob:stub';
	if (!window.URL.createObjectURL) window.URL.createObjectURL = () => 'blob:stub';
});

type Hits = Record<string, { properties: Record<string, unknown> }[]>;

/** A map whose click dispatch is MapLibre's own; only rendering is scripted. */
async function delegatingMap(hits: Hits): Promise<MapLibreMap & { click(): void }> {
	const maplibregl = (await import('maplibre-gl')).default;
	const map = Object.create(maplibregl.Map.prototype);
	map.getLayer = (id: string) => (id in hits ? { id } : undefined);
	map.getLayoutProperty = () => 'visible';
	map.queryRenderedFeatures = (_p: unknown, opts: { layers: string[] }) =>
		opts.layers.flatMap((layer) => hits[layer] ?? []);
	map.click = () => map.fire({ type: 'click', point: { x: 10, y: 10 }, originalEvent: {} });
	return map;
}

async function wire(hits: Hits) {
	const { bindLayerGroupClick, bindTownSelectionClick } = await import('./map-interactions');
	const map = await delegatingMap(hits);
	const calls: string[] = [];
	bindTownSelectionClick(map, (slug) => calls.push(`town:${slug}`));
	bindLayerGroupClick(map, ['news-pins-layer'], (e) =>
		calls.push(`pin:${e.features?.[0]?.properties?.id}`)
	);
	return { map, calls };
}

const TOWN = { 'towns-layer': [{ properties: { slug: 'novato' } }] };
const PIN = { 'news-pins-layer': [{ properties: { id: 'n1' } }] };

describe('map click priority (real MapLibre delegation)', () => {
	it('a pin over a town inspects the pin and never selects the town', async () => {
		const { map, calls } = await wire({ ...TOWN, ...PIN });
		map.click();
		expect(calls).toEqual(['pin:n1']);
	});
	it('any inspection target (e.g. a gas station) beats town selection', async () => {
		const { map, calls } = await wire({
			...TOWN,
			'gas-stations-layer': [{ properties: { id: 'g1' } }]
		});
		map.click();
		expect(calls).toEqual([]);
	});
	it('a fire zone over a town inspects the zone and never selects the town (Codex PR3 #1)', async () => {
		const { map, calls } = await wire({
			...TOWN,
			'fire-zones-layer': [{ properties: { id: 'fz1' } }]
		});
		map.click();
		expect(calls).toEqual([]);
	});
	it('a bare town click still selects the town', async () => {
		const { map, calls } = await wire(TOWN);
		map.click();
		expect(calls).toEqual(['town:novato']);
	});
	it('a hidden inspection layer does not block town selection', async () => {
		const { map, calls } = await wire({ ...TOWN, ...PIN });
		(map as unknown as { getLayoutProperty: (id: string) => string }).getLayoutProperty = (id) =>
			id === 'news-pins-layer' ? 'none' : 'visible';
		map.click();
		expect(calls).toEqual(['town:novato', 'pin:n1']); // the pin handler is MapLibre's; the town is no longer blocked
	});
});

describe('camera wedges are the lowest click priority (MAPX4)', () => {
	async function wireCams(hits: Hits) {
		const { bindCameraClick, bindLayerGroupClick, bindTownSelectionClick } =
			await import('./map-interactions');
		const map = await delegatingMap(hits);
		const calls: string[] = [];
		bindTownSelectionClick(map, (slug) => calls.push(`town:${slug}`));
		bindLayerGroupClick(map, ['gas-stations-layer'], (e) =>
			calls.push(`gas:${e.features?.[0]?.properties?.id}`)
		);
		bindCameraClick(map, (id) => calls.push(`cam:${id}`));
		return { map, calls };
	}
	const WEDGE = { 'camera-wedges-fill': [{ properties: { itemId: 'alert-tam-east' } }] };

	it('a bare wedge opens its camera', async () => {
		const { map, calls } = await wireCams(WEDGE);
		map.click();
		expect(calls).toEqual(['cam:alert-tam-east']);
	});
	it('a station under a wedge is the station, not the camera', async () => {
		const { map, calls } = await wireCams({
			...WEDGE,
			'gas-stations-layer': [{ properties: { id: 'g1' } }]
		});
		map.click();
		expect(calls).toEqual(['gas:g1']);
	});
	it('a town circle under a wedge still selects the town', async () => {
		const { map, calls } = await wireCams({ ...WEDGE, ...TOWN });
		map.click();
		expect(calls).toEqual(['town:novato']);
	});
	it("a camera's own pin opens it, whatever wedge it sits in", async () => {
		const { map, calls } = await wireCams({
			...WEDGE,
			'cameras-layer': [{ properties: { itemId: 'alert-tam-west' } }]
		});
		map.click();
		expect(calls).toEqual(['cam:alert-tam-west']);
	});
});

describe('a click on empty map (CAMDESEL1)', () => {
	async function wireEmpty(hits: Hits) {
		const { bindEmptyClick } = await import('./map-interactions');
		const map = await delegatingMap(hits);
		const calls: string[] = [];
		bindEmptyClick(map, () => calls.push('empty'));
		return { map, calls };
	}

	it('a click on the basemap alone (land, water) is empty', async () => {
		const { map, calls } = await wireEmpty({ water: [{ properties: {} }] });
		map.click();
		expect(calls).toEqual(['empty']);
	});
	it.each([
		['a camera pin', 'cameras-layer'],
		['a wedge', 'camera-wedges-fill'],
		['a data layer', 'gas-stations-layer'],
		['a news pin', 'news-pins-layer'],
		['a town dot', 'towns-layer'],
		['a Strava segment', 'strava-pins']
	])('%s under the click is not empty', async (_name, layer) => {
		const { map, calls } = await wireEmpty({ [layer]: [{ properties: { itemId: 'x' } }] });
		map.click();
		expect(calls).toEqual([]);
	});
	it('a hidden layer under the click does not count', async () => {
		const { map, calls } = await wireEmpty({ 'gas-stations-layer': [{ properties: {} }] });
		(map as unknown as { getLayoutProperty: () => string }).getLayoutProperty = () => 'none';
		map.click();
		expect(calls).toEqual(['empty']);
	});
});
