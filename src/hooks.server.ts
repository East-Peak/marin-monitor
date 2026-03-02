import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
	response.headers.set(
		'Content-Security-Policy',
		[
			"default-src 'self'",
			"script-src 'self' 'unsafe-inline'",
			"style-src 'self' 'unsafe-inline'",
			"worker-src blob: 'self'",
			"img-src 'self' https://cameras.alertcalifornia.org https://cwwp2.dot.ca.gov https://www.windy.com https://*.cartocdn.com data: blob:",
			"connect-src 'self' https://api.weather.gov https://*.mapbox.com https://*.maptiler.com https://*.cartocdn.com https://earthquake.usgs.gov https://api.tidesandcurrents.noaa.gov https://services3.arcgis.com https://nominatim.openstreetmap.org https://www.airnowapi.org https://api.511.org https://developer.nps.gov https://api.sunrise-sunset.org https://currentuvindex.com https://waterservices.usgs.gov https://marine.weather.gov https://incidents.fire.ca.gov https://marine-api.open-meteo.com https://data.marincounty.gov",
			"font-src 'self'",
			"frame-src 'none'"
		].join('; ')
	);
	return response;
};
