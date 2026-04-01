/**
 * Map interaction state — tracks selected town, active layers, and hover state
 */

import { writable, derived } from 'svelte/store';
import type { MapLayer, NewsCategory } from '$lib/types';

export interface MapState {
	selectedTown: string | null;
	activeLayers: Record<MapLayer, boolean>;
	hoveredTown: string | null;
	showSegments: boolean;
	showTrafficCongestion: boolean;
	showTrafficEvents: boolean;
	initialized: boolean;
}

const ALL_LAYERS: MapLayer[] = [
	'civic',
	'news',
	'safety',
	'housing',
	'activity',
	'satire',
	'gas',
	'ev-charging',
	'coffee',
	'fitness',
	'311'
];

function createInitialState(): MapState {
	const activeLayers = {} as Record<MapLayer, boolean>;
	for (const layer of ALL_LAYERS) {
		activeLayers[layer] = true;
	}
	return {
		selectedTown: null,
		activeLayers,
		hoveredTown: null,
		showSegments: true,
		showTrafficCongestion: true,
		showTrafficEvents: true,
		initialized: false
	};
}

/**
 * Map MapLayer → NewsCategory
 */
export const LAYER_TO_CATEGORY: Partial<Record<MapLayer, NewsCategory>> = {
	news: 'local',
	activity: 'outdoors',
	civic: 'civic',
	safety: 'safety',
	housing: 'housing',
	satire: 'satire',
	'311': '311'
};

/**
 * Map NewsCategory → MapLayer
 */
export const CATEGORY_TO_LAYER: Record<NewsCategory, MapLayer> = {
	local: 'news',
	outdoors: 'activity',
	cycling: 'activity',
	endurance: 'activity',
	prep: 'activity',
	shows: 'news',
	farm: 'news',
	civic: 'civic',
	safety: 'safety',
	housing: 'housing',
	satire: 'satire',
	'311': '311'
};

function createMapStore() {
	const { subscribe, set, update } = writable<MapState>(createInitialState());

	return {
		subscribe,

		init() {
			update((state) => ({ ...state, initialized: true }));
		},

		selectTown(townSlug: string | null) {
			update((state) => ({ ...state, selectedTown: townSlug }));
		},

		hoverTown(townSlug: string | null) {
			update((state) => ({ ...state, hoveredTown: townSlug }));
		},

		toggleLayer(layer: MapLayer) {
			update((state) => ({
				...state,
				activeLayers: {
					...state.activeLayers,
					[layer]: !state.activeLayers[layer]
				}
			}));
		},

		toggleSegments() {
			update((state) => ({
				...state,
				showSegments: !state.showSegments
			}));
		},

		toggleTrafficCongestion() {
			update((state) => ({
				...state,
				showTrafficCongestion: !state.showTrafficCongestion
			}));
		},

		toggleTrafficEvents() {
			update((state) => ({
				...state,
				showTrafficEvents: !state.showTrafficEvents
			}));
		},

		toggleTrafficAll() {
			update((state) => {
				const next = !(state.showTrafficCongestion || state.showTrafficEvents);
				return {
					...state,
					showTrafficCongestion: next,
					showTrafficEvents: next
				};
			});
		},

		setLayerActive(layer: MapLayer, active: boolean) {
			update((state) => ({
				...state,
				activeLayers: {
					...state.activeLayers,
					[layer]: active
				}
			}));
		},

		reset() {
			set(createInitialState());
		}
	};
}

export const mapStore = createMapStore();

export const selectedTown = derived(mapStore, ($map) => $map.selectedTown);
export const activeLayers = derived(mapStore, ($map) => $map.activeLayers);
export const hoveredTown = derived(mapStore, ($map) => $map.hoveredTown);
export const showSegments = derived(mapStore, ($map) => $map.showSegments);
export const showTrafficCongestion = derived(mapStore, ($map) => $map.showTrafficCongestion);
export const showTrafficEvents = derived(mapStore, ($map) => $map.showTrafficEvents);
export const showTraffic = derived(
	mapStore,
	($map) => $map.showTrafficCongestion || $map.showTrafficEvents
);
