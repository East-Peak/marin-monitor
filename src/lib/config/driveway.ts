// src/lib/config/driveway.ts

import type { FuelType, MakeCount, FuelBreakdown, DrivewayFunStats } from '$lib/types/driveway';

/** Blob storage key */
export const DRIVEWAY_BLOB_KEY = 'marin-driveway.json';

/** Max history entries (one per data year, ~10 years of DMV data) */
export const MAX_DRIVEWAY_HISTORY = 10;

/** Accent color (indigo -- vehicle/tech feel) */
export const DRIVEWAY_ACCENT = '#6366f1';

/** Accent color with transparency for area fills */
export const DRIVEWAY_ACCENT_FILL = 'rgba(99, 102, 241, 0.1)';

/** California DMV API base URL (CKAN datastore SQL endpoint) */
export const DMV_API_BASE = 'https://data.ca.gov/api/3/action/datastore_search_sql';

/** All Marin County ZIP codes (30 ZIPs) */
export const MARIN_ZIPS = [
	'94901', '94903', '94904', '94920', '94925',
	'94929', '94930', '94933', '94937', '94938',
	'94939', '94940', '94941', '94945', '94946',
	'94947', '94949', '94950', '94956', '94957',
	'94960', '94963', '94964', '94965', '94966',
	'94970', '94971', '94973', '94978', '94979'
] as const;

/** Human-readable labels for fuel types */
export const FUEL_TYPE_LABELS: Record<FuelType, string> = {
	gasoline: 'Gasoline',
	'battery-electric': 'Battery Electric',
	hybrid: 'Hybrid',
	'plug-in-hybrid': 'Plug-in Hybrid',
	diesel: 'Diesel',
	'flex-fuel': 'Flex Fuel',
	hydrogen: 'Hydrogen',
	other: 'Other'
};

/** Colors for fuel type visualization */
export const FUEL_TYPE_COLORS: Record<FuelType, string> = {
	gasoline: '#94a3b8',         // slate
	'battery-electric': '#22c55e', // green
	hybrid: '#3b82f6',           // blue
	'plug-in-hybrid': '#8b5cf6', // purple
	diesel: '#f59e0b',           // amber
	'flex-fuel': '#f97316',      // orange
	hydrogen: '#06b6d4',         // cyan
	other: '#6b7280'             // gray
};

/** Display order for fuel types */
export const FUEL_TYPE_ORDER: FuelType[] = [
	'gasoline',
	'battery-electric',
	'hybrid',
	'plug-in-hybrid',
	'diesel',
	'flex-fuel',
	'hydrogen',
	'other'
];

/**
 * Mapping from DMV "Fuel Type" field values to our FuelType enum.
 * The DMV dataset uses short codes like "Gasoline", "Battery Electric (BEV)", etc.
 */
export const DMV_FUEL_TYPE_MAP: Record<string, FuelType> = {
	'Gasoline': 'gasoline',
	'Battery Electric (BEV)': 'battery-electric',
	'Hybrid Gasoline': 'hybrid',
	'Plug-in Hybrid (PHEV)': 'plug-in-hybrid',
	'Diesel and Diesel Hybrid': 'diesel',
	'Flex-Fuel': 'flex-fuel',
	'Hydrogen Fuel Cell': 'hydrogen',
	'Natural Gas': 'other',
	'Other': 'other'
};

// ---------------------------------------------------------------------------
// Hardcoded 2024 fallback data (from DMV "Vehicle Fuel Type Count by ZIP")
// ---------------------------------------------------------------------------

export const FALLBACK_DATA_YEAR = 2024;

export const FALLBACK_TOP_MAKES: MakeCount[] = [
	{ make: 'Toyota', count: 26_943 },
	{ make: 'Honda', count: 11_787 },
	{ make: 'Tesla', count: 8_104 },
	{ make: 'Subaru', count: 6_443 },
	{ make: 'Ford', count: 3_624 },
	{ make: 'BMW', count: 3_554 },
	{ make: 'Audi', count: 2_853 },
	{ make: 'Volkswagen', count: 2_628 },
	{ make: 'Mercedes-Benz', count: 2_622 },
	{ make: 'Mazda', count: 1_999 },
	{ make: 'Chevrolet', count: 1_873 },
	{ make: 'Jeep', count: 1_656 },
	{ make: 'Lexus', count: 1_587 },
	{ make: 'Nissan', count: 1_296 },
	{ make: 'Porsche', count: 836 },
	{ make: 'Volvo', count: 708 },
	{ make: 'Rivian', count: 393 },
	{ make: 'Lucid', count: 12 }
];

export const FALLBACK_FUEL_BREAKDOWN: FuelBreakdown[] = [
	{ fuelType: 'gasoline', count: 159_273, pct: 75.6 },
	{ fuelType: 'battery-electric', count: 17_429, pct: 8.3 },
	{ fuelType: 'hybrid', count: 17_032, pct: 8.1 },
	{ fuelType: 'diesel', count: 6_317, pct: 3.0 },
	{ fuelType: 'plug-in-hybrid', count: 5_709, pct: 2.7 },
	{ fuelType: 'flex-fuel', count: 4_739, pct: 2.2 },
	{ fuelType: 'hydrogen', count: 68, pct: 0.03 },
	{ fuelType: 'other', count: 19, pct: 0.01 }
];

export const FALLBACK_TOTAL_VEHICLES = 210_586;

export const FALLBACK_FUN_STATS: DrivewayFunStats = {
	rivian: 393,
	lucid: 12,
	porsche: 836,
	tesla: 8_104,
	hydrogen: 68
};
