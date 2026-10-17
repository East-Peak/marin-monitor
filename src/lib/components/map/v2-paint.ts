/**
 * The v2 map's own paint (MAPX2b rebalance). The layer styles are shared with legacy and /tv,
 * which stay as they are, so v2 repaints after setup. Town circles were their category colour
 * (dark on the dark basemap) and 311 dots solid at street level, so 311 drowned the news; v2
 * gives towns a brighter fill, a light stroke and a count, and makes 311 dots small and lighter.
 * Dimmed (other-town) and kept (retained) semantics are unchanged.
 */
import type { Map as MapLibreMap } from 'maplibre-gl';
import { LAYER_COLORS } from '$lib/config/map';

/** Each story colour's brighter fill (the Tailwind 300 of the same hue). */
export const V2_TOWN_FILL: Readonly<Record<string, string>> = {
	[LAYER_COLORS.civic]: '#93c5fd',
	[LAYER_COLORS.news]: '#c4b5fd',
	[LAYER_COLORS.safety]: '#fca5a5',
	[LAYER_COLORS.housing]: '#fcd34d',
	[LAYER_COLORS.activity]: '#6ee7b7',
	[LAYER_COLORS.satire]: '#f9a8d4'
};

const hasStories = ['>', ['coalesce', ['get', 'total'], 0], 0];

type PaintTarget = Pick<
	MapLibreMap,
	'getLayer' | 'getPaintProperty' | 'setPaintProperty' | 'addLayer' | 'removeLayer'
>;
const REPAINTED = [
	['towns-layer', 'circle-color'],
	['towns-layer', 'circle-stroke-width'],
	['towns-layer', 'circle-stroke-color'],
	['311-reports-layer', 'circle-radius'],
	['311-reports-layer', 'circle-opacity']
] as const;

/** Repaint for v2; the returned function restores the shared style (the map left desktop). */
export function applyV2Paint(map: PaintTarget): () => void {
	if (!map.getLayer('towns-layer') || !map.getLayer('311-reports-layer')) return () => {};
	const original = REPAINTED.map(([l, p]) => [l, p, map.getPaintProperty(l, p)] as const);
	const restore = () => {
		for (const [l, p, v] of original) if (map.getLayer(l)) map.setPaintProperty(l, p, v);
		if (map.getLayer('v2-towns-count')) map.removeLayer('v2-towns-count');
	};
	map.setPaintProperty('towns-layer', 'circle-color', [
		'match',
		['get', 'color'],
		...Object.entries(V2_TOWN_FILL).flat(),
		['coalesce', ['get', 'color'], '#8b5cf6']
	]);
	map.setPaintProperty('towns-layer', 'circle-stroke-width', ['case', hasStories, 1.5, 1]);
	map.setPaintProperty('towns-layer', 'circle-stroke-color', [
		'case',
		hasStories,
		'rgba(255, 255, 255, 0.92)',
		'rgba(255, 255, 255, 0.5)'
	]);
	map.setPaintProperty('311-reports-layer', 'circle-radius', [
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
	map.setPaintProperty('311-reports-layer', 'circle-opacity', [
		'case',
		['==', ['get', 'retained'], true],
		0.4,
		0.75
	]);
	if (map.getLayer('v2-towns-count')) return restore;
	map.addLayer({
		id: 'v2-towns-count',
		type: 'symbol',
		source: 'towns',
		filter: hasStories as never,
		layout: {
			'text-field': ['to-string', ['get', 'total']],
			'text-size': 10,
			'text-allow-overlap': true
		},
		paint: { 'text-color': '#111827', 'text-opacity': ['coalesce', ['get', 'labelOpacity'], 1] }
	});
	return restore;
}
