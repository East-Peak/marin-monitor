/**
 * Changelog entries for the "What's New" section in the Community panel.
 *
 * Add newest entries at the top. Each entry has a date, description,
 * and optional contributor credit.
 */

export interface ChangelogEntry {
	date: string;
	title: string;
	description?: string;
	contributor?: string;
}

export const CHANGELOG: ChangelogEntry[] = [
	{
		date: '2026-03-31',
		title: 'TV Leaderboards Refresh',
		description:
			'TV mode now shows 20 random segments per column instead of the same 8. Segments with recent KOM/QOM changes pinned to top. Different mix each page load.'
	},
	{
		date: '2026-03-31',
		title: 'Coffee Index Now Automated',
		description:
			'Coffee price scraper runs weekly. Previously manual-only, which is why live sources showed 0/11.'
	},
	{
		date: '2026-03-31',
		title: 'County-Wide Strava Catalog',
		description:
			'Full Marin segment discovery: 2,225 segments total. Curated 100 ride / 100 run shortlist as default dashboard catalog with daily leaderboard cron.'
	},
	{
		date: '2026-03-31',
		title: 'Panel Defaults Fixed',
		description:
			'New panels (composite, leaderboards, cappuccino, grocery, wine, tuition, fitness, driveway) now automatically included in presets. Older saved layouts updated on load.'
	},
	{
		date: '2026-03-29',
		title: 'Cost of Being Marin',
		description:
			'Composite index with tiered sub-scores (Daily Life, Lifestyle, Housing, Structural). The Marin Number: $21,110/mo ($253,320/yr).'
	},
	{
		date: '2026-03-29',
		title: 'The Marin Driveway',
		description:
			'Vehicle registration data from California DMV. Top makes, fuel type breakdown (8.3% EV), and fun stats like 68 hydrogen fuel cells and 12 Lucids.'
	},
	{
		date: '2026-03-29',
		title: 'Fitness Drop-in Index',
		description:
			'Drop-in class prices at 16 studios across yoga, pilates, cycling, CrossFit, and HIIT. Map pins color-coded by type.'
	},
	{
		date: '2026-03-29',
		title: 'Marin Private School Tuition Index',
		description:
			'7 schools across 4 tiers (preschool through high school), shown as percentage of median household income. Cumulative K-12 cost: $698,998.'
	},
	{
		date: '2026-03-29',
		title: 'Wine Index',
		description:
			'Premium wine market tracker powered by PlumpJack Shopify API. Category medians for Napa/Sonoma Cab, Burgundy, and Champagne. Staff picks and allocated wines.'
	},
	{
		date: '2026-03-29',
		title: 'The Bare Essentials',
		description:
			'12-item Marin grocery basket tracked via Instacart. Vital Farms eggs, Marin Kombucha, Silver Oak cab, and more with sparkline trends.'
	},
	{
		date: '2026-03-29',
		title: 'Marin Coffee Index',
		description:
			'Gas-prices-style coffee tracker with Marin shop pins, multi-drink hover details, and cappuccino as the countywide benchmark.'
	},
	{
		date: '2026-03-28',
		title: 'Strava KOM Tracker',
		description:
			'Curated Marin cycling and trail segments with live Strava leaderboards across the Leaderboards panel, interactive map overlays, TV mode, and chyron updates.'
	},
	{
		date: '2026-03-24',
		title: 'TV Mode v2',
		description:
			'Redesigned TV dashboard with 8 screens: map explorer with per-region weather, news wire, safety with auto-scroll, 3 geographic camera clusters (Tam & Coast, Central & Highway, West & North), conditions & trails, and outdoors & community. Press M or click the TV button to try it at /tv.'
	},
	{
		date: '2026-03-04',
		title: 'Featured listings & events',
		description:
			'Newspaper-style classified ads inline in wire columns and as banners. Local listings, events, and community features from Marin businesses.'
	},
	{
		date: '2026-03-03',
		title: 'Airport map pins',
		description: 'SFO, OAK, STS (Santa Rosa), and SJC (San José) appear as color-coded dots on the map. Green = on time, amber = delays, red = ground stop. Click for details.'
	},
	{
		date: '2026-03-03',
		title: 'Airport Status panel',
		description: 'SFO and OAK delays, weather conditions, fog risk, and forecast alerts. Data from FAA NAS and Aviation Weather.'
	},
	{
		date: '2026-03-03',
		title: 'Pathogen Watch panel',
		description: 'Wastewater pathogen surveillance from 5 Marin sewersheds. Tracks COVID, Flu A, RSV, and Norovirus with trend sparklines.'
	},
	{
		date: '2026-03-03',
		title: 'Bug fixes',
		description: 'Settings modal no longer transparent. Gas prices chart reads left-to-right. Pacifics schedule shows clean game titles.'
	},
	{
		date: '2026-03-02',
		title: 'Town filter overhaul',
		description: 'Per-town filtering across the whole dashboard. Weather, conditions, gas, and EV panels re-fetch for your selected town.'
	},
	{
		date: '2026-03-02',
		title: 'Expanded fire camera coverage',
		description: 'Added all 17 ALERTCalifornia fire cameras across Marin, organized by sub-region. New expandable full-screen camera grid.'
	},
	{
		date: '2026-03-02',
		title: 'EV charging station tracker',
		description: '200+ stations from NREL AFDC with pricing data from Open Charge Map. DC fast charger and connector breakdowns.'
	},
	{
		date: '2026-03-01',
		title: 'Gas price tracking',
		description: 'Real-time Marin County gas prices with station-level data and trend history.'
	},
	{
		date: '2026-02-28',
		title: 'Traffic camera feeds',
		description: 'Live Caltrans CCTV feeds for Highway 101 and Sir Francis Drake.'
	},
	{
		date: '2026-02-27',
		title: 'Coastal conditions panel',
		description: 'NOAA tide predictions, marine buoy data, and nearshore conditions for Point Reyes and SF Bar.'
	},
	{
		date: '2026-02-26',
		title: 'Air quality monitoring',
		description: 'Real-time AQI from AirNow with pollutant breakdowns and health guidance.'
	},
	{
		date: '2026-02-25',
		title: 'Interactive Marin map',
		description: 'MapLibre base map with Mapbox traffic overlay, toggleable civic/news/safety layers, and earthquake markers.'
	},
	{
		date: '2026-02-24',
		title: 'Initial launch',
		description: 'Local news aggregation, weather forecasts, community feeds, and the signal deck dashboard.'
	}
];
