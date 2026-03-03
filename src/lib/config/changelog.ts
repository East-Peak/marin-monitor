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
