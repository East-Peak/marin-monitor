/**
 * The map's feed from the v2 controller (MAPX2b, MAPX3): the owned map data plus the data
 * layers, for the dashboard's map and for /map alike. A layer's dataset activates when the
 * layer is on and the whole map is showing, whatever sections are open; an open section and an
 * enabled layer share one fetch (the registry's ensure).
 */
import { derived, type Readable } from 'svelte/store';
import type { DashboardV2Controller } from './v2-controller';
import type { LayerPrefId } from './section-prefs';
import type { MapLayer } from '$lib/types';
import { v2MapData, type V2MapData } from './v2-map-data';
import { DATA_LAYERS, v2DataLayers, type DataLayerId, type DataLayerView } from './v2-map-layers';
import { blotterView } from './v2-blotter';

export type MapFeedSource = Pick<
	DashboardV2Controller,
	| 'ensure'
	| 'snapshot'
	| 'fixIt'
	| 'earthquakes'
	| 'sources'
	| 'datasetOutcomes'
	| 'traffic'
	| 'fires'
	| 'airport'
	| 'places'
	| 'camHeadings'
	| 'civic'
	| 'blotter'
>;

export interface MapFeed {
	data: V2MapData;
	dataLayers: Record<DataLayerId, DataLayerView>;
}

/**
 * Loaded on demand through ensure(); the rest arrive with the controller's essentials. The
 * Shows layer reads Events' own calendar, so it loads whether or not Events was opened.
 */
const DETAIL_LAYER_DATASETS: ReadonlySet<string> = new Set([
	'traffic',
	'fires',
	'airport',
	'activity'
]);

export function createMapFeed(
	src: MapFeedSource,
	opts: {
		/** The whole map is showing (not the phone's preview), so its layers may load. */
		full: Readable<boolean>;
		/** The layer choices in force: saved prefs on the dashboard, the URL's on /map. */
		layers: Readable<Partial<Record<LayerPrefId, boolean>>>;
		town: Readable<string | null>;
		clock: Readable<number>;
		activeLayers: Readable<Readonly<Partial<Record<MapLayer, boolean>>>>;
	}
): { feed: Readable<MapFeed>; stop: () => void } {
	const layerOn = derived(
		[opts.full, opts.layers],
		([$full, $layers]) =>
			Object.fromEntries(
				DATA_LAYERS.map((l) => [l.id, $full && ($layers[l.id] ?? l.defaultOn)])
			) as Record<DataLayerId, boolean>
	);
	// The cams layer owns the 30 s heading reads while it shows (MAPX4); an open camera's
	// detail is on this map, so it is held with it.
	let releaseHeadings: (() => void) | null = null;
	const unsubscribe = layerOn.subscribe((on) => {
		for (const l of DATA_LAYERS)
			if (on[l.id] && DETAIL_LAYER_DATASETS.has(l.dataset)) void src.ensure(l.dataset);
		if (on.cams && !releaseHeadings) releaseHeadings = src.camHeadings.hold();
		if (!on.cams && releaseHeadings) {
			releaseHeadings();
			releaseHeadings = null;
		}
	});
	const stop = () => {
		unsubscribe();
		releaseHeadings?.();
		releaseHeadings = null;
	};
	const data = derived(
		[
			src.snapshot,
			src.fixIt,
			src.earthquakes,
			src.sources,
			opts.activeLayers,
			opts.town,
			opts.clock
		],
		([view, fixIt, earthquakes, sources, activeLayers, town, now]) =>
			v2MapData({ view, fixIt, earthquakes, sources, activeLayers, town, now })
	);
	const values = derived(
		[
			src.traffic,
			src.fires,
			src.places.gas,
			src.places.ev,
			src.places.coffee,
			src.places.fitness,
			src.airport,
			src.camHeadings,
			src.civic,
			src.blotter,
			src.sources,
			opts.clock
		],
		([traffic, fire, gas, ev, coffee, fitness, airport, cams, civic, blotter, sources, now]) => ({
			traffic,
			fire,
			gas,
			ev,
			coffee,
			fitness,
			airport,
			cams,
			activity: civic.activity,
			blotter: blotterView(
				sources.find((e) => e.id === 'part:sheriff-blotter'),
				blotter,
				now
			)
		})
	);
	const dataLayers = derived(
		[layerOn, src.datasetOutcomes, values, opts.town, opts.clock],
		([on, outcomes, v, town, now]) => v2DataLayers({ on, outcomes, values: v, town, now })
	);
	const feed = derived([data, dataLayers], ([d, l]) => ({ data: d, dataLayers: l }));
	return { feed, stop };
}
