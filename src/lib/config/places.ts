/**
 * The reviewed gazetteer (NEWSPIN2): the places a headline may name precisely enough to place a
 * story. Every map landmark, every reviewed show venue, and a short list of Marin areas, each
 * with the precision its point can bear: a building is a `venue`; a bay, beach, park, peak or
 * bridge is an `area`, drawn as a halo. Points were checked against OpenStreetMap (the review
 * table is in the NEWSPIN2 progress log); a landmark venue whose map point is off its building
 * carries the reviewed point here, and the map's landmarks are left as they are.
 */
import { LANDMARKS } from './map';
import { VENUES } from './venues';

export interface Place {
	id: string;
	name: string;
	/** Other whole phrases that name this place in a headline. */
	aliases: readonly string[];
	lat: number;
	lon: number;
	precision: 'venue' | 'area';
	townSlug?: string;
}

const slug = (name: string) =>
	name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');

/** How each landmark is placed, and the reviewed point where its map point is off. */
const LANDMARK_REVIEW: Record<
	string,
	Pick<Place, 'precision' | 'aliases'> & {
		townSlug?: string;
		point?: { lat: number; lon: number };
	}
> = {
	'Golden Gate Bridge': { precision: 'area', aliases: [] },
	'Richmond-San Rafael Bridge': { precision: 'area', aliases: [] },
	'Mt. Tamalpais': {
		precision: 'area',
		aliases: ['Mt Tamalpais', 'Mount Tamalpais', 'Mt. Tam', 'Mt Tam', 'Mount Tam']
	},
	'Point Reyes Lighthouse': {
		precision: 'venue',
		aliases: [],
		point: { lat: 37.9956, lon: -123.0232 }
	},
	'Muir Woods': { precision: 'area', aliases: ['Muir Woods National Monument'] },
	'Larkspur Ferry Terminal': {
		precision: 'venue',
		aliases: [],
		townSlug: 'larkspur',
		point: { lat: 37.9445, lon: -122.5086 }
	},
	'Sausalito Ferry Terminal': {
		precision: 'venue',
		aliases: [],
		townSlug: 'sausalito',
		point: { lat: 37.8562, lon: -122.4777 }
	},
	'Tomales Bay': { precision: 'area', aliases: [] },
	'Bolinas Lagoon': { precision: 'area', aliases: [] },
	'Richardson Bay': { precision: 'area', aliases: [] },
	'China Camp': { precision: 'area', aliases: ['China Camp State Park'], townSlug: 'san-rafael' },
	'SMART Train — Larkspur': {
		precision: 'venue',
		aliases: ['Larkspur SMART station'],
		townSlug: 'larkspur',
		point: { lat: 37.9467, lon: -122.5131 }
	},
	'SMART Train — San Rafael': {
		precision: 'venue',
		aliases: ['San Rafael Transit Center', 'San Rafael SMART station'],
		townSlug: 'san-rafael'
	},
	'SMART Train — Marin Civic Center': {
		precision: 'venue',
		aliases: ['Civic Center SMART station'],
		townSlug: 'san-rafael'
	},
	'SMART Train — Novato Hamilton': {
		precision: 'venue',
		aliases: ['Hamilton SMART station'],
		townSlug: 'novato'
	},
	'SMART Train — Novato Downtown': {
		precision: 'venue',
		aliases: ['Downtown Novato SMART station'],
		townSlug: 'novato',
		point: { lat: 38.106, lon: -122.5645 }
	},
	'SMART Train — Novato San Marin': {
		precision: 'venue',
		aliases: ['San Marin SMART station'],
		townSlug: 'novato'
	}
};

/** The reviewed areas beyond the landmarks: OpenStreetMap's point for each. */
const AREAS: readonly Place[] = [
	{
		id: 'angel-island',
		name: 'Angel Island',
		aliases: ['Angel Island State Park'],
		lat: 37.8629,
		lon: -122.4303,
		precision: 'area',
		townSlug: 'tiburon'
	},
	{
		id: 'marin-headlands',
		name: 'Marin Headlands',
		aliases: [],
		lat: 37.8557,
		lon: -122.5337,
		precision: 'area'
	},
	{
		id: 'point-reyes-national-seashore',
		name: 'Point Reyes National Seashore',
		aliases: ['Bear Valley Visitor Center'],
		lat: 38.0411,
		lon: -122.8003,
		precision: 'area'
	},
	{
		id: 'limantour-beach',
		name: 'Limantour Beach',
		aliases: ['Limantour'],
		lat: 38.0244,
		lon: -122.8791,
		precision: 'area'
	},
	{
		id: 'drakes-beach',
		name: 'Drakes Beach',
		aliases: ['Drake’s Beach'],
		lat: 38.0253,
		lon: -122.9644,
		precision: 'area'
	},
	{
		id: 'rodeo-beach',
		name: 'Rodeo Beach',
		aliases: [],
		lat: 37.8305,
		lon: -122.5365,
		precision: 'area'
	},
	{
		id: 'samuel-p-taylor-state-park',
		name: 'Samuel P. Taylor State Park',
		aliases: ['Samuel P Taylor State Park', 'Samuel P. Taylor', 'Samuel P Taylor'],
		lat: 38.0246,
		lon: -122.7312,
		precision: 'area',
		townSlug: 'lagunitas'
	},
	{
		id: 'mount-burdell',
		name: 'Mount Burdell',
		aliases: ['Mt. Burdell', 'Mt Burdell'],
		lat: 38.1337,
		lon: -122.5942,
		precision: 'area',
		townSlug: 'novato'
	},
	{
		id: 'phoenix-lake',
		name: 'Phoenix Lake',
		aliases: [],
		lat: 37.9535,
		lon: -122.5742,
		precision: 'area',
		townSlug: 'ross'
	},
	{
		id: 'lake-lagunitas',
		name: 'Lake Lagunitas',
		aliases: [],
		lat: 37.9459,
		lon: -122.5962,
		precision: 'area'
	},
	{
		id: 'mcnears-beach',
		name: 'McNears Beach',
		aliases: ['McNear’s Beach', 'McNears Beach Park'],
		lat: 37.9928,
		lon: -122.4535,
		precision: 'area',
		townSlug: 'san-rafael'
	},
	{
		id: 'marin-county-civic-center',
		name: 'Marin County Civic Center',
		aliases: ['Marin Civic Center'],
		lat: 37.998,
		lon: -122.5307,
		precision: 'area',
		townSlug: 'san-rafael'
	}
];

/**
 * Names that contain a place's name but aren't the place: a school, a college, an agency, a
 * district. A headline naming one of these names no place.
 */
export const NOT_PLACES: readonly string[] = [
	'Mount Tam School',
	'Mt. Tam School',
	'Mt Tam School',
	'Mount Tamalpais College',
	'Golden Gate Bridge District',
	'Golden Gate Bridge, Highway and Transportation District',
	'Richardson Bay Regional Agency'
];

export const PLACES: readonly Place[] = [
	...LANDMARKS.map((l): Place => {
		const review = LANDMARK_REVIEW[l.name];
		if (!review) throw new Error(`no gazetteer review for the landmark ${l.name}`);
		const { point = l, ...rest } = review;
		return { id: slug(l.name), name: l.name, lat: point.lat, lon: point.lon, ...rest };
	}),
	...VENUES.map(
		(v): Place => ({
			id: v.id,
			name: v.name,
			aliases: v.aliases,
			lat: v.lat,
			lon: v.lon,
			precision: 'venue',
			townSlug: v.townSlug
		})
	),
	...AREAS
];
