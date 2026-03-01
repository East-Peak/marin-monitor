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

// Monitors store
export {
	monitors,
	enabledMonitors,
	monitorCount,
	matchCount,
	hasMatches,
	type MonitorMatch,
	type MonitorsState
} from './monitors';

// News store
export {
	news,
	localNews,
	civicNews,
	safetyNews,
	outdoorsNews,
	housingNews,
	cyclingNews,
	enduranceNews,
	humanPoweredNews,
	showsNews,
	prepNews,
	farmNews,
	satireNews,
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

// Refresh store
export {
	refresh,
	isRefreshing,
	currentStage,
	lastRefresh,
	autoRefreshEnabled,
	timeSinceRefresh,
	categoriesWithErrors,
	REFRESH_STAGES,
	type RefreshStage,
	type StageConfig,
	type RefreshState
} from './refresh';
