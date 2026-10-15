import { expect, test, type Page } from '@playwright/test';
import { stubCams } from './fixtures/cams';

/**
 * Desktop frame (plan-dashboard-desktop Goal 1): full width to 2,240 px, sections always
 * open with no disclosure, and the cam wall under the map. The phone keeps the strip.
 * Screenshots land in SHOTS_DIR when it is set (gate 3), never in the repo.
 */
test.skip(({ baseURL }) => baseURL?.startsWith('https://') ?? false, 'stubbed');

const stubRest = (page: Page) =>
	page.route(
		/\/api\/(data|nps|transit|airport-status|health|feeds|article|geocode)\b|\/api\/news\/snapshot|earthquake\.usgs\.gov|api\.weather\.gov|tidesandcurrents/,
		(r) => r.fulfill({ status: 503, body: 'stubbed' })
	);
async function open(page: Page) {
	await stubRest(page);
	await stubCams(page);
	await page.goto('/?layout=v2');
	await expect(page.locator('[data-layout="v2"][data-hydrated="true"]')).toBeVisible();
}
/** Outdoors' reads with real shapes (Goal 2): NWS points + hourly, marine, fires, USGS 7 d. */
async function stubOutdoors(page: Page) {
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
}
const box = async (page: Page, sel: string) => (await page.locator(sel).first().boundingBox())!;

for (const width of [1440, 2000]) {
	test.describe(`desktop ${width}`, () => {
		test.use({ viewport: { width, height: 1000 } });

		test('full width, sections always open with no disclosure, cam wall below the map', async ({
			page
		}) => {
			await open(page);
			const main = await box(page, 'main');
			if (width === 1440) expect(main.width).toBeGreaterThan(1300);
			expect(main.width).toBeLessThanOrEqual(2240);
			expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
				width
			);

			const sections = page.locator('[data-section]');
			expect(await sections.count()).toBeGreaterThanOrEqual(5);
			await expect(page.locator('[data-section] [aria-expanded]')).toHaveCount(0);
			await expect(page.locator('[data-section-toggle]')).toHaveCount(0);
			await expect(page.locator('[data-section][data-open="false"]')).toHaveCount(0);

			await expect(page.locator('.cams-row')).toHaveCount(0);
			const wall = page.locator('[data-slot="cam-wall"]');
			await expect(wall).toBeVisible();
			const map = await box(page, '#map');
			expect((await wall.boundingBox())!.y).toBeGreaterThanOrEqual(map.y + map.height - 1);
			await expect(wall.locator('[data-camera-id]')).toHaveCount(21);

			const dir = process.env.SHOTS_DIR;
			if (dir) await page.screenshot({ path: `${dir}/desktop-${width}.png`, fullPage: true });
		});
	});
}

test.describe('desktop 1440: the frame', () => {
	test.use({ viewport: { width: 1440, height: 1000 } });

	test('brief is three columns and the map is 500 px tall', async ({ page }) => {
		await open(page);
		const cols = await page
			.locator('[data-slot="brief"]')
			.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').map(parseFloat));
		expect(cols).toHaveLength(3);
		// 5fr · 4fr · 3fr
		expect(cols[0] / cols[2]).toBeCloseTo(5 / 3, 1);
		expect(cols[1] / cols[2]).toBeCloseTo(4 / 3, 1);
		expect(Math.round((await box(page, '.v2-map-canvas')).height)).toBe(500);
	});

	test('South Marin leads the wall at 4 of 6 columns, its first tile a 2×2 block', async ({
		page
	}) => {
		await open(page);
		const south = await box(page, '[data-cam-group="south"]');
		const central = await box(page, '[data-cam-group="central"]');
		expect(Math.abs(south.y - central.y)).toBeLessThanOrEqual(4);
		expect(south.width).toBeGreaterThan(central.width * 1.8);
		const lead = await box(page, '[data-cam-group="south"] li:first-child');
		const next = await box(page, '[data-cam-group="south"] li:nth-child(2)');
		expect(lead.width).toBeGreaterThan(next.width * 1.8);
		expect(lead.height).toBeGreaterThan(next.height * 1.8);
		// Exactly two 16:9 rows and the gap: the lead tile never stretches its rows.
		expect(lead.height).toBeLessThanOrEqual(next.height * 2 + 12);
		const fifth = await box(page, '[data-cam-group="south"] li:nth-child(5)');
		expect(Math.abs(lead.y + lead.height - (fifth.y + fifth.height))).toBeLessThanOrEqual(2);
	});
});

test.describe('desktop 1700+', () => {
	test.use({ viewport: { width: 1800, height: 1000 } });
	test('the map is 540 px tall', async ({ page }) => {
		await open(page);
		expect(Math.round((await box(page, '.v2-map-canvas')).height)).toBe(540);
	});
});

test.describe('desktop 1440: Outdoors beside Getting Around (Goal 2)', () => {
	test.use({ viewport: { width: 1440, height: 1000 } });

	test('Outdoors and Getting Around share a row; the temperature chart has a path', async ({
		page
	}) => {
		await stubRest(page);
		await stubOutdoors(page);
		await stubCams(page);
		await page.goto('/?layout=v2');
		await expect(page.locator('[data-layout="v2"][data-hydrated="true"]')).toBeVisible();
		const out = await box(page, '#outdoors');
		const ga = await box(page, '#getting-around');
		expect(Math.abs(out.y - ga.y)).toBeLessThanOrEqual(4);
		expect(out.x).toBeLessThan(ga.x);
		expect(out.width).toBeGreaterThan(ga.width);
		const path = page.locator('#outdoors [data-card="forecast"] svg path').first();
		await expect(path).toHaveAttribute('d', /\S/);
		await expect(page.locator('#outdoors [data-card-source]')).toHaveCount(4);
		await expect(page.locator('#outdoors [data-card="ground"]')).toContainText('None near');
		await expect(page.locator('#outdoors [data-card="surf"]')).toContainText(
			'Open-Meteo marine forecast'
		);
		const dir = process.env.SHOTS_DIR;
		if (dir) await page.locator('#outdoors').screenshot({ path: `${dir}/outdoors-1440.png` });
	});
});

test.describe('very wide 2600', () => {
	test.use({ viewport: { width: 2600, height: 1000 } });
	test('the page stops at 2,240 px', async ({ page }) => {
		await open(page);
		expect(Math.round((await box(page, 'main')).width)).toBe(2240);
	});
});

test.describe('narrow desktop 1100 (the mockup ≤1279 fallbacks)', () => {
	test.use({ viewport: { width: 1100, height: 900 } });
	test('brief and map stack; the wall has two columns; sections stay open with no toggle', async ({
		page
	}) => {
		await open(page);
		const cols = await page
			.locator('[data-slot="brief"]')
			.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
		expect(cols).toBe(1);
		const map = await box(page, '.v2-map-canvas');
		const latest = await box(page, '#map .v2-map-row > :last-child');
		expect(latest.y).toBeGreaterThanOrEqual(map.y + map.height - 1);
		const south = await box(page, '[data-cam-group="south"]');
		const central = await box(page, '[data-cam-group="central"]');
		expect(central.y).toBeGreaterThan(south.y + south.height - 1);
		await expect(page.locator('[data-section-toggle]')).toHaveCount(0);
		expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
			1100
		);
	});
});

test.describe('narrow desktop 1100: Outdoors and Getting Around stack (Goal 2)', () => {
	test.use({ viewport: { width: 1100, height: 1000 } });

	test('Getting Around above Outdoors, both full width', async ({ page }) => {
		await open(page);
		const out = await box(page, '#outdoors');
		const ga = await box(page, '#getting-around');
		expect(out.y).toBeGreaterThan(ga.y + ga.height - 1);
		expect(Math.abs(out.width - ga.width)).toBeLessThanOrEqual(2);
	});
});

test.describe('phone 390', () => {
	test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

	test('keeps the cam strip; no cam wall; sections still collapse', async ({ page }) => {
		await open(page);
		await expect(page.locator('section#cams .cams-row')).toBeVisible();
		await expect(page.locator('[data-slot="cam-wall"]')).toHaveCount(0);
		await expect(page.locator('[data-section-toggle="news"]')).toHaveAttribute(
			'aria-expanded',
			'false'
		);
	});
});
