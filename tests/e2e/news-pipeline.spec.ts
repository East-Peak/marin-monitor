/**
 * The shared news pipeline in the BUILT app (npm run build && preview):
 * frozen feeds → lazy parser chunk → stores → dashboard Local Wire and the
 * TV Local News Wire, including a failing parser chunk. Only the network is
 * faked; the chunk is the real built asset.
 */
import { expect, test, type Page } from '@playwright/test';

const PRL = 'https://www.ptreyeslight.com/feed/';
const HOUR = 3_600_000;
const rss = (items: string) =>
	`<?xml version="1.0"?><rss version="2.0"><channel><title>t</title>${items}</channel></rss>`;
const item = (title: string, link: string, pubDate?: string) =>
	`<item><title>${title}</title><link>${link}</link>${pubDate ? `<pubDate>${pubDate}</pubDate>` : ''}</item>`;

const DATED = 'Point Reyes oyster farm reopens';
const UNDATED = 'Undated Point Reyes notice';

/** Frozen feeds; `failParser` = how many times the parser chunk fetch fails (Infinity = always). */
async function setup(page: Page, failParser = 0) {
	await page.addInitScript(() => {
		localStorage.setItem('mm_onboardingComplete', 'true');
		localStorage.setItem('mm_tip_banner_dismissed', 'true');
	});
	await page.route('**/api/feeds?*', (route) => {
		const url = new URL(route.request().url()).searchParams.get('url');
		const body =
			url === PRL
				? rss(
						item(
							DATED,
							'https://www.ptreyeslight.com/a',
							new Date(Date.now() - HOUR).toUTCString()
						) + item(UNDATED, 'https://www.ptreyeslight.com/b')
					)
				: rss('');
		return route.fulfill({ status: 200, contentType: 'application/rss+xml', body });
	});
	await page.route(/\/api\/(article|geocode)/, (route) => route.fulfill({ status: 404, body: '' }));
	let failuresLeft = failParser;
	await page.route('**/_app/immutable/**/*.js', async (route) => {
		const response = await route.fetch();
		const body = await response.text();
		if (body.includes('onopentag') && failuresLeft > 0) {
			failuresLeft -= 1;
			return route.abort('failed');
		}
		return route.fulfill({ response, body });
	});
	// Count document navigations, not 'load' events: a reload can start before
	// the first document ever fires 'load'.
	const loads = { count: 0 };
	page.on('request', (request) => {
		if (request.isNavigationRequest() && request.frame() === page.mainFrame()) loads.count += 1;
	});
	return loads;
}

const wire = (page: Page) => page.locator('[data-panel-id="local-wire"] .news-item');

async function expectDashboardWire(page: Page) {
	await expect(wire(page).locator('.item-title')).toHaveText([DATED, UNDATED], { timeout: 20_000 });
	await expect(wire(page).locator('.item-time')).toHaveText(['1h', 'undated']);
}

test.describe('shared news pipeline — built app', () => {
	test.use({ viewport: { width: 1440, height: 900 } });

	test('dashboard Local Wire: dated first, the undated item last and labelled "undated"', async ({
		page
	}) => {
		await setup(page);
		await page.goto('/');
		await expectDashboardWire(page);
		await expect(page.locator('body')).not.toContainText(/NaN[dhm]\b/);
	});

	test('TV Local News Wire shows the same two items with the same labels', async ({ page }) => {
		await setup(page);
		await page.goto('/tv');
		await page.getByRole('button', { name: 'Local News Wire' }).click();
		const cards = page.locator('h3', { hasText: /Point Reyes/ });
		await expect(cards).toHaveText([DATED, UNDATED], { timeout: 20_000 });
		const card = (title: string) =>
			page.locator('div.rounded-lg', { has: page.locator('h3', { hasText: title }) });
		await expect(card(DATED).locator('span').nth(1)).toHaveText('1h');
		await expect(card(UNDATED).locator('span').nth(1)).toHaveText('undated');
	});

	test('a failed parser chunk reloads the page once, then the news appears', async ({ page }) => {
		const loads = await setup(page, 1);
		await page.goto('/');
		await expectDashboardWire(page);
		expect(loads.count).toBe(2);
	});

	test('a parser chunk that keeps failing reloads exactly once — no loop, no NaN', async ({
		page
	}) => {
		const loads = await setup(page, Infinity);
		await page.goto('/');
		await expect.poll(() => loads.count, { timeout: 15_000 }).toBe(2);
		await page.waitForTimeout(8_000);
		expect(loads.count).toBe(2);
		await expect(wire(page)).toHaveCount(0);
		await expect(page.locator('body')).not.toContainText(/NaN[dhm]\b/);
	});

	test('on /tv, a persistently failing chunk reloads once and never again over an hour of refreshes', async ({
		page
	}) => {
		await page.clock.install();
		const loads = await setup(page, Infinity);
		await page.goto('/tv');
		await expect.poll(() => loads.count, { timeout: 15_000 }).toBe(2);
		// 20 × 3 minutes = one hour of the TV's news refreshes, well past any
		// short guard window: the reload latch must hold for the episode.
		for (let refresh = 0; refresh < 20; refresh++) {
			await page.clock.fastForward('03:00');
			await page.waitForTimeout(150);
		}
		expect(loads.count).toBe(2);
		await expect(page.locator('body')).not.toContainText(/NaN[dhm]\b/);
	});
});
