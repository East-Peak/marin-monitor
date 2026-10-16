/**
 * The v2 map's way back and its key (Stuart, 2026-10-16). Clicking a town flies the map in;
 * "All of Marin" shows whenever there is somewhere to come back from. Stories carry a town,
 * not a street address, so they sit in one circle per town; only Fix It Marin reports and
 * earthquakes have exact spots. Zoomed into a town that reads as "only 311 pins", so the key
 * says how each enabled layer is placed and how many are in view. A layer that isn't read
 * makes no count claim: the status line under the map says why.
 */
import type { MapLayer } from '$lib/types';
import type { V2MapData } from './v2-map-data';

export interface MapView {
	zoom: number;
	center: { lng: number; lat: number };
}
/** What the map renders inside the current view: each town circle's story total, and points. */
export interface InView {
	towns: { slug: string; total: number }[];
	fixIt: number;
	quakes: number;
}
export interface LegendLine {
	key: 'stories' | '311' | 'earthquakes';
	label: string;
	how: string;
	count: string | null;
}

/** Off home by more than a nudge: a quarter zoom step, or about a kilometre. */
const ZOOM_SLACK = 0.25;
const CENTER_SLACK_DEG = 0.01;
const STORY_LAYERS: readonly MapLayer[] = [
	'news',
	'safety',
	'civic',
	'activity',
	'housing',
	'satire'
];

export function showMarinReset(
	town: string | null,
	view: MapView | null,
	home: MapView | null
): boolean {
	if (town !== null) return true;
	if (!view || !home) return false;
	return (
		Math.abs(view.zoom - home.zoom) > ZOOM_SLACK ||
		Math.abs(view.center.lng - home.center.lng) > CENTER_SLACK_DEG ||
		Math.abs(view.center.lat - home.center.lat) > CENTER_SLACK_DEG
	);
}

const inView = (n: number) => (n === 0 ? 'none in view' : `${n} in view`);

function storyCount(towns: InView['towns'], town: string | null, townName: (s: string) => string) {
	// With a town chosen every other circle is dimmed: only the chosen one counts.
	if (town !== null) {
		const chosen = towns.find((t) => t.slug === town);
		return chosen ? `${chosen.total} in the ${townName(town)} circle` : inView(0);
	}
	const lit = towns.filter((t) => t.total > 0);
	const total = lit.reduce((sum, t) => sum + t.total, 0);
	if (total === 0) return inView(0);
	return `${total} in view, in ${lit.length} town circle${lit.length === 1 ? '' : 's'}`;
}

export function mapLegend(input: {
	activeLayers: Readonly<Partial<Record<MapLayer, boolean>>>;
	earthquakesShown: boolean;
	layers: V2MapData['layers'];
	town: string | null;
	townName: (slug: string) => string;
	inView: InView | null;
}): LegendLine[] {
	const { activeLayers, layers, inView: seen } = input;
	const counted = (key: keyof V2MapData['layers'], count: (v: InView) => string) =>
		layers[key] === 'value' && seen ? count(seen) : null;
	const lines: LegendLine[] = [];
	if (STORY_LAYERS.some((l) => activeLayers[l]))
		lines.push({
			key: 'stories',
			label: 'Stories',
			how: 'one circle per town, not street spots',
			count: counted('news', (v) => storyCount(v.towns, input.town, input.townName))
		});
	if (activeLayers['311'])
		lines.push({
			key: '311',
			label: 'Fix It Marin',
			how: 'each report at its spot',
			count: counted('311', (v) => inView(v.fixIt))
		});
	if (input.earthquakesShown)
		lines.push({
			key: 'earthquakes',
			label: 'Earthquakes',
			how: 'each epicenter',
			count: counted('earthquakes', (v) => inView(v.quakes))
		});
	return lines;
}
