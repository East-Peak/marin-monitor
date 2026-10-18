import { existsSync, readFileSync } from 'node:fs';
import { expect, test, type Page, type Route } from '@playwright/test';
import { pinAt, settled } from './fixtures/v2-probe';

/**
 * MAPX2c: the old map's remaining layers, each owned and with a status: fitness studios,
 * airports (Getting Around's reads, in its card's words) and road speeds (Mapbox congestion
 * lines, vouched for by their own tiles). The phone reaches the same Layers panel.
 */
test.skip(({ baseURL }) => baseURL?.startsWith('https://') ?? false, 'stubbed');

const T0 = Math.floor(Date.now() / 1000) * 1000;
const MIN = 60_000;
const iso = (ms: number) => new Date(ms).toISOString();
const json = (route: Route, body: unknown) =>
	route.fulfill({
		status: 200,
		contentType: 'application/json',
		headers: { 'X-Data-Source': 'live' },
		body: JSON.stringify(body)
	});
const FITNESS = {
	current: {
		timestamp: iso(T0 - 60 * MIN),
		lastSuccessfulScrapeAt: iso(T0 - 60 * MIN),
		studioCount: 1,
		medianPrice: 30,
		avgPrice: 30,
		minPrice: 30,
		maxPrice: 30,
		medianByType: { yoga: 30 },
		studios: [
			{
				id: 'yoga-1',
				name: 'Sun Yoga',
				town: 'San Rafael',
				type: 'yoga',
				dropInPrice: 30,
				lat: 37.9735,
				lon: -122.5311
			}
		]
	},
	history: []
};
const airport = (code: string) => ({
	code,
	icao: `K${code}`,
	name: code,
	status: 'on-time',
	delays: [],
	weather: null,
	forecastNotes: [],
	tsa: null
});
const AIRPORTS = { lastUpdated: iso(T0 - 3 * MIN), airports: [airport('SFO'), airport('OAK')] };
const TRAFFIC_TILES = /api\.mapbox\.com\/v4\/mapbox\.mapbox-traffic-v1\//;

/** The build has a Mapbox token (vite reads it from these files), so road speeds exist. */
const hasMapboxToken =
	Boolean(process.env.VITE_MAPBOX_TOKEN?.trim()) ||
	['.env', '.env.local', '.env.production', '.env.production.local'].some(
		(f) => existsSync(f) && /^VITE_MAPBOX_TOKEN=\S+/m.test(readFileSync(f, 'utf8'))
	);

/** Fails what the page would otherwise fetch live; `extra` routes are added after, so they win. */
async function open(page: Page, extra: (page: Page) => Promise<unknown> = async () => {}) {
	await page.route(
		/\/api\/(data|nps|transit|health|feeds|article|geocode|calfire|traffic|airport-status|news)\b|earthquake\.usgs\.gov|api\.weather\.gov|tidesandcurrents/,
		(r) => r.fulfill({ status: 503, body: 'stubbed' })
	);
	// Empty but valid vector tiles: the view's tiles load cleanly.
	await page.route(TRAFFIC_TILES, (r) =>
		r.fulfill({ status: 200, contentType: 'application/x-protobuf', body: Buffer.alloc(0) })
	);
	await extra(page);
	await page.goto('/?probe');
	await expect(page.locator('[data-layout="v2"][data-hydrated="true"]')).toBeVisible();
}
const layerRow = (page: Page, id: string) => page.locator(`[data-layer-row="${id}"]`);
const status = (page: Page, id: string) => layerRow(page, id).locator('[data-layer-status]');
const panel = (page: Page) => page.getByRole('complementary', { name: 'In view' });
const prefs = async (page: Page) =>
	JSON.parse((await page.evaluate(() => localStorage.getItem('mm_sections_v2'))) ?? '{}');
const roadOpacity = (page: Page) =>
	page.evaluate(() => {
		const m = (
			window as unknown as {
				__v2ProbeMap?: {
					getLayer(id: string): unknown;
					getLayoutProperty(id: string, p: string): unknown;
					getPaintProperty(id: string, p: string): unknown;
				};
			}
		).__v2ProbeMap;
		const id = 'traffic-congestion-layer';
		return m?.getLayer(id)
			? {
					visibility: m.getLayoutProperty(id, 'visibility') ?? 'visible',
					opacity: m.getPaintProperty(id, 'line-opacity')
				}
			: null;
	});

test.beforeEach(async ({ page }) => {
	await page.clock.install({ time: T0 });
});

test.describe('desktop 1440×900 (MAPX2c)', () => {
	test.use({ viewport: { width: 1440, height: 900 } });

	test('fitness: off by default; on, an ok read is drawn with its source and as-of, and opens in the panel', async ({
		page
	}) => {
		await open(page, (p) => p.route('**/api/data/fitness', (r) => json(r, FITNESS)));
		await settled(page);
		await page.getByRole('button', { name: 'Layers' }).click();
		const box = layerRow(page, 'fitness').getByRole('checkbox');
		await expect(box).not.toBeChecked();
		await box.check();
		await expect.poll(async () => (await settled(page)).synced?.counts['fitness-studios']).toBe(1);
		await expect(status(page, 'fitness')).toHaveText(
			/^Fitness Drop-in Index · as of \d{1,2}:\d{2} [AP]M$/
		);
		await expect(layerRow(page, 'fitness').locator('[data-layer-count]')).toHaveText('1');
		await page.getByRole('button', { name: 'Layers' }).click();
		const at = (await pinAt(page, 'fitness-studios-layer'))!;
		await page.mouse.click(at.x, at.y);
		await expect(panel(page).locator('[data-detail]')).toContainText('Sun Yoga');
		await expect(panel(page).locator('[data-detail]')).toContainText('Drop-in $30');
	});

	test('fitness: a failed read says so, draws nothing and claims no count', async ({ page }) => {
		await open(page);
		await page.getByRole('button', { name: 'Layers' }).click();
		await layerRow(page, 'fitness').getByRole('checkbox').check();
		expect((await settled(page)).synced!.counts['fitness-studios']).toBe(0);
		await expect(status(page, 'fitness')).toHaveText('Fitness Drop-in Index unavailable');
		await expect(layerRow(page, 'fitness').locator('[data-layer-count]')).toHaveCount(0);
	});

	test("airports: on by default, Getting Around's read, a pin in the card's words", async ({
		page
	}) => {
		await open(page, (p) => p.route('**/api/airport-status', (r) => json(r, AIRPORTS)));
		await expect.poll(async () => (await settled(page)).synced?.counts.airports).toBe(2);
		await page.getByRole('button', { name: 'Layers' }).click();
		await expect(layerRow(page, 'airport').getByRole('checkbox')).toBeChecked();
		await expect(status(page, 'airport')).toHaveText(/^FAA · as of \d{1,2}:\d{2} [AP]M$/);
		await page.getByRole('button', { name: 'Layers' }).click();
		await page.evaluate(() =>
			(window as unknown as { __v2ProbeMap: { jumpTo(o: object): void } }).__v2ProbeMap.jumpTo({
				center: [-122.379, 37.6213],
				zoom: 11
			})
		);
		await expect.poll(() => pinAt(page, 'airports-layer')).not.toBeNull();
		const at = (await pinAt(page, 'airports-layer'))!;
		await page.mouse.click(at.x, at.y);
		await expect(panel(page).locator('[data-detail]')).toContainText('SFO · San Francisco Intl');
		await expect(panel(page).locator('[data-detail]')).toContainText('SFO no delays');
	});

	test('airports: a failed read draws no pin and says the card\'s words, never "no delays"', async ({
		page
	}) => {
		await open(page);
		expect((await settled(page)).synced!.counts.airports).toBe(0);
		await page.getByRole('button', { name: 'Layers' }).click();
		await expect(status(page, 'airport')).toHaveText('FAA unavailable');
		await expect(layerRow(page, 'airport').locator('[data-layer-note]')).toHaveText(
			'Airport status unavailable'
		);
		await expect(layerRow(page, 'airport').locator('[data-layer-count]')).toHaveCount(0);
	});

	test.describe('road speeds', () => {
		test.skip(!hasMapboxToken, 'no Mapbox token in this build: the layer and its row are absent');

		test('tiles that load: "Road speeds · Mapbox", on by default, as of the last load, lines drawn', async ({
			page
		}) => {
			await open(page);
			await settled(page);
			await page.getByRole('button', { name: 'Layers' }).click();
			await expect(layerRow(page, 'roads')).toContainText('Road speeds');
			await expect(layerRow(page, 'roads').getByRole('checkbox')).toBeChecked();
			await expect(status(page, 'roads')).toHaveText(/^Mapbox · as of \d{1,2}:\d{2} [AP]M$/);
			await expect(layerRow(page, 'roads').locator('[data-layer-count]')).toHaveCount(0);
			await expect.poll(() => roadOpacity(page)).toMatchObject({ visibility: 'visible' });
			expect((await roadOpacity(page))!.opacity).not.toBe(0);
		});

		test('tiles that fail: "Mapbox unavailable", and no colour left on the roads', async ({
			page
		}) => {
			await open(page, (p) => p.route(TRAFFIC_TILES, (r) => r.fulfill({ status: 403 })));
			await settled(page);
			await page.getByRole('button', { name: 'Layers' }).click();
			await expect(status(page, 'roads')).toHaveText('Mapbox unavailable');
			await expect(layerRow(page, 'roads').locator('[data-layer-note]')).toHaveText(
				'Lines hidden: Mapbox tiles failed to load'
			);
			expect(await roadOpacity(page)).toMatchObject({ opacity: 0 });
		});

		test("drawn lines lose their colour when a later view's tiles fail (Codex MAPX2c minor)", async ({
			page
		}) => {
			let fail = false;
			await open(page, (p) =>
				p.route(TRAFFIC_TILES, (r) =>
					fail
						? r.fulfill({ status: 403 })
						: r.fulfill({
								status: 200,
								contentType: 'application/x-protobuf',
								body: Buffer.alloc(0)
							})
				)
			);
			await settled(page);
			await page.getByRole('button', { name: 'Layers' }).click();
			await expect(status(page, 'roads')).toHaveText(/^Mapbox · as of /);
			expect((await roadOpacity(page))!.opacity).not.toBe(0);
			fail = true;
			await page.evaluate(() =>
				(window as unknown as { __v2ProbeMap: { jumpTo(o: object): void } }).__v2ProbeMap.jumpTo({
					center: [-122.3, 38.3],
					zoom: 12
				})
			);
			await expect(status(page, 'roads')).toHaveText('Mapbox unavailable');
			expect(await roadOpacity(page)).toMatchObject({ opacity: 0 });
		});

		test('the switch persists with the section prefs and hides the lines', async ({ page }) => {
			await open(page);
			await page.getByRole('button', { name: 'Layers' }).click();
			await layerRow(page, 'roads').getByRole('checkbox').uncheck();
			expect(await prefs(page)).toMatchObject({ version: 3, layers: { roads: false } });
			await expect.poll(() => roadOpacity(page)).toMatchObject({ visibility: 'none' });
			await page.reload();
			await expect(page.locator('[data-layout="v2"][data-hydrated="true"]')).toBeVisible();
			await page.getByRole('button', { name: 'Layers' }).click();
			await expect(layerRow(page, 'roads').getByRole('checkbox')).not.toBeChecked();
		});
	});
});

test.describe('phone 390×844 (MAPX2c)', () => {
	test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

	test('the preview loads no data layer; /map has the same Layers panel, and a choice persists (MAPX3)', async ({
		page
	}) => {
		const airportReads: string[] = [];
		page.on('request', (r) => {
			if (r.url().includes('/api/airport-status')) airportReads.push(r.url());
		});
		await open(page, async (p) => {
			await p.route('**/api/airport-status', (r) => json(r, AIRPORTS));
			await p.route('**/api/data/fitness', (r) => json(r, FITNESS));
		});
		await settled(page);
		await expect(page.getByRole('button', { name: 'Layers' })).toBeHidden();
		expect(airportReads).toEqual([]);

		await page.getByRole('link', { name: 'Expand map' }).click();
		await expect(page.locator('[data-layout="explore"][data-hydrated="true"]')).toBeVisible();
		await page.getByRole('button', { name: 'Layers' }).click();
		for (const id of ['traffic', 'fire', 'gas', 'ev', 'coffee', 'fitness', 'airport'])
			await expect(layerRow(page, id)).toBeVisible();
		// Data landing after the tiles must not wipe their evidence (the switch effect's tracking).
		if (hasMapboxToken)
			await expect(status(page, 'roads')).toHaveText(/^Mapbox · as of \d{1,2}:\d{2} [AP]M$/, {
				timeout: 15_000
			});
		await expect(status(page, 'airport')).toHaveText(/^FAA · as of \d{1,2}:\d{2} [AP]M$/);
		expect(airportReads.length).toBeGreaterThan(0);

		await layerRow(page, 'fitness').getByRole('checkbox').check();
		await expect.poll(async () => (await settled(page)).synced?.counts['fitness-studios']).toBe(1);
		expect(await prefs(page)).toMatchObject({ layers: { fitness: true } });
	});
});
