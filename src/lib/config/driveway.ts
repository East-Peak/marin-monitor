// src/lib/config/driveway.ts

import type { FuelType } from '$lib/types/driveway';

/** Blob storage key */
export const DRIVEWAY_BLOB_KEY = 'marin-driveway.json';

/** Max history entries (one per data year, ~10 years of DMV data) */
export const MAX_DRIVEWAY_HISTORY = 10;

/** Accent color (indigo -- vehicle/tech feel) */
export const DRIVEWAY_ACCENT = '#6366f1';

/** Accent color with transparency for area fills */
export const DRIVEWAY_ACCENT_FILL = 'rgba(99, 102, 241, 0.1)';

/** California open-data CKAN API. */
export const CKAN_API_BASE = 'https://data.ca.gov/api/3/action';

/**
 * DMV "Vehicle Fuel Type Count by Zip Code". A new CSV resource is added each
 * year and old ones are retired, so the resource is resolved via package_show.
 */
export const DMV_PACKAGE_ID = 'vehicle-fuel-type-count-by-zip-code';

/** Columns the aggregate SQL reads; the resource must have all of them. */
export const DMV_REQUIRED_COLUMNS = ['ZIP Code', 'Fuel', 'Make', 'Vehicles'] as const;

/** All Marin County ZIP codes (30 ZIPs) */
export const MARIN_ZIPS = [
	'94901',
	'94903',
	'94904',
	'94920',
	'94925',
	'94929',
	'94930',
	'94933',
	'94937',
	'94938',
	'94939',
	'94940',
	'94941',
	'94945',
	'94946',
	'94947',
	'94949',
	'94950',
	'94956',
	'94957',
	'94960',
	'94963',
	'94964',
	'94965',
	'94966',
	'94970',
	'94971',
	'94973',
	'94978',
	'94979'
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
	gasoline: '#94a3b8', // slate
	'battery-electric': '#22c55e', // green
	hybrid: '#3b82f6', // blue
	'plug-in-hybrid': '#8b5cf6', // purple
	diesel: '#f59e0b', // amber
	'flex-fuel': '#f97316', // orange
	hydrogen: '#06b6d4', // cyan
	other: '#6b7280' // gray
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
	Gasoline: 'gasoline',
	'Battery Electric': 'battery-electric',
	'Battery Electric (BEV)': 'battery-electric',
	'Hybrid Gasoline': 'hybrid',
	'Plug-in Hybrid': 'plug-in-hybrid',
	'Plug-in Hybrid (PHEV)': 'plug-in-hybrid',
	'Diesel and Diesel Hybrid': 'diesel',
	'Flex-Fuel': 'flex-fuel',
	'Hydrogen Fuel Cell': 'hydrogen',
	'Natural Gas': 'other',
	Other: 'other'
};

/**
 * Marin total from the 1/1/2024 DMV release, the reference for a plausibility
 * check: a live total far from it means a broken query, not a changed county.
 */
export const MARIN_2024_TOTAL_VEHICLES = 210_586;
export const MARIN_TOTAL_TOLERANCE = 0.15;
