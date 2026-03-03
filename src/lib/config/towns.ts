/**
 * Marin County town definitions
 * Used for geo-tagging stories and map placement
 */

import type { Town, MarinRegion } from '$lib/types';

/** Region display order for TownPicker and other grouped views */
export const MARIN_REGIONS: MarinRegion[] = [
	'Southern Marin',
	'Central Marin',
	'San Rafael',
	'Novato',
	'San Geronimo Valley',
	'West Marin'
];

export const MARIN_TOWNS: Town[] = [
	// --- Southern Marin ---
	{
		name: 'Sausalito',
		slug: 'sausalito',
		lat: 37.8591,
		lon: -122.4852,
		pop: 7200,
		incorporated: true,
		zips: ['94965', '94966'],
		region: 'Southern Marin'
	},
	{
		name: 'Mill Valley',
		slug: 'mill-valley',
		lat: 37.906,
		lon: -122.545,
		pop: 14500,
		incorporated: true,
		zips: ['94941', '94942'],
		region: 'Southern Marin'
	},
	{
		name: 'Tiburon',
		slug: 'tiburon',
		lat: 37.8735,
		lon: -122.4567,
		pop: 9400,
		incorporated: true,
		zips: ['94920'],
		region: 'Southern Marin'
	},
	{
		name: 'Belvedere',
		slug: 'belvedere',
		lat: 37.8724,
		lon: -122.4648,
		pop: 2100,
		incorporated: true,
		zips: ['94920'],
		region: 'Southern Marin'
	},
	{
		name: 'Strawberry',
		slug: 'strawberry',
		lat: 37.8975,
		lon: -122.5094,
		pop: 5500,
		incorporated: false,
		zips: ['94941'],
		region: 'Southern Marin'
	},
	{
		name: 'Tam Valley',
		slug: 'tam-valley',
		lat: 37.883,
		lon: -122.5375,
		pop: 12000,
		incorporated: false,
		zips: ['94941'],
		region: 'Southern Marin'
	},
	{
		name: 'Muir Beach',
		slug: 'muir-beach',
		lat: 37.862,
		lon: -122.575,
		pop: 300,
		incorporated: false,
		zips: ['94965'],
		region: 'Southern Marin'
	},
	{
		name: 'Stinson Beach',
		slug: 'stinson-beach',
		lat: 37.8988,
		lon: -122.6344,
		pop: 650,
		incorporated: false,
		zips: ['94970'],
		region: 'Southern Marin'
	},

	// --- Central Marin (Ross Valley / Twin Cities) ---
	{
		name: 'Larkspur',
		slug: 'larkspur',
		lat: 37.9341,
		lon: -122.5353,
		pop: 12500,
		incorporated: true,
		zips: ['94939', '94977'],
		region: 'Central Marin'
	},
	{
		name: 'Corte Madera',
		slug: 'corte-madera',
		lat: 37.9257,
		lon: -122.5275,
		pop: 10000,
		incorporated: true,
		zips: ['94925', '94976'],
		region: 'Central Marin'
	},
	{
		name: 'San Anselmo',
		slug: 'san-anselmo',
		lat: 37.9746,
		lon: -122.5617,
		pop: 12800,
		incorporated: true,
		zips: ['94960'],
		region: 'Central Marin'
	},
	{
		name: 'Fairfax',
		slug: 'fairfax',
		lat: 37.9871,
		lon: -122.5889,
		pop: 7500,
		incorporated: true,
		zips: ['94930', '94978'],
		region: 'Central Marin'
	},
	{
		name: 'Ross',
		slug: 'ross',
		lat: 37.9624,
		lon: -122.555,
		pop: 2500,
		incorporated: true,
		zips: ['94957'],
		region: 'Central Marin'
	},
	{
		name: 'Kentfield',
		slug: 'kentfield',
		lat: 37.9524,
		lon: -122.5564,
		pop: 7000,
		incorporated: false,
		zips: ['94904'],
		region: 'Central Marin'
	},
	{
		name: 'Greenbrae',
		slug: 'greenbrae',
		lat: 37.946,
		lon: -122.5364,
		pop: 5000,
		incorporated: false,
		zips: ['94904'],
		region: 'Central Marin'
	},

	// --- San Rafael area ---
	{
		name: 'San Rafael',
		slug: 'san-rafael',
		lat: 37.9735,
		lon: -122.5311,
		pop: 61000,
		incorporated: true,
		zips: ['94901', '94903', '94912', '94913', '94915'],
		region: 'San Rafael'
	},
	{
		name: 'Terra Linda',
		slug: 'terra-linda',
		lat: 38.005,
		lon: -122.545,
		pop: 9000,
		incorporated: false,
		zips: ['94903'],
		region: 'San Rafael'
	},
	{
		name: 'Lucas Valley',
		slug: 'lucas-valley',
		lat: 38.0278,
		lon: -122.585,
		pop: 3500,
		incorporated: false,
		region: 'San Rafael'
	},
	{
		name: 'Marinwood',
		slug: 'marinwood',
		lat: 38.04,
		lon: -122.545,
		pop: 5000,
		incorporated: false,
		zips: ['94903'],
		region: 'San Rafael'
	},

	// --- Novato ---
	{
		name: 'Novato',
		slug: 'novato',
		lat: 38.1074,
		lon: -122.5697,
		pop: 55000,
		incorporated: true,
		zips: ['94945', '94947', '94948', '94949'],
		region: 'Novato'
	},

	// --- San Geronimo Valley ---
	{
		name: 'Woodacre',
		slug: 'woodacre',
		lat: 38.0082,
		lon: -122.6378,
		pop: 1400,
		incorporated: false,
		zips: ['94973'],
		region: 'San Geronimo Valley'
	},
	{
		name: 'San Geronimo',
		slug: 'san-geronimo',
		lat: 38.0107,
		lon: -122.6611,
		pop: 700,
		incorporated: false,
		zips: ['94963'],
		region: 'San Geronimo Valley'
	},
	{
		name: 'Forest Knolls',
		slug: 'forest-knolls',
		lat: 38.0179,
		lon: -122.6806,
		pop: 350,
		incorporated: false,
		zips: ['94933'],
		region: 'San Geronimo Valley'
	},
	{
		name: 'Lagunitas',
		slug: 'lagunitas',
		lat: 38.0185,
		lon: -122.6944,
		pop: 350,
		incorporated: false,
		zips: ['94938'],
		region: 'San Geronimo Valley'
	},

	// --- West Marin ---
	{
		name: 'Bolinas',
		slug: 'bolinas',
		lat: 37.9096,
		lon: -122.6858,
		pop: 1600,
		incorporated: false,
		zips: ['94924'],
		region: 'West Marin'
	},
	{
		name: 'Point Reyes Station',
		slug: 'point-reyes',
		lat: 38.0699,
		lon: -122.8097,
		pop: 850,
		incorporated: false,
		zips: ['94956'],
		region: 'West Marin'
	},
	{
		name: 'Inverness',
		slug: 'inverness',
		lat: 38.1011,
		lon: -122.8564,
		pop: 1500,
		incorporated: false,
		zips: ['94937'],
		region: 'West Marin'
	},
	{
		name: 'Nicasio',
		slug: 'nicasio',
		lat: 38.0594,
		lon: -122.7028,
		pop: 100,
		incorporated: false,
		zips: ['94946'],
		region: 'West Marin'
	},
	{
		name: 'Tomales',
		slug: 'tomales',
		lat: 38.246,
		lon: -122.9055,
		pop: 200,
		incorporated: false,
		zips: ['94971'],
		region: 'West Marin'
	},
	{
		name: 'Marshall',
		slug: 'marshall',
		lat: 38.1571,
		lon: -122.887,
		pop: 50,
		incorporated: false,
		zips: ['94940'],
		region: 'West Marin'
	}
];

/**
 * Lookup map: slug -> Town
 */
export const TOWN_BY_SLUG: Record<string, Town> = Object.fromEntries(
	MARIN_TOWNS.map((t) => [t.slug, t])
);

/**
 * Lookup map: name (lowercase) -> Town
 */
export const TOWN_BY_NAME: Record<string, Town> = Object.fromEntries(
	MARIN_TOWNS.map((t) => [t.name.toLowerCase(), t])
);

/**
 * Marin County center (for map default view)
 */
export const MARIN_CENTER = { lat: 37.9735, lon: -122.5311 } as const;

/**
 * Marin County approximate bounding box
 */
export const MARIN_BOUNDS = {
	north: 38.32,
	south: 37.82,
	east: -122.35,
	west: -122.95
} as const;
