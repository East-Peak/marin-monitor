import type { CoffeeSource } from '$lib/types/coffee';

/** Blob storage key */
export const CAPPUCCINO_BLOB_KEY = 'marin-cappuccino.json';

/** Max history entries (52 weeks = 1 year at weekly cadence) */
export const MAX_CAPPUCCINO_HISTORY = 52;

/** Scraping timeout per page (ms) — reduced from 30s for Vercel compatibility */
export const TOAST_PAGE_TIMEOUT = 15000;

/** Search term to find cappuccino on Toast menus */
export const CAPPUCCINO_SEARCH_TERM = 'cappuccino';

export interface CoffeeShopConfig {
	id: string;
	name: string;
	address: string;
	town: string;
	lat: number;
	lon: number;
	source: CoffeeSource;
	url: string;
	hasCappuccino: boolean;
	altDrink?: string;
}

export const COFFEE_SHOPS: CoffeeShopConfig[] = [
	{
		id: 'equator-mill-valley',
		name: 'Equator Coffees',
		address: '2 Miller Ave, Mill Valley',
		town: 'Mill Valley',
		lat: 37.9060,
		lon: -122.5480,
		source: 'toast',
		url: 'https://order.toasttab.com/online/equator-coffees-miller-ave',
		hasCappuccino: true
	},
	{
		id: 'equator-proof-lab',
		name: 'Equator Coffees (Proof Lab)',
		address: '244 Shoreline Hwy, Mill Valley',
		town: 'Mill Valley',
		lat: 37.8720,
		lon: -122.5270,
		source: 'toast',
		url: 'https://order.toasttab.com/online/equator-coffees-proof-lab',
		hasCappuccino: true
	},
	{
		id: 'equator-larkspur',
		name: 'Equator Coffees',
		address: 'Marin Country Mart, Larkspur',
		town: 'Larkspur',
		lat: 37.9410,
		lon: -122.5350,
		source: 'toast',
		url: 'https://order.toasttab.com/online/equator-coffees-larkspur',
		hasCappuccino: true
	},
	{
		id: 'equator-sausalito',
		name: 'Equator Coffees',
		address: '1201 Bridgeway, Sausalito',
		town: 'Sausalito',
		lat: 37.8590,
		lon: -122.4850,
		source: 'toast',
		url: 'https://order.toasttab.com/online/sausalito-equator',
		hasCappuccino: true
	},
	{
		id: 'equator-roundhouse',
		name: 'Equator Coffees (Roundhouse)',
		address: 'Golden Gate Bridge Plaza',
		town: 'Sausalito',
		lat: 37.8079,
		lon: -122.4745,
		source: 'toast',
		url: 'https://order.toasttab.com/online/equator-coffees-roundhouse-golden-gate-bridge-plaza',
		hasCappuccino: true
	},
	{
		id: 'mcr-san-anselmo',
		name: 'Marin Coffee Roasters',
		address: '546 San Anselmo Ave, San Anselmo',
		town: 'San Anselmo',
		lat: 37.9748,
		lon: -122.5617,
		source: 'toast',
		url: 'https://order.toasttab.com/online/marin-coffee-roasters-san-anselmo-546-san-anselmo-ave',
		hasCappuccino: true
	},
	{
		id: 'mcr-ignacio',
		name: 'Marin Coffee Roasters',
		address: '466 Ignacio Blvd, Novato',
		town: 'Novato',
		lat: 38.0660,
		lon: -122.5330,
		source: 'toast',
		url: 'https://order.toasttab.com/online/marin-coffee-roasters-ignacio-466-ignacio-blvd',
		hasCappuccino: true
	},
	{
		id: 'mcr-novato',
		name: 'Marin Coffee Roasters (Drive-Thru)',
		address: '1551 S Novato Blvd, Novato',
		town: 'Novato',
		lat: 38.0860,
		lon: -122.5700,
		source: 'toast',
		url: 'https://order.toasttab.com/online/marin-coffee-roasters-drive-through-1551-s-novato-blvd',
		hasCappuccino: true
	},
	{
		id: 'firehouse-sausalito',
		name: 'Firehouse Coffee & Tea',
		address: '44 Caledonia St, Sausalito',
		town: 'Sausalito',
		lat: 37.8590,
		lon: -122.4870,
		source: 'html',
		url: 'https://www.firehousecoffeeandtea.com/menu',
		hasCappuccino: true
	},
	{
		id: 'fox-kit-san-rafael',
		name: 'Fox & Kit',
		address: '917 4th St, San Rafael',
		town: 'San Rafael',
		lat: 37.9735,
		lon: -122.5150,
		source: 'delivery',
		url: 'https://www.doordash.com/store/fox-kit-san-rafael-27819798/',
		hasCappuccino: true
	},
	{
		id: 'philz-corte-madera',
		name: 'Philz Coffee',
		address: 'Town Center, Corte Madera',
		town: 'Corte Madera',
		lat: 37.9250,
		lon: -122.5240,
		source: 'html',
		url: 'https://philzcoffee.order.online/',
		hasCappuccino: false,
		altDrink: 'Pour-Over (Tesora)'
	}
];

export const CAPPUCCINO_SHOPS = COFFEE_SHOPS.filter((s) => s.hasCappuccino);
export const TOAST_SHOPS = COFFEE_SHOPS.filter((s) => s.source === 'toast');
