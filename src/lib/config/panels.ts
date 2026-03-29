/**
 * Panel configuration — defines the dashboard panels for Marin Monitor
 */

export interface PanelConfig {
	name: string;
	priority: 1 | 2 | 3;
	description?: string;
}

export type PanelId =
	| 'map'
	| 'local-wire'
	| 'pulse'
	| 'safety'
	| 'weather'
	| 'cameras'
	| 'conditions'
	| 'outdoors'
	| 'civic'
	| 'housing'
	| 'cycling'
	| 'shows'
	| 'prep'
	| 'farm'
	| 'monitors'
	| 'correlation'
	| 'narrative'
	| 'satire'
	| 'gas-prices'
	| 'leaderboards'
	| 'ev-charging'
	| 'wastewater'
	| 'airport-status'
	| 'cappuccino'
	| 'grocery-basket'
	| 'wine-index'
	| 'school-tuition';

export const PANELS: Record<PanelId, PanelConfig> = {
	map: { name: 'Marin Map', priority: 1, description: 'County map with layered data' },
	'local-wire': {
		name: 'Local Wire',
		priority: 1,
		description: 'Scrolling feed from local news sources'
	},
	pulse: {
		name: 'Pulse',
		priority: 1,
		description: 'At-a-glance stats: stories, AQI, weather, tides'
	},
	safety: {
		name: 'Crime & Safety',
		priority: 1,
		description: 'Fire alerts, road closures, emergency notices'
	},
	weather: { name: 'Weather & Tides', priority: 2, description: 'NWS forecast, AQI, NOAA tides' },
	cameras: {
		name: 'Cameras',
		priority: 2,
		description: 'Live webcams: 101 freeway, Mt. Tam, Golden Gate Bridge'
	},
	conditions: {
		name: 'Hero Dirt Tracker',
		priority: 2,
		description: 'Mt. Tam trail conditions'
	},
	outdoors: {
		name: 'Outdoors & Lifestyle',
		priority: 2,
		description: 'Trail closures, park alerts, fishing, and wildlife'
	},
	civic: {
		name: 'Civic',
		priority: 2,
		description: 'County/city announcements, meetings, permits'
	},
	housing: { name: 'Housing', priority: 3, description: 'Recent transactions, market activity' },
	cycling: {
		name: 'Cycling & Endurance',
		priority: 3,
		description: 'Race calendars, results, trail events, and local human-powered competition'
	},
	leaderboards: {
		name: 'Leaderboards',
		priority: 2,
		description: 'Strava segment KOMs and course records for Marin'
	},
	shows: {
		name: 'Shows & Events',
		priority: 3,
		description: 'Live music, venue calendars, and public community happenings'
	},
	prep: {
		name: 'Sports & Prep',
		priority: 3,
		description: 'High school, club, and local competitive sports coverage'
	},
	farm: {
		name: 'Farm & Market',
		priority: 3,
		description: 'Farmers markets, cheese, produce, and West Marin food culture'
	},
	monitors: { name: 'My Monitors', priority: 2, description: 'Custom keyword monitors' },
	correlation: { name: 'Connections', priority: 3, description: 'Cross-source topic correlations' },
	narrative: { name: 'Threads', priority: 3, description: 'Emerging local narrative tracking' },
	satire: {
		name: 'Marin Lately (satire)',
		priority: 3,
		description: 'Marin Lately unconfirmed reports'
	},
	'gas-prices': {
		name: 'Gas Prices',
		priority: 3,
		description: 'Station-level fuel prices across Marin County'
	},
	'ev-charging': {
		name: 'EV Charging',
		priority: 3,
		description: 'EV charging station locations, connectors, and networks'
	},
	wastewater: {
		name: 'Pathogen Watch',
		priority: 2,
		description: 'Wastewater pathogen surveillance from Marin sewersheds'
	},
	'airport-status': {
		name: 'Airport Status',
		priority: 2,
		description: 'SFO and OAK delays, conditions, and TSA wait times'
	},
	cappuccino: {
		name: 'Cappuccino Index',
		priority: 3,
		description: 'Cappuccino prices at coffee shops across Marin'
	},
	'grocery-basket': {
		name: 'The Bare Essentials',
		priority: 3,
		description: '12-item grocery basket tracked weekly via Instacart'
	},
	'wine-index': {
		name: 'Wine Index',
		priority: 3,
		description: 'Premium wine category medians and curated picks via PlumpJack'
	},
	'school-tuition': {
		name: 'Private School Tuition Index',
		priority: 3,
		description: 'Marin private school tuition by level as a percentage of median household income'
	}
};

export const NON_DRAGGABLE_PANELS: PanelId[] = ['map'];

/**
 * Default panel display order
 */
export const DEFAULT_PANEL_ORDER: PanelId[] = [
	'map',
	'pulse',
	'local-wire',
	'safety',
	'weather',
	'cameras',
	'conditions',
	'airport-status',
	'wastewater',
	'civic',
	'outdoors',
	'housing',
	'gas-prices',
	'grocery-basket',
	'ev-charging',
	'cappuccino',
	'wine-index',
	'school-tuition',
	'cycling',
	'leaderboards',
	'shows',
	'prep',
	'farm',
	'monitors',
	'correlation',
	'narrative',
	'satire'
];
