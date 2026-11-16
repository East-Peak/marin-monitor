import type { Page, Route } from '@playwright/test';

/**
 * Getting Around with every footer link on screen: more road events and Marin Transit alerts
 * than its preview shows (so "N more · Traffic map (511)" and "N more · All transit alerts (511)"
 * appear), and an airport status (its FAA link). Stubbed in the browser, dated to the clock.
 */
export async function stubGettingAround(page: Page) {
	const at = Date.now();
	const iso = (ms: number) => new Date(ms).toISOString();
	const json = (r: Route, body: unknown) =>
		r.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
	const alerts = Array.from({ length: 6 }, (_, i) => ({
		Id: `a${i}`,
		Alert: {
			HeaderText: { Translations: [{ Text: `Night Closure - Stop ${i}` }] },
			DescriptionText: { Translations: [{ Text: 'Due to construction, this stop is closed.' }] },
			InformedEntities: [{ AgencyId: 'MA', StopId: `4000${i}` }],
			ActivePeriods: []
		}
	}));
	await page.route(/\/api\/transit\?/, (r) =>
		new URL(r.request().url()).searchParams.get('agency') === 'MA'
			? json(r, {
					Header: { GtfsRealtimeVersion: '1.0', Timestamp: Math.floor((at - 120_000) / 1000) },
					Entities: alerts
				})
			: r.fulfill({ status: 503, body: 'down' })
	);
	await page.route('**/api/airport-status', (r) =>
		json(r, {
			lastUpdated: iso(at - 180_000),
			airports: ['SFO', 'OAK'].map((code) => ({
				code,
				icao: `K${code}`,
				name: code,
				status: 'on-time',
				delays: [],
				weather: null,
				forecastNotes: [],
				tsa: null
			}))
		})
	);
	await page.route('**/api/traffic/corridors', (r) =>
		json(r, {
			checkedAt: iso(at - 60_000),
			upstreamCount: 40,
			unreadable: 0,
			events: Array.from({ length: 6 }, (_, i) => ({
				id: `511.org/${i}`,
				marin: true,
				corridor: 'to-sfo',
				trip: 'to-sfo',
				closed: false,
				lanes: null,
				certain: true,
				kind: 'Traffic Hazard',
				road: 'US-101',
				where: `Southbound at exit ${i}`,
				severity: 'Moderate',
				reportedAt: iso(at - 25 * 60_000)
			}))
		})
	);
}
