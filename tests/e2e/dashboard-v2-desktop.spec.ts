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
