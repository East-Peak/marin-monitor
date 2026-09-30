/**
 * The shared news pipeline in the BUILT app (npm run build && preview):
 * frozen feeds → lazy parser chunk → stores → dashboard Local Wire and the
 * TV Local News Wire, including a failing parser chunk. Only the network is
 * faked; the chunk is the real built asset.
 */
import { expect, test, type Page } from '@playwright/test';
import { snapshotEnvelope } from './fixtures/news-snapshot';

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
	const loads = { count: 0, parserFetches: 0 };
	await page.addInitScript(() => {
		localStorage.setItem('mm_onboardingComplete', 'true');
		localStorage.setItem('mm_tip_banner_dismissed', 'true');
	});
	await page.route('**/api/news/snapshot', (route) =>
		route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: snapshotEnvelope([
				{ title: DATED, hoursAgo: 1, slug: 'a' },
				{ title: UNDATED, hoursAgo: null, slug: 'b' }
			])
		})
	);
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
		if (body.includes('onopentag')) loads.parserFetches += 1;
		if (body.includes('onopentag') && failuresLeft > 0) {
			failuresLeft -= 1;
			return route.abort('failed');
		}
		return route.fulfill({ response, body });
	});
	// Count document navigations, not 'load' events: a reload can start before
	// the first document ever fires 'load'.
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

	test('on /tv the parser chunk is never fetched, so a failing chunk can never reload the TV', async ({
		page
	}) => {
		await page.clock.install();
		const loads = await setup(page, Infinity);
		await page.goto('/tv');
		await page.getByRole('button', { name: 'Local News Wire' }).click();
		await expect(page.locator('h3', { hasText: /Point Reyes/ })).toHaveText([DATED, UNDATED], {
			timeout: 20_000
		});
		for (let refresh = 0; refresh < 20; refresh++) {
			await page.clock.fastForward('03:00');
			await page.waitForTimeout(150);
		}
		expect(loads.count).toBe(1);
		expect(loads.parserFetches).toBe(0);
		await expect(page.locator('body')).not.toContainText(/NaN[dhm]\b/);
	});

	test('leaving /tv: a late TV snapshot never lands in the dashboard stores (Codex r1 #10)', async ({
		page
	}) => {
		const TV_ONLY = 'Point Reyes TV-only late story';
		await setup(page);
		// Deterministic navigation (Codex r3 #2): the dashboard's server load awaits NWS and USGS
		// server-side, which page.route cannot stub. Answer its client-side data request with the
		// valid SvelteKit payload for { bootstrap: null } (what +page.server.ts returns on failure;
		// shape checked against prod /__data.json: node 0 = +layout.ts skip, node 1 = the page).
		await page.route('**/__data.json*', (route) =>
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					type: 'data',
					nodes: [{ type: 'skip' }, { type: 'data', data: [{ bootstrap: 1 }, null], uses: {} }]
				})
			})
		);
		// Hold the dashboard's feeds so nothing it loads can overwrite (and hide) a late TV write.
		let releaseFeeds!: () => void;
		const feedsHeld = new Promise<void>((r) => (releaseFeeds = r));
		await page.route('**/api/feeds?*', async (route) => {
			await feedsHeld;
			await route.fallback().catch(() => {});
		});
		// Hold the TV's snapshot; release it after navigation, well inside the reader's 10 s deadline.
		let releaseSnapshot!: () => void;
		const snapshotHeld = new Promise<void>((r) => (releaseSnapshot = r));
		let requestedAt = 0;
		await page.route('**/api/news/snapshot', async (route) => {
			requestedAt = Date.now();
			await snapshotHeld;
			await route
				.fulfill({
					status: 200,
					contentType: 'application/json',
					body: snapshotEnvelope([{ title: TV_ONLY, hoursAgo: 0.5, slug: 'tv-only' }], 9)
				})
				.catch(() => {});
		});
		await page.goto('/tv');
		await expect.poll(() => requestedAt, { timeout: 10_000 }).toBeGreaterThan(0);
		await page.keyboard.press('Escape'); // TvWallboard: goto('/')
		await page.waitForURL((url) => url.pathname === '/', { timeout: 5_000 });
		await expect(page.locator('[data-panel-id="local-wire"]')).toBeVisible({ timeout: 5_000 });
		// The deadline check comes BEFORE the observation window, so a slow run fails
		// here and can never be mistaken for the disposal proof below.
		expect(Date.now() - requestedAt).toBeLessThan(8_000);
		releaseSnapshot();
		// A destroyed TV must not write: the wire never shows its story.
		for (let i = 0; i < 15; i++) {
			expect(await page.locator('body').innerText(), 'late TV write: TV_ONLY').not.toContain(
				TV_ONLY
			);
			await page.waitForTimeout(200);
		}
		releaseFeeds();
		await expectDashboardWire(page);
		await expect(page.locator('body')).not.toContainText(TV_ONLY);
	});
});
