/**
 * Analysis configuration — local correlation topics and narrative patterns for Marin
 */

export interface CorrelationTopic {
	id: string;
	patterns: RegExp[];
	category: string;
}

export interface NarrativePattern {
	id: string;
	keywords: string[];
	category: string;
	severity: 'watch' | 'emerging' | 'spreading';
}

export interface SourceTypes {
	official: string[];
	local_media: string[];
	community: string[];
	satire: string[];
}

export const CORRELATION_TOPICS: CorrelationTopic[] = [
	{
		id: 'fire-season',
		patterns: [/wildfire/i, /fire season/i, /red flag/i, /psps/i, /power shutoff/i, /evacuation/i],
		category: 'Safety'
	},
	{
		id: 'housing-market',
		patterns: [/housing/i, /home sale/i, /median price/i, /real estate/i, /listing/i],
		category: 'Housing'
	},
	{
		id: 'water-supply',
		patterns: [/drought/i, /reservoir/i, /water.*restrict/i, /mmwd/i, /water district/i],
		category: 'Environment'
	},
	{
		id: 'traffic-commute',
		patterns: [
			/101.*traffic/i,
			/commute/i,
			/golden gate.*traffic/i,
			/richmond.*bridge/i,
			/ferry.*delay/i
		],
		category: 'Traffic'
	},
	{
		id: 'development',
		patterns: [
			/zoning/i,
			/development.*project/i,
			/affordable housing/i,
			/adu/i,
			/planning.*commission/i
		],
		category: 'Civic'
	},
	{
		id: 'schools',
		patterns: [/school.*district/i, /tamalpais.*union/i, /college of marin/i, /enrollment/i],
		category: 'Education'
	},
	{
		id: 'sea-level',
		patterns: [/sea level/i, /king tide/i, /flooding.*bay/i, /shoreline/i, /adaptation/i],
		category: 'Environment'
	},
	{
		id: 'trails-parks',
		patterns: [
			/trail.*closure/i,
			/park.*closed/i,
			/muir woods/i,
			/point reyes/i,
			/mt\.*tam/i,
			/open space/i
		],
		category: 'Outdoors'
	},
	{
		id: 'wildlife',
		patterns: [/mountain lion/i, /coyote/i, /whale/i, /shark.*sight/i, /bobcat/i, /elk/i],
		category: 'Nature'
	},
	{
		id: 'budget-tax',
		patterns: [/county.*budget/i, /tax.*measure/i, /parcel tax/i, /sales tax/i, /ballot.*measure/i],
		category: 'Civic'
	}
];

export const NARRATIVE_PATTERNS: NarrativePattern[] = [
	{
		id: 'nimby-housing',
		keywords: ['nimby', 'housing opposition', 'neighborhood character', 'density'],
		category: 'Housing',
		severity: 'watch'
	},
	{
		id: 'fire-preparedness',
		keywords: ['fire preparedness', 'defensible space', 'firewise', 'vegetation management'],
		category: 'Safety',
		severity: 'emerging'
	},
	{
		id: 'water-wars',
		keywords: ['water allocation', 'water rights', 'drought restrictions', 'water rate'],
		category: 'Environment',
		severity: 'watch'
	},
	{
		id: 'ferry-expansion',
		keywords: ['ferry service', 'ferry route', 'golden gate ferry', 'ferry ridership'],
		category: 'Transit',
		severity: 'watch'
	},
	{
		id: 'smart-train',
		keywords: ['smart train', 'smart extension', 'smart ridership', 'sonoma-marin'],
		category: 'Transit',
		severity: 'watch'
	},
	{
		id: 'tourism-pressure',
		keywords: ['overtourism', 'visitor impact', 'parking congestion', 'trail damage'],
		category: 'Community',
		severity: 'emerging'
	},
	{
		id: 'cost-of-living',
		keywords: ['cost of living', 'affordability', 'median income', 'priced out'],
		category: 'Economy',
		severity: 'spreading'
	}
];

export const SOURCE_TYPES: SourceTypes = {
	official: [
		'marin county',
		'city of san rafael',
		'town of fairfax',
		'city of novato',
		'town of san anselmo',
		'city of mill valley',
		'town of corte madera',
		'nws',
		'cal fire',
		'chp',
		'nps',
		'mmwd',
		'usgs'
	],
	local_media: [
		'marin independent journal',
		'marinij',
		'sf chronicle',
		'point reyes light',
		'patch'
	],
	community: ['nextdoor', 'west marin feed', 'marin magazine'],
	satire: ['marin lately']
};
