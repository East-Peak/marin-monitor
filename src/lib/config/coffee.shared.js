export const COFFEE_SHOPS_DATA = [
	{
		id: 'equator-mill-valley',
		name: 'Equator Coffees',
		address: '2 Miller Ave, Mill Valley',
		town: 'Mill Valley',
		lat: 37.9061,
		lon: -122.5484,
		source: 'toast',
		url: 'https://order.toasttab.com/online/equator-coffees-miller-ave',
		hasCappuccino: true
	},
	{
		id: 'equator-proof-lab',
		name: 'Equator Coffees (Proof Lab)',
		address: '244 Shoreline Hwy, Mill Valley',
		town: 'Mill Valley',
		lat: 37.8817,
		lon: -122.5244,
		source: 'toast',
		url: 'https://order.toasttab.com/online/equator-coffees-proof-lab',
		hasCappuccino: true
	},
	{
		id: 'equator-larkspur',
		name: 'Equator Coffees',
		address: 'Marin Country Mart, Larkspur',
		town: 'Larkspur',
		lat: 37.9475,
		lon: -122.509,
		source: 'toast',
		url: 'https://order.toasttab.com/online/equator-coffees-larkspur',
		hasCappuccino: true
	},
	{
		id: 'equator-sausalito',
		name: 'Equator Coffees',
		address: '1201 Bridgeway, Sausalito',
		town: 'Sausalito',
		lat: 37.859,
		lon: -122.4852,
		source: 'toast',
		url: 'https://order.toasttab.com/online/sausalito-equator',
		hasCappuccino: true
	},
	{
		id: 'equator-roundhouse',
		name: 'Equator Coffees (Roundhouse)',
		address: 'Golden Gate Bridge Plaza',
		town: 'Sausalito',
		lat: 37.8078,
		lon: -122.4757,
		source: 'toast',
		url: 'https://order.toasttab.com/online/equator-coffees-roundhouse-golden-gate-bridge-plaza',
		hasCappuccino: true
	},
	{
		id: 'mcr-san-anselmo',
		name: 'Marin Coffee Roasters',
		address: '546 San Anselmo Ave, San Anselmo',
		town: 'San Anselmo',
		lat: 37.9752,
		lon: -122.5625,
		source: 'toast',
		url: 'https://order.toasttab.com/online/marin-coffee-roasters-san-anselmo-546-san-anselmo-ave',
		hasCappuccino: true
	},
	{
		id: 'longway-san-anselmo',
		name: 'LONGWAY Coffee Shop',
		address: '641 San Anselmo Ave, San Anselmo',
		town: 'San Anselmo',
		lat: 37.9777,
		lon: -122.5689,
		source: 'toast',
		url: 'https://order.toasttab.com/online/longway-coffee-shop',
		hasCappuccino: true
	},
	{
		id: 'good-earth-fairfax',
		name: 'Good Earth Cafe',
		address: '720 Center Blvd, Fairfax',
		town: 'Fairfax',
		lat: 37.9863,
		lon: -122.5832,
		source: 'toast',
		url: 'https://order.toasttab.com/online/good-earth-natural-foods-fairfax',
		hasCappuccino: true
	},
	{
		id: 'mcr-ignacio',
		name: 'Marin Coffee Roasters',
		address: '466 Ignacio Blvd, Novato',
		town: 'Novato',
		lat: 38.0668,
		lon: -122.5434,
		source: 'toast',
		url: 'https://order.toasttab.com/online/marin-coffee-roasters-ignacio-466-ignacio-blvd',
		hasCappuccino: true
	},
	{
		id: 'mcr-novato',
		name: 'Marin Coffee Roasters (Drive-Thru)',
		address: '1551 S Novato Blvd, Novato',
		town: 'Novato',
		lat: 38.0988,
		lon: -122.5704,
		source: 'toast',
		url: 'https://order.toasttab.com/online/marin-coffee-roasters-drive-through-1551-s-novato-blvd',
		hasCappuccino: true
	},
	{
		id: 'firehouse-sausalito',
		name: 'Firehouse Coffee & Tea',
		address: '44 Caledonia St, Sausalito',
		town: 'Sausalito',
		lat: 37.8584,
		lon: -122.4848,
		source: 'html',
		url: 'https://www.firehousecoffeetea.com/menu',
		hasCappuccino: true
	},
	{
		id: 'aroma-san-rafael',
		name: 'Aroma Cafe',
		address: '1122 4th St, San Rafael',
		town: 'San Rafael',
		lat: 37.9733,
		lon: -122.5288,
		source: 'html',
		url: 'https://www.aromacafesanrafael.com/menu',
		hasCappuccino: true
	},
	{
		id: 'fox-kit-san-rafael',
		name: 'Fox & Kit',
		address: '917 4th St, San Rafael',
		town: 'San Rafael',
		lat: 37.9723,
		lon: -122.5213,
		source: 'html',
		url: 'https://www.foxandkit.com/menu',
		hasCappuccino: true,
		supportsLivePriceScrape: false,
		fallbackReason: 'Official menu lists drinks but does not publish current prices.'
	},
	{
		id: 'philz-corte-madera',
		name: 'Philz Coffee',
		address: 'Town Center, Corte Madera',
		town: 'Corte Madera',
		lat: 37.9261,
		lon: -122.5174,
		source: 'html',
		url: 'https://philzcoffee.com/menu/corte-madera/coffee',
		hasCappuccino: false,
		altDrink: 'Pour-Over (Tesora)',
		supportsLivePriceScrape: false,
		fallbackReason: 'Official location menu shows drinks and blends but no drink prices.'
	},
	{
		id: 'red-whale-san-rafael',
		name: 'Red Whale Coffee',
		address: '169 Paul Dr, San Rafael',
		town: 'San Rafael',
		lat: 38.0186,
		lon: -122.5369,
		source: 'html',
		url: 'https://www.redwhalecoffee.com/',
		hasCappuccino: true,
		supportsLivePriceScrape: false,
		fallbackReason: 'Official site highlights the roastery but does not publish current cafe drink prices.'
	}
];

export const CAPPUCCINO_USER_AGENT =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export const COFFEE_INDEX_NAME_DATA = 'Marin Coffee Index';
export const COFFEE_PRIMARY_DRINK_ID = 'cappuccino';

export const COFFEE_INDEX_DRINKS_DATA = [
	{
		id: 'cappuccino',
		label: 'Cappuccino',
		aliases: ['cappuccino'],
		excludeTerms: ['iced']
	},
	{
		id: 'latte',
		label: 'Latte',
		aliases: ['latte', 'caffe latte'],
		excludeTerms: ['iced', 'vanilla', 'mocha', 'matcha', 'chai', 'pumpkin', 'seasonal']
	},
	{
		id: 'flat_white',
		label: 'Flat White',
		aliases: ['flat white'],
		excludeTerms: ['iced']
	},
	{
		id: 'house_coffee',
		label: 'Coffee',
		aliases: [
			'coffee',
			'drip coffee',
			'brewed coffee',
			'house coffee',
			'coffee of the day',
			'batch brew',
			'filter coffee',
			'brew of the day',
			'daily drip'
		],
		excludeTerms: [
			'cold brew',
			'nitro',
			'pour over',
			'pour-over',
			'espresso',
			'americano',
			'latte',
			'cappuccino',
			'chai',
			'matcha',
			'tea',
			'cake',
			'bean',
			'bag',
			'pack',
			'mug',
			'filters',
			'dripper',
			'brewer',
			'instant',
			'protein'
		]
	},
	{
		id: 'pour_over',
		label: 'Pour-Over',
		aliases: ['pour over', 'pour-over', 'pour over coffee'],
		excludeTerms: ['iced']
	}
];

/**
 * Minimum share of live Toast shops that must return a fresh price before the
 * weekly snapshot should advance its "last successful scrape" timestamp.
 */
export const CAPPUCCINO_MIN_FRESH_LIVE_RATIO = 0.5;

/**
 * Minimum share of shops that must return at least one live menu price before
 * the new generic coffee blob advances its freshness timestamp.
 */
export const COFFEE_INDEX_MIN_FRESH_LIVE_MENU_RATIO = 0.5;

export const CAPPUCCINO_HARDCODED_PRICES = {
	'firehouse-sausalito': { price: 5.5, source: 'hardcoded' },
	'fox-kit-san-rafael': { price: 5.5, source: 'hardcoded' },
	'philz-corte-madera': { price: null, altPrice: 5.75, source: 'hardcoded' }
};

export const COFFEE_INDEX_FALLBACK_PRICES = {
	'firehouse-sausalito': { cappuccino: 5.5 },
	'fox-kit-san-rafael': { cappuccino: 5.5 },
	'philz-corte-madera': { pour_over: 5.75 }
};
