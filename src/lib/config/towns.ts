/**
 * Marin County town definitions
 * Used for geo-tagging stories and map placement
 */

import type { Town } from '$lib/types';

export const MARIN_TOWNS: Town[] = [
	// Incorporated cities
	{
		name: 'San Rafael',
		slug: 'san-rafael',
		lat: 37.9735,
		lon: -122.5311,
		pop: 61000,
		incorporated: true,
		zips: ['94901', '94903', '94912', '94913', '94915']
	},
	{
		name: 'Novato',
		slug: 'novato',
		lat: 38.1074,
		lon: -122.5697,
		pop: 55000,
		incorporated: true,
		zips: ['94945', '94947', '94948', '94949']
	},
	{
		name: 'Mill Valley',
		slug: 'mill-valley',
		lat: 37.9060,
		lon: -122.5450,
		pop: 14500,
		incorporated: true,
		zips: ['94941', '94942']
	},
	{
		name: 'San Anselmo',
		slug: 'san-anselmo',
		lat: 37.9746,
		lon: -122.5617,
		pop: 12800,
		incorporated: true,
		zips: ['94960']
	},
	{
		name: 'Larkspur',
		slug: 'larkspur',
		lat: 37.9341,
		lon: -122.5353,
		pop: 12500,
		incorporated: true,
		zips: ['94939', '94977']
	},
	{
		name: 'Corte Madera',
		slug: 'corte-madera',
		lat: 37.9257,
		lon: -122.5275,
		pop: 10000,
		incorporated: true,
		zips: ['94925', '94976']
	},
	{
		name: 'Fairfax',
		slug: 'fairfax',
		lat: 37.9871,
		lon: -122.5889,
		pop: 7500,
		incorporated: true,
		zips: ['94930', '94978']
	},
	{
		name: 'Tiburon',
		slug: 'tiburon',
		lat: 37.8735,
		lon: -122.4567,
		pop: 9400,
		incorporated: true,
		zips: ['94920']
	},
	{
		name: 'Belvedere',
		slug: 'belvedere',
		lat: 37.8724,
		lon: -122.4648,
		pop: 2100,
		incorporated: true,
		zips: ['94920']
	},
	{
		name: 'Ross',
		slug: 'ross',
		lat: 37.9624,
		lon: -122.5550,
		pop: 2500,
		incorporated: true,
		zips: ['94957']
	},
	{
		name: 'Sausalito',
		slug: 'sausalito',
		lat: 37.8591,
		lon: -122.4852,
		pop: 7200,
		incorporated: true,
		zips: ['94965', '94966']
	},

	// Unincorporated communities
	{
		name: 'Stinson Beach',
		slug: 'stinson-beach',
		lat: 37.8988,
		lon: -122.6344,
		pop: 650,
		incorporated: false,
		zips: ['94970']
	},
	{
		name: 'Bolinas',
		slug: 'bolinas',
		lat: 37.9096,
		lon: -122.6858,
		pop: 1600,
		incorporated: false,
		zips: ['94924']
	},
	{
		name: 'Point Reyes Station',
		slug: 'point-reyes',
		lat: 38.0699,
		lon: -122.8097,
		pop: 850,
		incorporated: false,
		zips: ['94956']
	},
	{
		name: 'Inverness',
		slug: 'inverness',
		lat: 38.1011,
		lon: -122.8564,
		pop: 1500,
		incorporated: false,
		zips: ['94937']
	},
	{
		name: 'Woodacre',
		slug: 'woodacre',
		lat: 38.0082,
		lon: -122.6378,
		pop: 1400,
		incorporated: false,
		zips: ['94973']
	},
	{
		name: 'Lagunitas',
		slug: 'lagunitas',
		lat: 38.0185,
		lon: -122.6944,
		pop: 350,
		incorporated: false,
		zips: ['94938']
	},
	{
		name: 'Forest Knolls',
		slug: 'forest-knolls',
		lat: 38.0179,
		lon: -122.6806,
		pop: 350,
		incorporated: false,
		zips: ['94933']
	},
	{
		name: 'San Geronimo',
		slug: 'san-geronimo',
		lat: 38.0107,
		lon: -122.6611,
		pop: 700,
		incorporated: false,
		zips: ['94963']
	},
	{
		name: 'Kentfield',
		slug: 'kentfield',
		lat: 37.9524,
		lon: -122.5564,
		pop: 7000,
		incorporated: false,
		zips: ['94904']
	},
	{
		name: 'Greenbrae',
		slug: 'greenbrae',
		lat: 37.9460,
		lon: -122.5364,
		pop: 5000,
		incorporated: false,
		zips: ['94904']
	},
	{
		name: 'Strawberry',
		slug: 'strawberry',
		lat: 37.8975,
		lon: -122.5094,
		pop: 5500,
		incorporated: false,
		zips: ['94941']
	},
	{
		name: 'Tam Valley',
		slug: 'tam-valley',
		lat: 37.8830,
		lon: -122.5375,
		pop: 12000,
		incorporated: false,
		zips: ['94941']
	},
	{
		name: 'Muir Beach',
		slug: 'muir-beach',
		lat: 37.8620,
		lon: -122.5750,
		pop: 300,
		incorporated: false,
		zips: ['94965']
	},
	{
		name: 'Tomales',
		slug: 'tomales',
		lat: 38.2460,
		lon: -122.9055,
		pop: 200,
		incorporated: false,
		zips: ['94971']
	},
	{
		name: 'Marshall',
		slug: 'marshall',
		lat: 38.1571,
		lon: -122.8870,
		pop: 50,
		incorporated: false,
		zips: ['94940']
	},
	{
		name: 'Nicasio',
		slug: 'nicasio',
		lat: 38.0594,
		lon: -122.7028,
		pop: 100,
		incorporated: false,
		zips: ['94946']
	},
	{
		name: 'Lucas Valley',
		slug: 'lucas-valley',
		lat: 38.0278,
		lon: -122.5850,
		pop: 3500,
		incorporated: false
	},
	{
		name: 'Marinwood',
		slug: 'marinwood',
		lat: 38.0400,
		lon: -122.5450,
		pop: 5000,
		incorporated: false,
		zips: ['94903']
	},
	{
		name: 'Terra Linda',
		slug: 'terra-linda',
		lat: 38.0050,
		lon: -122.5450,
		pop: 9000,
		incorporated: false,
		zips: ['94903']
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
