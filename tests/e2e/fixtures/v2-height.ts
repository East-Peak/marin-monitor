import { readFileSync } from 'node:fs';
import { expect, type Page, type Route } from '@playwright/test';
import { parseGgAlertsPage } from '../../../src/lib/server/gg-alerts/parse';
import { SOURCES, reportingSnapshot } from './v2-reporting';
import { settled } from './v2-probe';
import { stubCams } from './cams';

/**
 * §13.3 height acceptance at 390×844, shared by the flag-off spec and the Lifestyle Index's
 * populated one (LIFE2, Decision 10): one scenario, one set of limits.
 */
/**
 * Pinned: the page is laid out from this clock, so a moving one moved the height. Every read the
 * page makes is stubbed from it too; a live marine or air read here swung the page 5,418–5,515.
 */
export const T0 = Date.parse('2026-10-31T19:00:00.000Z');
const H = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();
const json = (route: Route, body: unknown, status = 200) =>
	route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const LONG = (topic: string) =>
	`Marin County supervisors weigh a long-debated plan for ${topic}, wildfire defensible space, sea-level rise along Richardson Bay and a bond measure headed to the November ballot`;
const ADVISORY = {
	properties: {
		id: 'urn:oid:2.49.0.1.840.0.height',
		event: 'Coastal Flood Advisory',
		headline: 'Coastal Flood Advisory',
		severity: 'Minor',
		status: 'Actual',
		messageType: 'Alert',
		sent: iso(T0 - H),
		effective: iso(T0 - H),
		expires: iso(T0 + 6 * H),
		ends: iso(T0 + 9 * H),
		references: [],
		geocode: { UGC: ['CAZ506'] }
	}
};
const UNREADABLE = {
	properties: { ...ADVISORY.properties, id: 'urn:broken', expires: null }
};

export async function stub(page: Page) {
	await page.route(
		/\/api\/(data|nps|transit|airport-status|traffic|health|feeds|article|geocode)\b|earthquake\.usgs\.gov|api\.weather\.gov\/(points|gridpoints|stations)|tidesandcurrents/,
		(r) => r.fulfill({ status: 503, body: 'stubbed' })
	);
	await page.route(/api\.weather\.gov\/alerts\/active/, (r) =>
		json(r, { features: [ADVISORY, UNREADABLE] })
	);
	await page.route('**/api/news/snapshot', (r) =>
		r.fulfill({
			status: 200,
			contentType: 'application/json',
			body: reportingSnapshot(T0, [
				{ slug: 'h1', title: LONG('housing'), source: SOURCES.ij, hoursAgo: 1 },
				{ slug: 'h2', title: LONG('transit'), source: SOURCES.nbc, hoursAgo: 2 },
				{ slug: 'h3', title: LONG('schools'), source: SOURCES.ptReyes, hoursAgo: 2.5 },
				{ slug: 'h4', title: LONG('water'), source: SOURCES.pacificSun, hoursAgo: 4 },
				{ slug: 'h5', title: LONG('parks'), source: SOURCES.ij, hoursAgo: 5 }
			])
		})
	);
	await stubCams(page, { lastModified: T0 - 240_000 });
	await stubOutdoorsFixed(page);
}

/** Outdoors' tallest honest state: a wave reading with its chart, an air reading, a long fire. */
async function stubOutdoorsFixed(page: Page) {
	const hours = Array.from({ length: 72 }, (_, i) => i);
	await page.route(/marine-api\.open-meteo\.com/, (r) =>
		json(r, {
			hourly: {
				time: hours.map((i) => (T0 + i * H) / 1000),
				wave_height: hours.map((i) => 4 + Math.sin(i / 6)),
				wave_period: hours.map(() => 12),
				wave_direction: hours.map(() => 250)
			}
		})
	);
	await page.route(/\/api\/air-quality\b/, (r) =>
		json(r, {
			aqi: 18,
			category: 'Good',
			color: '#00e400',
			pollutant: 'OZONE',
			area: 'San Rafael',
			observedAt: T0 - H,
			timestamp: T0
		})
	);
	await page.route(/services3\.arcgis\.com/, (r) => json(r, { features: [] }));
	await page.route('**/api/calfire', (r) =>
		json(r, {
			features: [
				{
					geometry: { type: 'Point', coordinates: [-122.3, 38.4] },
					properties: {
						Name: 'Long Named Prescribed Burn Unit',
						Final: false,
						Updated: iso(T0 - 2 * H),
						Started: iso(T0 - 24 * H),
						County: 'Napa',
						AcresBurned: 30,
						PercentContained: null,
						Latitude: 38.4,
						Longitude: -122.3,
						Type: 'Wildfire',
						UniqueId: 'height-fire',
						IsActive: 'true'
					}
				}
			]
		})
	);
}

export type HeightMode = 'first visit' | 'every section saved open' | 'every camera down';

/**
 * Loads the page in `mode` and holds it to §13.3's limits. `routes` adds routes after the stubs
 * (a later route wins); `populated` waits for extra content before anything is measured.
 */
export async function phoneHeight(
	page: Page,
	mode: HeightMode,
	{
		routes = async () => {},
		populated = async () => {}
	}: { routes?: (page: Page) => Promise<void>; populated?: (page: Page) => Promise<void> } = {}
) {
	await page.clock.install({ time: T0 });
	if (mode === 'every section saved open') {
		await page.addInitScript(() =>
			localStorage.setItem(
				'mm_sections_v2',
				JSON.stringify({
					version: 2,
					open: {
						'getting-around': true,
						outdoors: true,
						news: true,
						cost: true,
						events: true,
						strava: true
					}
				})
			)
		);
	}
	await stub(page);
	if (mode === 'every section saved open') {
		await page.route(/\/api\/transit\?/, (r) =>
			json(r, {
				Header: { Timestamp: Math.floor((T0 - 120_000) / 1000) },
				Entities: Array.from({ length: 4 }, (_, i) => ({
					Id: `h${i}`,
					Alert: { HeaderText: { Translations: [{ Text: LONG(`bus detour ${i}`) }] } }
				}))
			})
		);
		// goldengate.org's list of 2026-10-23, through the producer's parser (GGALERT1).
		await page.route('**/api/data/gg-alerts', (r) =>
			json(r, {
				checkedAt: iso(T0 - 300_000),
				lastSuccessfulScrapeAt: iso(T0 - 300_000),
				alerts: parseGgAlertsPage(
					readFileSync('src/lib/server/__fixtures__/gg-alerts-2026-10-23.html', 'utf8')
				).alerts,
				lastFailure: null
			})
		);
		await page.route('**/api/airport-status', (r) =>
			json(r, {
				lastUpdated: iso(T0 - 180_000),
				airports: ['SFO', 'OAK'].map((code) => ({
					code,
					icao: `K${code}`,
					name: code,
					status: 'ground-delay',
					delays: [{ type: 'ground-delay', avgMinutes: 45, maxMinutes: 90 }, { type: 'notice' }],
					weather: null,
					forecastNotes: [],
					tsa: null
				}))
			})
		);
		await page.route('**/api/traffic/corridors', (r) =>
			json(r, {
				checkedAt: iso(T0 - 60_000),
				upstreamCount: 40,
				unreadable: 0,
				events: Array.from({ length: 4 }, (_, i) => ({
					id: `511.org/h${i}`,
					group: 'to-oak',
					certain: true,
					kind: 'Traffic Collision',
					road: 'I-580',
					where: LONG(`lane ${i}`),
					severity: 'Major',
					reportedAt: iso(T0 - 600_000)
				}))
			})
		);
	}
	if (mode === 'every camera down') await stubCams(page, { fail: () => true }); // later route wins
	await routes(page);
	await page.goto('/?probe');
	await expect(page.locator('[data-layout="v2"][data-hydrated="true"]')).toBeVisible();
	await page.evaluate(() => document.fonts.ready);
	// Two failures need the 10 s retry before the all-down notice (Codex r2 #5).
	if (mode === 'every camera down') {
		await expect(page.locator('[data-cams-notice]')).toBeVisible({ timeout: 30_000 });
	} else {
		const tile = page.locator('section#cams [data-camera-id]').first();
		await expect(tile).toBeVisible({ timeout: 30_000 });
		await expect(tile).toHaveAttribute('data-status', 'live', { timeout: 30_000 });
	}
	await populated(page);
	await settled(page); // every part settled; the map drew the latest revision (Codex r3 #5)
	await expect(page.locator('[data-brief-link="getting-around"]')).toBeVisible(); // Decision 7: measured with the link
	// The fixture content that makes the page tall must be on screen before measuring.
	await expect(page.locator('[data-slot="advisories"]')).toContainText("couldn't be read");
	await expect(page.locator('[data-slot="latest-reporting"]')).toContainText('Partial coverage');
	await expect(page.locator('[data-slot="map-status"] [data-section-status]')).toBeVisible();
	const rows = page.locator('[data-reporting-row]');
	await expect(rows).toHaveCount(5);
	await expect(rows.nth(2)).toContainText('schools');
	const bottom = await rows
		.nth(2)
		.evaluate((el) => el.getBoundingClientRect().bottom + window.scrollY);
	// Decision 6: the strip has its own cap; everything else keeps §13.3's 1,266.
	const strip = await page.evaluate(
		() =>
			document.querySelector('section#map')!.getBoundingClientRect().top -
			document.querySelector('section#cams')!.getBoundingClientRect().top
	);
	console.log(
		`[${mode}] 3rd Latest-reporting item bottom: ${Math.round(bottom)} px; Cams strip ${Math.round(strip)} px; without the strip ${Math.round(bottom - strip)} px (strip ≤ 220; rest ≤ 1,266)`
	);
	expect(strip).toBeLessThanOrEqual(220);
	expect(bottom - strip).toBeLessThanOrEqual(1266);
	if (mode === 'every section saved open') {
		// §13.3: with every disclosure open the whole document is ≤ 5,498 (no strip exemption: Codex r1
		// #8). Re-baselined from 5,110 on Stuart's ruling, 2026-10-30 (COST0): the approved receipt, its
		// total, the highlight and the 44 px way measure exactly 5,498 on this worst-case fixture,
		// with the tallest household on the card and the clock and every read pinned (SWEEP1).
		const ga = page.locator('section#getting-around');
		await expect(ga.locator('[data-ga="roads"] [data-row]')).toHaveCount(3);
		await expect(ga.locator('[data-ga="transit"] [data-row]')).toHaveCount(3, {
			timeout: 15_000
		});
		await expect(ga.locator('[data-line="OAK"]')).toContainText('Ground delay');
		// Every section really is open before the document is measured (Codex B2 #3); Strava
		// renders only when enabled, so every toggle on the page is checked too.
		for (const id of ['getting-around', 'outdoors', 'news', 'cost', 'events'])
			await expect(page.locator(`[data-section-toggle="${id}"]`), id).toHaveAttribute(
				'aria-expanded',
				'true'
			);
		await expect(page.locator('[data-section-toggle][aria-expanded="false"]')).toHaveCount(0);
		const doc = await page.evaluate(() => document.documentElement.scrollHeight);
		console.log(`[${mode}] document ${doc} px (≤ 5,498, Getting Around populated)`);
		expect(doc).toBeLessThanOrEqual(5498);
	}
}
