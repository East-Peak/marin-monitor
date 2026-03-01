/**
 * Location presets for weather, tides, and other location-dependent data.
 *
 * NWS uses lat/lon to resolve a grid point for forecasts.
 * NOAA tide stations are fixed physical locations.
 */

export interface LocationPreset {
	id: string;
	name: string;
	lat: number;
	lon: number;
	/** NOAA tide station ID closest to this location */
	tideStation: string;
	tideStationName: string;
}

export const LOCATION_PRESETS: LocationPreset[] = [
	{
		id: 'central-marin',
		name: 'Central Marin (San Rafael)',
		lat: 37.9735,
		lon: -122.5311,
		tideStation: '9415020',
		tideStationName: 'Point Reyes'
	},
	{
		id: 'mill-valley',
		name: 'Mill Valley',
		lat: 37.906,
		lon: -122.5449,
		tideStation: '9414290',
		tideStationName: 'San Francisco'
	},
	{
		id: 'novato',
		name: 'Novato',
		lat: 38.1074,
		lon: -122.5697,
		tideStation: '9415020',
		tideStationName: 'Point Reyes'
	},
	{
		id: 'sausalito',
		name: 'Sausalito',
		lat: 37.8591,
		lon: -122.4852,
		tideStation: '9414290',
		tideStationName: 'San Francisco'
	},
	{
		id: 'stinson-beach',
		name: 'Stinson Beach',
		lat: 37.8988,
		lon: -122.6434,
		tideStation: '9415020',
		tideStationName: 'Point Reyes'
	},
	{
		id: 'point-reyes',
		name: 'Point Reyes Station',
		lat: 38.0697,
		lon: -122.8097,
		tideStation: '9415020',
		tideStationName: 'Point Reyes'
	},
	{
		id: 'tiburon',
		name: 'Tiburon',
		lat: 37.8735,
		lon: -122.4567,
		tideStation: '9414290',
		tideStationName: 'San Francisco'
	},
	{
		id: 'fairfax',
		name: 'Fairfax',
		lat: 37.987,
		lon: -122.5893,
		tideStation: '9415020',
		tideStationName: 'Point Reyes'
	}
];

export const DEFAULT_LOCATION_ID = 'central-marin';

export function getLocationById(id: string): LocationPreset {
	return (
		LOCATION_PRESETS.find((l) => l.id === id) ??
		LOCATION_PRESETS.find((l) => l.id === DEFAULT_LOCATION_ID)!
	);
}
