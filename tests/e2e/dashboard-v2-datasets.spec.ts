import { expect, test, type Page } from '@playwright/test';

/** Brief/map essentials the v2 owner loads regardless of open sections (spec §13.7). */
const ESSENTIAL = [
	'/api/data/gas-prices',
	'/api/data/ev-charging',
	'/api/data/coffee',
	'/api/data/fitness',
	'/api/news/snapshot',
	'/api/health'
];
const NEVER = /\/api\/(feeds|article|geocode)\b|\/api\/data\/strava/;

function record(page: Page): string[] {
	const seen: string[] = [];
	page.on('request', (req) => seen.push(req.url()));
	return seen;
}
const count = (seen: string[], path: string) =>
	seen.filter((u) => new URL(u).pathname === path).length;

async function openV2(page: Page) {
	await page.goto('/?layout=v2');
	await expect(page.locator('[data-layout="v2"][data-hydrated="true"]')).toBeVisible();
}

test('v2 loads each essential exactly once, never the feed chain or Strava', async ({ page }) => {
	const seen = record(page);
	await openV2(page);
	await expect
		.poll(() => ESSENTIAL.every((p) => count(seen, p) > 0), { timeout: 15_000 })
		.toBe(true);
	await page.waitForTimeout(3_000);
	for (const path of ESSENTIAL) expect(count(seen, path), path).toBe(1);
	expect(seen.filter((u) => NEVER.test(u))).toEqual([]);
});

test('a tab-visible event inside a minute does not refetch; the 5-minute refresh does, once', async ({
	page
}) => {
	await page.clock.install();
	// The browser's own HTTP cache would add stale-while-revalidate background requests
	// (/api/data/* sends s-maxage + stale-while-revalidate, no max-age) that the app never
	// made; serve the essentials uncacheable so the count is the app's own requests.
	await page.route(
		/\/api\/(data\/(gas-prices|ev-charging|coffee|fitness)|news\/snapshot|health)\b/,
		async (route) => {
			const response = await route.fetch();
			await route.fulfill({
				response,
				headers: { ...response.headers(), 'cache-control': 'no-store' }
			});
		}
	);
	const seen = record(page);
	await openV2(page);
	await expect
		.poll(() => ESSENTIAL.every((p) => count(seen, p) === 1), { timeout: 15_000 })
		.toBe(true);
	await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
	await page.waitForTimeout(1_000);
	for (const path of ESSENTIAL) expect(count(seen, path), `${path} after focus`).toBe(1);
	await page.clock.runFor(5 * 60_000 + 1_000);
	await expect
		.poll(() => ESSENTIAL.every((p) => count(seen, p) === 2), { timeout: 15_000 })
		.toBe(true);
	expect(seen.filter((u) => NEVER.test(u))).toEqual([]);
	await page.unrouteAll({ behavior: 'ignoreErrors' });
});
