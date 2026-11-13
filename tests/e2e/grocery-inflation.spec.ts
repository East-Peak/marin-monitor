import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { stubCams } from './fixtures/cams';
import { stubCost, stubRest } from './fixtures/v2-populated';
import { openPhone, preparePhone } from './fixtures/phone-audit';
import { groceryInflation } from '../../src/lib/grocery/inflation';
import { parseBlsSeries } from '../../scripts/shared/bls-series.mjs';

/**
 * COSTDATA-2: the Grocery panel (legacy) and the default dashboard's tile lead with SF-area
 * grocery inflation (BLS food at home), a captured real series, with the Marin basket as a
 * dated reference beneath. The index is never dollars.
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

async function checkPanel(page: Page) {
	const panel = page.locator('.signal-grocery-basket');
	await panel.scrollIntoViewIfNeeded();
	await expect(panel.locator('[data-grocery-lead]')).toHaveText('+4.4%');
	await expect(panel).toContainText('over the 12 months to Sep 2026');
	await expect(panel.locator('[data-grocery-latest-yoy="unavailable"]')).toContainText(
		'BLS published no Oct 2025'
	);
	await expect(panel).toContainText('An index, not a price');
	const ref = panel.locator('[data-grocery-reference]');
	await expect(ref).toContainText('$174.93');
	await expect(ref).toContainText('Marin basket, prices as of Nov 1, 2026, no longer updated');
	await expect(panel).not.toContainText(/vs last week|Biggest Movers/);
	// The chart breaks at October 2025 instead of bridging it.
	await expect(panel.locator('[data-grocery-chart] svg path[fill="none"]')).toHaveCount(2);
	await expect(panel.locator('[data-grocery-chart]')).toContainText('Oct 2025 not published');
	expect(await noSideScroll(page)).toBe(true);
	return panel;
}

test.describe('desktop 1440: the legacy Grocery panel', () => {
	test.use({ viewport: { width: 1440, height: 1000 } });

	test('leads with the index, keeps the basket as a dated reference, and reads real months', async ({
		page
	}) => {
		await stub(page, OK);
		await page.goto('/?layout=legacy');
		const panel = await checkPanel(page);
		const chart = panel.locator('[data-grocery-chart]');
		// Hover the right edge (the latest month); the position is taken at the action, after any reflow.
		await chart.hover({ position: { x: 405, y: 80 } });
		await expect(panel.locator('[data-grocery-readout]')).toContainText('Oct 2026');
		// Then the keys, with the pointer away: they step through real months and say the gap.
		await page.mouse.move(2, 2);
		await chart.focus();
		await page.keyboard.press('Escape');
		await page.keyboard.press('ArrowLeft');
		await expect(panel.locator('[data-grocery-readout]')).toContainText('index 356.147');
		for (let i = 0; i < 11; i++) await page.keyboard.press('ArrowLeft');
		await expect(panel.locator('[data-grocery-readout]')).toContainText('no reading');
		const dir = process.env.SHOTS_DIR;
		if (dir) await panel.screenshot({ path: `${dir}/grocery-panel-1440.png` });
	});

	test('shows no index figure at all when BLS cannot be read, and still shows the reference', async ({
		page
	}) => {
		await stub(page, { error: 'blob_unavailable' }, 503);
		await page.goto('/?layout=legacy');
		const panel = page.locator('.signal-grocery-basket');
		await expect(panel).toContainText("SF-area grocery prices can't be read right now");
		await expect(panel.locator('[data-grocery-lead]')).toHaveCount(0);
		await expect(panel.locator('[data-grocery-reference]')).toContainText('$174.93');
	});
});

test.describe('desktop 1440: the default dashboard tile', () => {
	test.use({ viewport: { width: 1440, height: 1000 } });

	test('replaces the basket tile: the index and its month, a grey dated reference, no trend words', async ({
		page
	}) => {
		await stubRest(page);
		await stubCost(page);
		await stubCams(page);
		await stub(page, OK);
		await page.goto('/?layout=v2');
		await expect(page.locator('[data-layout="v2"][data-hydrated="true"]')).toBeVisible();
		const tile = page.locator('#cost [data-tile="grocery"]');
		await expect(tile).toContainText('SF-area grocery inflation');
		await expect(tile).toContainText('+4.4%');
		await expect(tile).toContainText('12 months to Sep 2026');
		await expect(tile).toContainText("its 12-month change isn't published");
		await expect(tile.locator('[data-tile-reference]')).toHaveText(
			'Marin basket $174.93, prices as of Nov 1, 2026, no longer updated'
		);
		await expect(tile).not.toContainText(/Instacart|time not reported|last week/);
		expect(await noSideScroll(page)).toBe(true);
		const dir = process.env.SHOTS_DIR;
		if (dir) await tile.screenshot({ path: `${dir}/grocery-tile-1440.png` });
	});

	test('says unavailable, with no figure, when BLS cannot be read', async ({ page }) => {
		await stubRest(page);
		await stubCost(page);
		await stubCams(page);
		await stub(page, { status: 'unavailable', reason: 'x' });
		await page.goto('/?layout=v2');
		const tile = page.locator('#cost [data-tile="grocery"]');
		await expect(tile).toContainText('Unavailable');
		await expect(tile).not.toContainText('+4.4%');
		await expect(tile.locator('[data-tile-reference]')).toContainText('$174.93');
	});
});

test.describe('@phone the Grocery panel on a phone', () => {
	test('stacks the lead, the stats, the chart and the reference without side scroll', async ({
		page
	}) => {
		await preparePhone(page);
		await stub(page, OK);
		await openPhone(page, '/?layout=legacy', page.locator('.signal-grocery-basket'));
		await checkPanel(page);
	});
});
