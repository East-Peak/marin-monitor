/**
 * Road speeds (MAPX2c): the Mapbox congestion lines with a status of their own, judged by the
 * tiles in view. Each tile's last outcome is kept by key (a load, or an error). When the map
 * idles, a failed tile anywhere in view makes it "unavailable"; every tile in view loaded makes
 * it ok; a new tile request makes it "loading". So a pan that keeps a failed tile in view
 * stays unavailable (MapLibre never asks for it again), and a retry that loads clears it.
 * As-of is the last successful tile load. A failure takes the colour off the roads (opacity 0,
 * so the tiles keep loading and a later clean view brings it back); new tiles after an ok view
 * keep the good lines while they load.
 */
import { CONGESTION_LINE_OPACITY } from './map-layers';

const SOURCE = 'traffic-congestion';
const LAYER = 'traffic-congestion-layer';

export interface RoadSpeeds {
	state: 'loading' | 'value' | 'unavailable';
	/** The last successful tile load. */
	asOf: number | null;
	/** Whether the lines carry colour now. */
	drawn: boolean;
}

type TileEvent = { sourceId?: unknown; dataType?: unknown; tile?: unknown };
type Handler = (e: TileEvent) => void;

/** The parts of a MapLibre map the watcher reads (a fake in tests). */
export interface RoadSpeedsTarget {
	on(type: string, fn: Handler): unknown;
	off(type: string, fn: Handler): unknown;
	getSource(id: string): unknown;
	isSourceLoaded(id: string): boolean;
	/** The keys of the congestion source's tiles now in view (MapLibre's SourceCache.getIds). */
	tileIds(): readonly string[];
}

const keyOf = (e: TileEvent): string | null => {
	if (e.sourceId !== SOURCE || e.dataType !== 'source') return null;
	const key = (e.tile as { tileID?: { key?: unknown } } | undefined)?.tileID?.key;
	return key === undefined || key === null ? null : String(key);
};

export function watchRoadSpeeds(
	map: RoadSpeedsTarget,
	now: () => number,
	onChange: (s: RoadSpeeds) => void
): { dispose(): void } {
	let status: RoadSpeeds = { state: 'loading', asOf: null, drawn: false };
	/** Each tile's last outcome, by key; pruned to the view on every idle. */
	const outcome = new Map<string, 'ok' | 'error'>();
	const set = (next: RoadSpeeds) => {
		if (next.state === status.state && next.asOf === status.asOf && next.drawn === status.drawn)
			return;
		status = next;
		onChange(status);
	};
	const handlers: Record<string, Handler> = {
		sourcedataloading: (e) => {
			if (keyOf(e) !== null && status.state !== 'unavailable') set({ ...status, state: 'loading' });
		},
		sourcedata: (e) => {
			const key = keyOf(e);
			if (key === null) return;
			outcome.set(key, 'ok');
			status = { ...status, asOf: now() };
		},
		error: (e) => {
			if (e.sourceId !== SOURCE) return;
			const key = keyOf({ ...e, dataType: 'source' });
			if (key !== null) outcome.set(key, 'error');
			set({ ...status, state: 'unavailable', drawn: false });
		},
		idle: () => {
			if (!map.getSource(SOURCE) || !map.isSourceLoaded(SOURCE)) return;
			const view = map.tileIds();
			for (const key of outcome.keys()) if (!view.includes(key)) outcome.delete(key);
			// Idle means nothing is still loading; a tile with no outcome here came back from the
			// cache, which holds only tiles that loaded. So any failure in view decides it.
			if (view.some((key) => outcome.get(key) === 'error'))
				set({ ...status, state: 'unavailable', drawn: false });
			else if (view.length && status.asOf !== null) set({ ...status, state: 'value', drawn: true });
		}
	};
	for (const [type, fn] of Object.entries(handlers)) map.on(type, fn);
	onChange(status);
	return {
		dispose: () => {
			for (const [type, fn] of Object.entries(handlers)) map.off(type, fn);
		}
	};
}

/** The parts of a MapLibre map the lines' switch touches (a fake in tests). */
export interface RoadSpeedsPaintTarget {
	getLayer(id: string): unknown;
	setLayoutProperty(id: string, prop: 'visibility', value: 'visible' | 'none'): unknown;
	setPaintProperty(id: string, prop: 'line-opacity', value: unknown): unknown;
}

/** On: the layer stays visible so its tiles load; colour only while the status vouches. */
export function applyRoadSpeeds(map: RoadSpeedsPaintTarget, on: boolean, drawn: boolean): void {
	if (!map.getLayer(LAYER)) return;
	map.setLayoutProperty(LAYER, 'visibility', on ? 'visible' : 'none');
	map.setPaintProperty(LAYER, 'line-opacity', drawn ? CONGESTION_LINE_OPACITY : 0);
}
