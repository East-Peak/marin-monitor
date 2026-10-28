import type { Page } from '@playwright/test';
import { SOURCES, reportingSnapshot } from './v2-reporting';

/**
 * The v2 page's reads with real shapes (plan-dashboard-desktop Goals 2–4, MAPX1), shared by the
 * desktop spec and TEXT1's visuals check: everything else fails fast (stubRest first; a later
 * route wins).
 */
export const stubRest = (page: Page) =>
	page.route(
		/\/api\/(data|nps|transit|airport-status|health|feeds|article|geocode)\b|\/api\/news\/snapshot|earthquake\.usgs\.gov|api\.weather\.gov|tidesandcurrents/,
		(r) => r.fulfill({ status: 503, body: 'stubbed' })
	);

/** Outdoors' reads with real shapes (Goal 2): NWS points + hourly, marine, fires, USGS 7 d, AQI. */
export async function stubOutdoors(page: Page) {
	const H = 3_600_000;
	const hour0 = Math.floor(Date.now() / H) * H;
	const json = (body: unknown) => ({
		status: 200,
		contentType: 'application/json',
		body: JSON.stringify(body)
	});
	await page.route(/api\.weather\.gov\/points\//, (r) =>
		r.fulfill(json({ properties: { gridId: 'MTR', gridX: 83, gridY: 115 } }))
	);
	await page.route(/api\.weather\.gov\/gridpoints\/MTR\/83,115\/forecast\/hourly/, (r) =>
		r.fulfill(
			json({
				properties: {
					updateTime: new Date(hour0 - H).toISOString(),
					periods: Array.from({ length: 72 }, (_, i) => ({
						startTime: new Date(hour0 + i * H).toISOString(),
						endTime: new Date(hour0 + (i + 1) * H).toISOString(),
						temperature: 55 + Math.round(12 * Math.sin((i / 24) * 2 * Math.PI)),
						temperatureUnit: 'F',
						probabilityOfPrecipitation: { value: i % 7 === 0 ? 20 : 0 }
					}))
				}
			})
		)
	);
	await page.route(/marine-api\.open-meteo\.com/, (r) =>
		r.fulfill(
			json({
				hourly: {
					time: Array.from({ length: 72 }, (_, i) => (hour0 + i * H) / 1000),
					wave_height: Array.from({ length: 72 }, (_, i) => 4 + Math.sin(i / 6)),
					wave_period: Array.from({ length: 72 }, () => 12),
					wave_direction: Array.from({ length: 72 }, () => 250)
				}
			})
		)
	);
	await page.route(/\/api\/calfire|services3\.arcgis\.com/, (r) =>
		r.fulfill(json({ features: [] }))
	);
	await page.route(/earthquake\.usgs\.gov/, (r) =>
		r.fulfill(json({ features: [], metadata: { generated: Date.now() } }))
	);
	await page.route(/\/api\/air-quality\b/, (r) =>
		r.fulfill(
			json({
				aqi: 14,
				category: 'Good',
				color: '#00e400',
				pollutant: 'OZONE',
				area: 'San Rafael',
				observedAt: hour0 - H,
				timestamp: Date.now()
			})
		)
	);
}

/** Cost's reads with real shapes (Goal 3): a gas week of 4-hourly readings, fitness with history. */
export async function stubCost(page: Page) {
	const H = 3_600_000;
	const now = Date.now();
	const json = (body: unknown) => ({
		status: 200,
		contentType: 'application/json',
		body: JSON.stringify(body)
	});
	const gas = (i: number) => ({
		timestamp: new Date(now - i * 4 * H).toISOString(),
		lastSuccessfulScrapeAt: new Date(now - i * 4 * H).toISOString(),
		stationCount: 2,
		avgRegular: 6.3 + i * 0.002,
		avgMidgrade: null,
		avgPremium: 6.9,
		avgDiesel: 6.6,
		minRegular: 5.8,
		maxRegular: 6.9,
		stations: [5.9, 6.4].map((price, k) => ({
			placeId: `p${k}`,
			name: `Station ${k}`,
			address: `${k} Main St, San Rafael`,
			lat: 37.97,
			lon: -122.53,
			fuelPrices: [{ type: 'REGULAR_UNLEADED', price }]
		}))
	});
	const history = Array.from({ length: 50 }, (_, i) => gas(i));
	await page.route(/\/api\/data\/gas-prices\b/, (r) =>
		r.fulfill(json({ current: history[0], history }))
	);
	const fit = (daysAgo: number, median: number) => ({
		timestamp: new Date(now - daysAgo * 24 * H).toISOString(),
		lastSuccessfulScrapeAt: new Date(now - daysAgo * 24 * H).toISOString(),
		studioCount: 16,
		medianPrice: median,
		avgPrice: median,
		minPrice: 20,
		maxPrice: 45,
		medianByType: { yoga: 30 },
		studios: []
	});
	await page.route(/\/api\/data\/fitness\b/, (r) =>
		r.fulfill(json({ current: fit(1, 32), history: [fit(1, 32), fit(31, 31), fit(61, 30)] }))
	);
}

/** News & Civic, Events and Marin Lately reads with real shapes (Goal 4). */
export async function stubCivic(page: Page) {
	const H = 3_600_000;
	const now = Date.now();
	const json = (body: unknown) => ({
		status: 200,
		contentType: 'application/json',
		body: JSON.stringify(body)
	});
	const stories = Array.from({ length: 20 }, (_, i) => ({
		slug: `w${i}`,
		title: `Marin story number ${i + 1} on the county wire`,
		source: i % 2 ? SOURCES.ij : SOURCES.ptReyes,
		hoursAgo: i + 1
	}));
	const lately = [
		// The band shows only with a piece ≤ 30 days old (DASH-FLIP1).
		{ slug: 'promo', title: 'Quick Update for Our Subscribers', hoursAgo: 2 * 24 },
		{ slug: 'l1', title: 'Mother Nature Actually Kind of a Bitch', hoursAgo: 3 * 24 },
		{ slug: 'l2', title: 'Northern Spotted Owl Misgendered', hoursAgo: 40 * 24 }
	].map((l) => ({ ...l, source: SOURCES.lately }));
	await page.route('**/api/news/snapshot', (r) =>
		r.fulfill({
			status: 200,
			contentType: 'application/json',
			body: reportingSnapshot(now, [...stories, ...lately])
		})
	);
	const iso = (ms: number) => new Date(ms).toISOString();
	await page.route(/\/api\/data\/311\b/, (r) =>
		r.fulfill(
			json({
				lastUpdated: iso(now - H),
				count: 4,
				issues: ['Illegal Dumping', 'Illegal Dumping', 'Trees', 'Sidewalks'].map((summary, i) => ({
					id: 900 + i,
					status: 'Acknowledged',
					summary,
					description: 'x',
					lat: 37.97,
					lng: -122.53,
					address: `${i + 1} Fourth St, San Rafael, CA`,
					created_at: iso(now - (i * 30 + 2) * H),
					html_url: `https://seeclickfix.com/issues/${900 + i}`
				}))
			})
		)
	);
	const item = (id: string, title: string, category: string, at: number, source: string) => ({
		id,
		title,
		link: `https://events.example/${id}`,
		pubDate: iso(at),
		timestamp: at,
		source,
		category,
		verification: 'official'
	});
	await page.route(/\/api\/data\/activity\b/, (r) =>
		r.fulfill(
			json([
				item('s1', 'Jazz Night | Sweetwater', 'shows', now + 5 * H, 'Sweetwater Music Hall'),
				item('s2', 'Bluegrass Brunch', 'shows', now + 50 * H, 'Rancho Nicasio'),
				item('s3', 'Film Night', 'shows', now + 100 * H, 'Osher Marin JCC'),
				item(
					'r1',
					'Dipsea Race 2027 · Sunday, June 13, 2027',
					'endurance',
					now + 240 * 24 * H,
					'Dipsea Race'
				)
			])
		)
	);
	await page.route(/\/api\/data\/police-logs\b/, (r) =>
		r.fulfill(json([item('p1', 'ROAD CLOSURE: Grant Ave', 'safety', now - 2 * H, 'Novato PD')]))
	);
}

/** The brief's own reads with real shapes (MAPX1): 12 h of KDVO, NOAA hi/lo + hourly, marine. */
export async function stubBrief(page: Page) {
	const H = 3_600_000;
	const now = Date.now();
	const json = (body: unknown) => ({
		status: 200,
		contentType: 'application/json',
		body: JSON.stringify(body)
	});
	const gmt = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ');
	await page.route(/stations\/KDVO\/observations/, (r) =>
		r.fulfill(
			json({
				features: Array.from({ length: 36 }, (_, i) => ({
					properties: {
						timestamp: new Date(now - i * 20 * 60_000).toISOString(),
						textDescription: 'Clear',
						temperature: { value: 12 + Math.sin(i / 6) * 4, qualityControl: 'V' }
					}
				}))
			})
		)
	);
	await page.route(/tidesandcurrents\.noaa\.gov/, (r) => {
		const day0 = Math.floor(now / (24 * H)) * 24 * H - 24 * H;
		const hourly =
			r.request().url().includes('interval=h&') || /interval=h$/.test(r.request().url());
		const predictions = hourly
			? Array.from({ length: 96 }, (_, i) => ({
					t: gmt(day0 + i * H),
					v: (3 + 2.5 * Math.cos((i * 2 * Math.PI) / 12.4)).toFixed(3)
				}))
			: Array.from({ length: 16 }, (_, i) => ({
					t: gmt(day0 + i * 6.2 * H),
					v: i % 2 ? '0.500' : '5.500',
					type: i % 2 ? 'L' : 'H'
				}));
		return r.fulfill(json({ predictions }));
	});
	await page.route(/api\.weather\.gov\/alerts\/active/, (r) =>
		r.fulfill(
			json({
				features: [
					{
						properties: {
							id: 'urn:oid:mapx1-beach',
							event: 'Beach Hazards Statement',
							headline: 'Beach Hazards Statement',
							description: '* WHAT...Sneaker waves.',
							instruction: 'Never turn your back on the ocean.',
							severity: 'Moderate',
							status: 'Actual',
							messageType: 'Alert',
							sent: new Date(now - H).toISOString(),
							effective: new Date(now - H).toISOString(),
							expires: new Date(now + 6 * H).toISOString(),
							ends: new Date(now + 30 * H).toISOString(),
							references: [],
							geocode: { UGC: ['CAZ505'] }
						}
					}
				]
			})
		)
	);
	await stubOutdoors(page);
}
