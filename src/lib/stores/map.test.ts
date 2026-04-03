/**
 * Tests for map store
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import {
	mapStore,
	selectedTown,
	activeLayers,
	hoveredTown,
	showSegments,
	showTrafficCongestion,
	showTrafficEvents,
	showTraffic,
	LAYER_TO_CATEGORY,
	CATEGORY_TO_LAYER
} from './map';

describe('mapStore', () => {
	beforeEach(() => {
		mapStore.reset();
	});

	describe('initial state', () => {
		it('starts with no selected town', () => {
			expect(get(selectedTown)).toBeNull();
		});

		it('starts with all layers active', () => {
			const layers = get(activeLayers);
			expect(layers.civic).toBe(true);
			expect(layers.news).toBe(true);
			expect(layers.safety).toBe(true);
			expect(layers.housing).toBe(true);
			expect(layers.activity).toBe(true);
			expect(layers.satire).toBe(true);
			expect(layers.gas).toBe(true);
			expect(layers['ev-charging']).toBe(true);
			expect(layers.coffee).toBe(true);
			expect(layers.fitness).toBe(true);
			expect(layers['311']).toBe(true);
		});

		it('starts with no hovered town', () => {
			expect(get(hoveredTown)).toBeNull();
		});

		it('starts with segments visible', () => {
			expect(get(showSegments)).toBe(true);
		});

		it('starts with traffic congestion visible', () => {
			expect(get(showTrafficCongestion)).toBe(true);
		});

		it('starts with traffic events visible', () => {
			expect(get(showTrafficEvents)).toBe(true);
		});

		it('starts not initialized', () => {
			const state = get(mapStore);
			expect(state.initialized).toBe(false);
		});
	});

	describe('init', () => {
		it('sets initialized to true', () => {
			mapStore.init();
			expect(get(mapStore).initialized).toBe(true);
		});
	});

	describe('selectTown', () => {
		it('sets the selected town', () => {
			mapStore.selectTown('mill-valley');
			expect(get(selectedTown)).toBe('mill-valley');
		});

		it('clears town with null', () => {
			mapStore.selectTown('mill-valley');
			mapStore.selectTown(null);
			expect(get(selectedTown)).toBeNull();
		});
	});

	describe('hoverTown', () => {
		it('sets the hovered town', () => {
			mapStore.hoverTown('sausalito');
			expect(get(hoveredTown)).toBe('sausalito');
		});

		it('clears hover with null', () => {
			mapStore.hoverTown('sausalito');
			mapStore.hoverTown(null);
			expect(get(hoveredTown)).toBeNull();
		});
	});

	describe('toggleLayer', () => {
		it('toggles a layer off', () => {
			mapStore.toggleLayer('news');
			expect(get(activeLayers).news).toBe(false);
		});

		it('toggles a layer back on', () => {
			mapStore.toggleLayer('news');
			mapStore.toggleLayer('news');
			expect(get(activeLayers).news).toBe(true);
		});

		it('only affects the targeted layer', () => {
			mapStore.toggleLayer('news');
			expect(get(activeLayers).civic).toBe(true);
			expect(get(activeLayers).safety).toBe(true);
		});
	});

	describe('setLayerActive', () => {
		it('sets a layer to active', () => {
			mapStore.toggleLayer('gas'); // turn off first
			mapStore.setLayerActive('gas', true);
			expect(get(activeLayers).gas).toBe(true);
		});

		it('sets a layer to inactive', () => {
			mapStore.setLayerActive('gas', false);
			expect(get(activeLayers).gas).toBe(false);
		});
	});

	describe('clearAllLayers', () => {
		it('sets all layers to false', () => {
			mapStore.clearAllLayers();
			const layers = get(activeLayers);
			for (const val of Object.values(layers)) {
				expect(val).toBe(false);
			}
		});

		it('does not affect non-layer state', () => {
			mapStore.selectTown('novato');
			mapStore.clearAllLayers();
			expect(get(selectedTown)).toBe('novato');
		});
	});

	describe('toggleSegments', () => {
		it('toggles segments off', () => {
			mapStore.toggleSegments();
			expect(get(showSegments)).toBe(false);
		});

		it('toggles segments back on', () => {
			mapStore.toggleSegments();
			mapStore.toggleSegments();
			expect(get(showSegments)).toBe(true);
		});
	});

	describe('traffic toggles', () => {
		it('toggleTrafficCongestion toggles congestion', () => {
			mapStore.toggleTrafficCongestion();
			expect(get(showTrafficCongestion)).toBe(false);
			expect(get(showTrafficEvents)).toBe(true);
		});

		it('toggleTrafficEvents toggles events', () => {
			mapStore.toggleTrafficEvents();
			expect(get(showTrafficEvents)).toBe(false);
			expect(get(showTrafficCongestion)).toBe(true);
		});

		it('showTraffic derived is true when either is on', () => {
			expect(get(showTraffic)).toBe(true);
			mapStore.toggleTrafficCongestion();
			expect(get(showTraffic)).toBe(true); // events still on
			mapStore.toggleTrafficEvents();
			expect(get(showTraffic)).toBe(false); // both off
		});

		it('toggleTrafficAll turns both off when both are on', () => {
			mapStore.toggleTrafficAll();
			expect(get(showTrafficCongestion)).toBe(false);
			expect(get(showTrafficEvents)).toBe(false);
		});

		it('toggleTrafficAll turns both on when both are off', () => {
			mapStore.toggleTrafficAll(); // turn off
			mapStore.toggleTrafficAll(); // turn on
			expect(get(showTrafficCongestion)).toBe(true);
			expect(get(showTrafficEvents)).toBe(true);
		});

		it('toggleTrafficAll turns both off when only one is on', () => {
			mapStore.toggleTrafficCongestion(); // only events on
			mapStore.toggleTrafficAll(); // should turn both off (since one is still on)
			expect(get(showTrafficCongestion)).toBe(false);
			expect(get(showTrafficEvents)).toBe(false);
		});
	});

	describe('reset', () => {
		it('resets all state to defaults', () => {
			mapStore.selectTown('novato');
			mapStore.toggleLayer('news');
			mapStore.hoverTown('tiburon');
			mapStore.init();

			mapStore.reset();

			expect(get(selectedTown)).toBeNull();
			expect(get(hoveredTown)).toBeNull();
			expect(get(activeLayers).news).toBe(true);
			expect(get(mapStore).initialized).toBe(false);
		});
	});

	describe('LAYER_TO_CATEGORY mapping', () => {
		it('maps news layer to local category', () => {
			expect(LAYER_TO_CATEGORY.news).toBe('local');
		});

		it('maps activity layer to outdoors category', () => {
			expect(LAYER_TO_CATEGORY.activity).toBe('outdoors');
		});

		it('maps safety layer to safety category', () => {
			expect(LAYER_TO_CATEGORY.safety).toBe('safety');
		});
	});

	describe('CATEGORY_TO_LAYER mapping', () => {
		it('maps local category to news layer', () => {
			expect(CATEGORY_TO_LAYER.local).toBe('news');
		});

		it('maps outdoors category to activity layer', () => {
			expect(CATEGORY_TO_LAYER.outdoors).toBe('activity');
		});

		it('maps cycling category to activity layer', () => {
			expect(CATEGORY_TO_LAYER.cycling).toBe('activity');
		});
	});
});
