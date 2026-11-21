import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { stubCams } from './fixtures/cams';
import { stubCost, stubRest } from './fixtures/v2-populated';
import { groceryInflation } from '../../src/lib/grocery/inflation';
import { parseBlsSeries } from '../../scripts/shared/bls-series.mjs';

/**
 * COSTDATA-2: the dashboard's Grocery tile leads with SF-area grocery inflation (BLS food at
 * home), a captured real series, with the Marin basket as a dated reference beneath. The index
 * is never dollars.
 */
test.skip(({ baseURL }) => baseURL?.startsWith('https://') ?? false, 'stubbed');

const bls = parseBlsSeries(
	JSON.parse(readFileSync('tests/fixtures/costdata/bls-cuurs49bsaf11.json', 'utf8'))
);
const READ_AT = '2026-11-12T15:00:00.000Z';
const OK = groceryInflation(
	{ current: { lastSuccessfulScrapeAt: READ_AT, url: 'https://data.bls.gov', ...bls } },
	new Date('2026-11-13T12:00:00Z')
);
const snap = (timestamp: string, total: number) => ({
	timestamp,
	lastSuccessfulScrapeAt: timestamp,
	totalCheapest: total,
	totalExpensive: total + 34,
	itemsFound: 12,
	items: [
		{
			itemId: 'eggs',
			itemName: 'Vital Farms Pasture-Raised Large Eggs, 12 ct',
			cheapest: 6.57,
			cheapestStore: 'Walmart',
			mostExpensive: 7.49,
			mostExpensiveStore: 'Sprouts',
			storePrices: []
		}
	]
});
const BASKET = {
	current: snap('2026-11-01T17:11:00.000Z', 174.93),
	history: [snap('2026-11-01T17:11:00.000Z', 174.93), snap('2026-10-11T17:11:00.000Z', 174.45)],
	frozen: { asOf: '2026-11-01T17:11:00.000Z', noLongerUpdated: true }
};

async function stub(page: Page, index: unknown, status = 200) {
	await page.addInitScript(() => localStorage.setItem('mm_onboardingComplete', 'true'));
	await page.route(/\/api\/data\/grocery-inflation\b/, (r) =>
		r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(index) })
	);
	await page.route(/\/api\/data\/grocery-basket\b/, (r) =>
		r.fulfill({ contentType: 'application/json', body: JSON.stringify(BASKET) })
	);
}

const noSideScroll = (page: Page) =>
	page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test.describe('desktop 1440: the default dashboard tile', () => {
	test.use({ viewport: { width: 1440, height: 1000 } });

	test('a readable chart: the 12-month change and its months, October’s change labelled, the basket a footnote (COSTX1)', async ({
		page
	}) => {
		await stubRest(page);
		await stubCost(page);
		await stubCams(page);
		await stub(page, OK);
		await page.goto('/');
		await expect(page.locator('[data-layout="v2"][data-hydrated="true"]')).toBeVisible();
		const tile = page.locator('#cost [data-tile="grocery"]');
		await expect(tile).toContainText('SF-area grocery inflation');
		await expect(tile.locator('[data-headline]')).toHaveText('+4.4%');
		await expect(tile.locator('[data-headline-span]')).toHaveText('Sep 2025 → Sep 2026');
		await expect(tile.locator('[data-month-change]')).toHaveText(
			'+2.1%Sep → Oct 2026, not seasonally adjusted'
		);
		await expect(tile.locator('[data-newest-note]')).toContainText(
			'Oct 2026 index 363.6: its 12-month change isn’t published.'
		);
		await expect(tile.locator('[data-newest-note]')).toContainText('lapse in appropriations');
		// The missing month is drawn as a gap, labelled, never bridged.
		await expect(tile.locator('[data-gap="2025-10"]')).toHaveText('Oct 2025 not published');
		const paths = await tile
			.locator('[data-inflation-line]')
			.evaluate((p) => (p.getAttribute('d')!.match(/M/g) ?? []).length);
		expect(paths).toBe(2);
		// Drawn at its own width: the axis text is 12 CSS px, never scaled down (Codex).
		const scale = await tile
			.locator('[data-inflation-chart]')
			.evaluate(
				(svg) => svg.getBoundingClientRect().width / (svg as SVGSVGElement).viewBox.baseVal.width
			);
		expect(scale).toBeCloseTo(1, 1);
		// The basket is a footnote under the source, worded as it was.
		const foot = tile.locator('[data-tile-reference]');
		await expect(foot).toHaveText(
			'Marin basket $174.93, prices as of Nov 1, 2026, no longer updated'
		);
		const src = (await tile.locator('[data-card-source]').boundingBox())!;
		expect((await foot.boundingBox())!.y).toBeGreaterThanOrEqual(src.y + src.height - 1);
		// Wider than a spark tile: two of the row's columns.
		const coffee = (await page.locator('#cost [data-tile="coffee"]').boundingBox())!;
		expect((await tile.boundingBox())!.width).toBeGreaterThan(coffee.width * 1.8);
		await expect(tile).not.toContainText(/Instacart|time not reported|last week/);
		expect(await noSideScroll(page)).toBe(true);
	});

	test('the keyboard reads each month, the missing one as missing with its reason (R10)', async ({
		page
	}) => {
		await stubRest(page);
		await stubCost(page);
		await stubCams(page);
		await stub(page, OK);
		await page.goto('/');
		const slider = page.locator('#cost [data-tile="grocery"] [role="slider"]');
		await slider.focus();
		await page.keyboard.press('End');
		const readout = page.locator('#cost [data-tile="grocery"] [data-readout]');
		await expect(readout).toHaveText('363.6 · Oct 2026 · index');
		for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowLeft');
		await expect(readout).toHaveText(
			'Missing · Oct 2025 · Data unavailable due to the 2025 lapse in appropriations'
		);
		await page.keyboard.press('ArrowLeft');
		await expect(readout).toContainText('Sep 2025 · index');
	});

	test('says unavailable, with no figure, when BLS cannot be read', async ({ page }) => {
		await stubRest(page);
		await stubCost(page);
		await stubCams(page);
		await stub(page, { status: 'unavailable', reason: 'x' });
		await page.goto('/');
		const tile = page.locator('#cost [data-tile="grocery"]');
		await expect(tile).toContainText('Unavailable');
		await expect(tile).not.toContainText('+4.4%');
		await expect(tile.locator('[data-tile-reference]')).toContainText('$174.93');
	});
});
