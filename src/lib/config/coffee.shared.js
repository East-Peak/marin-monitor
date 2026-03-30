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
		url: 'https://www.firehousecoffeeandtea.com/menu',
		hasCappuccino: true
	},
	{
		id: 'fox-kit-san-rafael',
		name: 'Fox & Kit',
		address: '917 4th St, San Rafael',
		town: 'San Rafael',
		lat: 37.9723,
		lon: -122.5213,
		source: 'delivery',
		url: 'https://www.doordash.com/store/fox-kit-san-rafael-27819798/',
		hasCappuccino: true
	},
	{
		id: 'philz-corte-madera',
		name: 'Philz Coffee',
		address: 'Town Center, Corte Madera',
		town: 'Corte Madera',
		lat: 37.9261,
		lon: -122.5174,
		source: 'html',
		url: 'https://philzcoffee.order.online/',
		hasCappuccino: false,
		altDrink: 'Pour-Over (Tesora)'
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
		hasCappuccino: true
	}
];

export const CAPPUCCINO_HARDCODED_PRICES = {
	'firehouse-sausalito': { price: 5.5, source: 'hardcoded' },
	'fox-kit-san-rafael': { price: 5.5, source: 'hardcoded' },
	'philz-corte-madera': { price: null, altPrice: 5.75, source: 'hardcoded' }
};
