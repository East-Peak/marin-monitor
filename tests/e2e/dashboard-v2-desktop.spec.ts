import { expect, test, type Page } from '@playwright/test';
import { stubCams } from './fixtures/cams';
import { stubBrief, stubCivic, stubCost, stubOutdoors, stubRest } from './fixtures/v2-populated';

/**
 * Desktop frame (plan-dashboard-desktop Goal 1): full width to 2,240 px, sections always
 * open with no disclosure, and the cam wall under the map. The phone keeps the strip.
 * Screenshots land in SHOTS_DIR when it is set (gate 3), never in the repo.
 */
test.skip(({ baseURL }) => baseURL?.startsWith('https://') ?? false, 'stubbed');

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

	test('brief is three columns and the map is 62vh tall (MAPX2)', async ({ page }) => {
		await open(page);
		const cols = await page
			.locator('[data-slot="brief"]')
			.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').map(parseFloat));
		expect(cols).toHaveLength(3);
		// 5fr · 4fr · 3fr
		expect(cols[0] / cols[2]).toBeCloseTo(5 / 3, 1);
		expect(cols[1] / cols[2]).toBeCloseTo(4 / 3, 1);
		// clamp(520px, 62vh, 820px) at 1000 px high.
		expect(Math.round((await box(page, '.v2-map-canvas')).height)).toBe(620);
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
	test.use({ viewport: { width: 1800, height: 1400 } });
	test('the map stops at 820 px tall (MAPX2 clamp)', async ({ page }) => {
		await open(page);
		expect(Math.round((await box(page, '.v2-map-canvas')).height)).toBe(820);
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
		// The three-source card names each source on its row; the other cards keep one foot (TEXT1 1d).
		await expect(page.locator('#outdoors [data-card-source]')).toHaveCount(3);
		await expect(page.locator('#outdoors [data-card="ground"]')).toContainText('None near');
		await expect(page.locator('#outdoors [data-row="air"]')).toContainText('14 · Good');
		await expect(page.locator('#outdoors [data-row="air"] .sr-meta')).toContainText(
			'AirNow · as of'
		);
		await expect(page.locator('#outdoors [data-card="surf"]')).toContainText(
			'Open-Meteo marine forecast'
		);
		const dir = process.env.SHOTS_DIR;
		if (dir) await page.locator('#outdoors').screenshot({ path: `${dir}/outdoors-1440.png` });
	});
});

test.describe('desktop 1440: Cost & Character (Goal 3)', () => {
	test.use({ viewport: { width: 1440, height: 1000 } });

	test('the gas card shows a real 7-day change; sparklines render; failed reads say so', async ({
		page
	}) => {
		await stubRest(page);
		await stubCost(page);
		await stubCams(page);
		await page.goto('/?layout=v2');
		await expect(page.locator('[data-layout="v2"][data-hydrated="true"]')).toBeVisible();
		const cost = page.locator('#cost');
		const change = cost.locator('[data-card="gas"] [data-stat="change7"] [data-text-role="value"]');
		await expect(change).toHaveText(/^[+−-]\$0\.\d{3}$|—/);
		await expect(change).toHaveText('−$0.084');
		expect(await cost.locator('[data-spark] path').count()).toBeGreaterThanOrEqual(1);
		// The composite and the other sub-indexes are stubbed down: never $0.
		await expect(cost.locator('[data-card="composite"]')).toContainText('Unavailable');
		await expect(cost.locator('[data-tile="school"]')).toContainText('Unavailable');
		await expect(cost.locator('[data-card-source]').first()).toBeVisible();
		await expect(cost).not.toContainText('later release');
		const dir = process.env.SHOTS_DIR;
		if (dir) await cost.screenshot({ path: `${dir}/cost-1440.png` });
	});
});

for (const width of [1440, 2000]) {
	test.describe(`desktop ${width}: News & Civic, Events, Marin Lately (Goal 4)`, () => {
		test.use({ viewport: { width, height: 1000 } });

		test('News and Events share a row; Lately spans the grid; no "later" placeholder', async ({
			page
		}) => {
			await stubRest(page);
			await stubCivic(page);
			await stubCams(page);
			await page.goto('/?layout=v2');
			await expect(page.locator('[data-layout="v2"][data-hydrated="true"]')).toBeVisible();
			await expect(page.getByText(/later release/)).toHaveCount(0);

			await expect(page.locator('#news [data-section-meta]')).toHaveText(/^\d+ of \d+ feeds OK$/);
			await expect(page.locator('#news [data-wire-row]')).toHaveCount(12);
			await expect(page.locator('#news [data-card="fixit"] [data-day]').first()).toBeVisible();
			await expect(page.locator('#events [data-show-day]')).toHaveCount(10);
			await expect(page.locator('[data-slot="lately"]')).toContainText(
				'Mother Nature Actually Kind of a Bitch'
			);
			await expect(page.locator('[data-slot="lately"]')).not.toContainText('quiet');
			await expect(page.locator('[data-slot="lately"]')).not.toContainText('Subscribers');
			await expect(page.locator('[data-slot="sources-footer"]')).toBeVisible();

			// The layout, once the sections have their content, read in one go: separate reads
			// straddled the sections' loading reflows and disagreed by up to 17 px.
			const { news, events, grid, lately, cost } = await page.evaluate(() => {
				const rect = (sel: string) => {
					const r = document.querySelector(sel)!.getBoundingClientRect();
					return { x: r.x, y: r.y, width: r.width, height: r.height };
				};
				return {
					news: rect('#news'),
					events: rect('#events'),
					grid: rect('#sections'),
					lately: rect('[data-slot="lately"]'),
					cost: rect('#cost')
				};
			});
			expect(Math.abs(news.y - events.y)).toBeLessThanOrEqual(4);
			expect(news.x).toBeLessThan(events.x);
			expect(news.width).toBeGreaterThan(events.width);
			expect(Math.abs(lately.width - grid.width)).toBeLessThanOrEqual(2);
			// Between Cost and News, as in the mockup.
			expect(lately.y).toBeGreaterThan(cost.y);
			expect(lately.y + lately.height).toBeLessThanOrEqual(news.y);

			const dir = process.env.SHOTS_DIR;
			if (dir) {
				await page
					.locator('[data-slot="lately"]')
					.screenshot({ path: `${dir}/lately-${width}.png` });
				await page.locator('#news').screenshot({ path: `${dir}/news-${width}.png` });
				await page.locator('#events').screenshot({ path: `${dir}/events-${width}.png` });
			}
		});
	});
}

test.describe('narrow desktop 1100: Cost tiles four across (Goal 3)', () => {
	test.use({ viewport: { width: 1100, height: 1000 } });

	test('the sub-index tiles are four across below 1700 px', async ({ page }) => {
		await open(page);
		const cols = await page
			.locator('#cost .idx')
			.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
		expect(cols).toBe(4);
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

for (const width of [1440, 2000]) {
	test.describe(`desktop ${width}: the top of the page (MAPX1)`, () => {
		test.use({ viewport: { width, height: 1000 } });

		test('the brief is compact, its three slots all answer, and the map starts high', async ({
			page
		}) => {
			await stubRest(page);
			await stubBrief(page);
			await stubCams(page);
			await page.goto('/?layout=v2');
			await expect(page.locator('[data-layout="v2"][data-hydrated="true"]')).toBeVisible();
			const brief = page.locator('[data-slot="brief"]');
			await expect(brief.locator('[data-chart="trace"] path[data-line]')).toHaveAttribute(
				'd',
				/^M/
			);
			await expect(brief.locator('[data-chart="tide"] circle[data-event]').first()).toBeVisible();
			await expect(brief.locator('[data-card="ocean"]')).toHaveAttribute('data-state', 'ok');

			// Three grid slots, each holding an answer: no empty third slot.
			const slots = brief.locator(':scope > *');
			await expect(slots).toHaveCount(3);
			for (const slot of await slots.all()) {
				const b = (await slot.boundingBox())!;
				expect(b.height).toBeGreaterThan(60);
				expect((await slot.innerText()).trim().length).toBeGreaterThan(10);
			}
			const tops = await Promise.all(
				(await slots.all()).map(async (s) => (await s.boundingBox())!.y)
			);
			expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(2);

			await expect(brief.locator('a[data-card="getting-around"]')).toBeVisible();
			const jump = page.locator('nav.v2-jump-desk');
			await expect(jump.locator('a')).toHaveCount(6);
			expect((await jump.boundingBox())!.height).toBeLessThanOrEqual(40);
			// The advisory is a chip sized to its text, never a full-width box.
			const chip = page.locator('[data-slot="advisories"] button[data-advisory]');
			await expect(chip).toContainText('Beach Hazards Statement · North Bay coast · until');
			expect((await chip.boundingBox())!.width).toBeLessThan(width / 2);

			expect((await brief.boundingBox())!.height).toBeLessThanOrEqual(260);
			if (width === 1440) expect((await box(page, '#v2-map-title')).y).toBeLessThanOrEqual(520);
		});
	});
}

test.describe('desktop 1440: the advisory reader (MAPX1)', () => {
	test.use({ viewport: { width: 1440, height: 1000 } });

	test('a chip opens the NWS text; Esc closes it and focus returns to the chip', async ({
		page
	}) => {
		await stubRest(page);
		await stubBrief(page);
		await stubCams(page);
		await page.goto('/?layout=v2');
		const chip = page.locator('[data-slot="advisories"] button[data-advisory]');
		await chip.click();
		const dialog = page.getByRole('dialog', { name: 'Beach Hazards Statement' });
		await expect(dialog).toContainText('Never turn your back on the ocean.');
		await expect(dialog.getByRole('button', { name: 'Close' })).toBeFocused();
		await page.keyboard.press('Escape');
		await expect(dialog).toHaveCount(0);
		await expect(chip).toBeFocused();
		const dir = process.env.SHOTS_DIR;
		if (dir) await page.screenshot({ path: `${dir}/mapx1-top-1440.png` });
	});
});
