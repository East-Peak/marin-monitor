import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),

	kit: {
		// Vercel adapter for server-backed API routes and secure key handling
		adapter: adapter({ runtime: 'nodejs22.x' }),
		paths: {
			base: process.env.BASE_PATH || ''
		},
		alias: {
			$lib: 'src/lib',
			$components: 'src/lib/components',
			$stores: 'src/lib/stores',
			$services: 'src/lib/services',
			$config: 'src/lib/config',
			$types: 'src/lib/types'
		},
		csp: {
			mode: 'auto',
			directives: {
				'default-src': ['self'],
				'script-src': ['self'],
				'style-src': ['self', 'unsafe-inline', 'https://fonts.googleapis.com'],
				'worker-src': ['blob:', 'self'],
				'img-src': [
					'self',
					'https://cameras.alertcalifornia.org',
					'https://cwwp2.dot.ca.gov',
					'https://cdns.abclocal.go.com',
					'https://*.cartocdn.com',
					'data:',
					'blob:'
				],
				'connect-src': [
					'self',
					'https://api.weather.gov',
					'https://*.mapbox.com',
					'https://*.maptiler.com',
					'https://*.cartocdn.com',
					'https://earthquake.usgs.gov',
					'https://api.tidesandcurrents.noaa.gov',
					'https://services3.arcgis.com',
					'https://nominatim.openstreetmap.org',
					'https://www.airnowapi.org',
					'https://api.511.org',
					'https://developer.nps.gov',
					'https://api.sunrise-sunset.org',
					'https://currentuvindex.com',
					'https://waterservices.usgs.gov',
					'https://marine.weather.gov',
					'https://incidents.fire.ca.gov',
					'https://marine-api.open-meteo.com',
					'https://api.open-meteo.com',
					'https://data.marincounty.gov'
				],
				'font-src': ['self', 'https://fonts.gstatic.com'],
				'frame-src': ['https://webcams.windy.com']
			}
		}
	}
};

export default config;
