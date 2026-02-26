/**
 * Configuration exports
 */

// Panel configuration
export {
	PANELS,
	NON_DRAGGABLE_PANELS,
	DEFAULT_PANEL_ORDER,
	type PanelConfig,
	type PanelId
} from './panels';

// Town configuration
export {
	MARIN_TOWNS,
	TOWN_BY_SLUG,
	TOWN_BY_NAME,
	MARIN_CENTER,
	MARIN_BOUNDS
} from './towns';

// Feed configuration
export { FEEDS, getAllFeedUrls, type FeedSource } from './feeds';

// Keyword configuration
export {
	ALERT_KEYWORDS,
	TOPIC_KEYWORDS,
	containsAlertKeyword,
	detectTown,
	detectTopics,
	type AlertKeyword
} from './keywords';

// Analysis configuration
export {
	CORRELATION_TOPICS,
	NARRATIVE_PATTERNS,
	SOURCE_TYPES,
	type CorrelationTopic,
	type NarrativePattern,
	type SourceTypes
} from './analysis';

// Map configuration
export {
	MAP_DEFAULT,
	MAP_BOUNDS,
	LAYER_COLORS,
	FIRE_ZONES,
	LANDMARKS,
	NWS_ZONE,
	NWS_FIRE_ZONE,
	NWS_OFFICE,
	TIDE_STATIONS,
	EARTHQUAKE_PARAMS,
	AIRNOW_PARAMS,
	type FireZone,
	type Landmark
} from './map';

// Preset configuration
export {
	PRESETS,
	PRESET_ORDER,
	ONBOARDING_STORAGE_KEY,
	PRESET_STORAGE_KEY,
	type Preset
} from './presets';

// API configuration
export {
	CORS_PROXY_URL,
	CORS_PROXIES,
	fetchWithProxy,
	API_DELAYS,
	CACHE_TTLS,
	API_URLS,
	AIRNOW_API_KEY,
	DEBUG,
	logger
} from './api';
