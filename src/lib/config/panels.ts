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
	| 'school-tuition'
	| 'fitness'
	| 'driveway'
	| 'composite'
	| '311';

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
		name: 'Marin Coffee Index',
		priority: 3,
		description: 'Coffee prices across Marin, with cappuccino as the headline benchmark'
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
	},
	fitness: {
		name: 'Fitness Drop-in Index',
		priority: 3,
		description: 'Drop-in class prices at fitness studios across Marin, color-coded by type'
	},
	driveway: {
		name: 'The Marin Driveway Index',
		priority: 3,
		description: 'Vehicle registrations by make and fuel type from California DMV data'
	},
	composite: {
		name: 'Cost of Being Marin',
		priority: 1,
		description:
			'Composite cost index and The Marin Number: the all-in monthly price of the Marin lifestyle'
	},
	'311': {
		name: '311',
		priority: 2,
		description: 'Fix It Marin civic issue reports — potholes, dumping, graffiti, and more'
	}
};

export const NON_DRAGGABLE_PANELS: PanelId[] = ['map'];

/**
 * Default panel display order
 */
const CURATED_PANEL_ORDER: PanelId[] = [
	'map',
	'composite',
	'pulse',
	'local-wire',
	'safety',
	'weather',
	'cameras',
	'conditions',
	'airport-status',
	'wastewater',
	'civic',
	'311',
	'outdoors',
	'housing',
	'gas-prices',
	'grocery-basket',
	'cappuccino',
	'wine-index',
	'fitness',
	'school-tuition',
	'driveway',
	'ev-charging',
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

const registeredPanelIds = Object.keys(PANELS) as PanelId[];
const registeredPanelSet = new Set<PanelId>(registeredPanelIds);

export const DEFAULT_PANEL_ORDER: PanelId[] = [
	...CURATED_PANEL_ORDER.filter((id) => registeredPanelSet.has(id)),
	...registeredPanelIds.filter((id) => !CURATED_PANEL_ORDER.includes(id))
];
