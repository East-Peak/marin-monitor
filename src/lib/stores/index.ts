/**
 * Stores barrel file - re-exports all stores
 */

// Settings store
export {
	settings,
	enabledPanels,
	disabledPanels,
	draggablePanels,
	type PanelSettings,
	type SettingsState
} from './settings';

// News store
export {
	news,
	localNews,
	civicNews,
	safetyNews,
	outdoorsNews,
	threeOneOneNews,
	allNewsItems,
	alerts,
	isLoading as isNewsLoading,
	hasErrors as hasNewsErrors,
	type CategoryState,
	type NewsState
} from './news';

// Map store
export {
	mapStore,
	selectedTown,
	activeLayers,
	hoveredTown,
	LAYER_TO_CATEGORY,
	CATEGORY_TO_LAYER,
	type MapState
} from './map';

// Gas prices store
export { gasPriceStore, currentGasStations } from './gas-prices';

// EV charging store
export { evChargingStore, currentChargingStations } from './ev-charging';

// Town filter store
export { townFilter, selectedTownObj, townLocation } from './town-filter';

// Refresh store
export {
	refresh,
	currentStage,
	autoRefreshEnabled,
	timeSinceRefresh,
	categoriesWithErrors,
	REFRESH_STAGES,
	type RefreshStage,
	type StageConfig,
	type RefreshState
} from './refresh';
