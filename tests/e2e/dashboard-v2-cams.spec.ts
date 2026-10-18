import { readFileSync } from 'node:fs';
import { expect, test, type Locator, type Page, type Request } from '@playwright/test';
import { requestsFor, stubCams } from './fixtures/cams';

test.skip(({ baseURL }) => baseURL?.startsWith('https://') ?? false, 'stubbed');

const T0 = Math.floor(Date.now() / 1000) * 1000;
const stubRest = (page: Page) =>
	page.route(
		/\/api\/(data|nps|transit|airport-status|health|feeds|article|geocode)\b|\/api\/news\/snapshot|earthquake\.usgs\.gov|api\.weather\.gov|tidesandcurrents/,
		(r) => r.fulfill({ status: 503, body: 'stubbed' })
	);
async function open(page: Page, waitUntil: 'load' | 'domcontentloaded' = 'load') {
	await page.goto('/?layout=v2', { waitUntil });
	await expect(page.locator('[data-layout="v2"][data-hydrated="true"]')).toBeVisible();
}
const tiles = (page: Page) => page.locator('section#cams [data-camera-id]');
const decodedImages = (scope: Locator) =>
	scope
		.locator('img')
		.evaluateAll(
			(imgs) => (imgs as HTMLImageElement[]).filter((i) => i.complete && i.naturalWidth > 0).length
		);
const undecodedImages = (scope: Locator) =>
	scope
		.locator('img')
		.evaluateAll(
			(imgs) =>
				(imgs as HTMLImageElement[]).filter((i) => !(i.complete && i.naturalWidth > 0)).length
		);
/** Visibility of each tile inside the row's box: "full", "partial" or "none". */
const visibility = (page: Page) =>
	page.locator('.cams-row').evaluate((row) => {
		const r = row.getBoundingClientRect();
		return [...row.querySelectorAll('li')].map((li) => {
			const b = li.getBoundingClientRect();
			if (b.left >= r.left - 1 && b.right <= r.right + 1) return 'full';
			return b.right > r.left && b.left < r.right ? 'partial' : 'none';
		});
	});

test.describe('phone 390×844', () => {
	test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

	test('between the brief and the map; ridge cams first, Caltrans last; 21 tiles, no embeds', async ({
		page
	}) => {
		await stubRest(page);
		await stubCams(page);
		await open(page);
		const ids = await tiles(page).evaluateAll((els) =>
			els.map((e) => e.getAttribute('data-camera-id'))
		);
		expect(ids).toHaveLength(21);
		expect(ids[0]).toBe('alert-tam-east');
		expect(ids.slice(-4)).toEqual([
			'caltrans-spencer',
			'caltrans-sr1',
			'caltrans-580',
			'caltrans-ignacio'
		]);
		expect(await page.locator('section#cams iframe').count()).toBe(0);
		const tops = await page.evaluate(() =>
			['[data-slot="brief"]', 'section#cams', 'section#map'].map(
				(s) => document.querySelector(s)!.getBoundingClientRect().top
			)
		);
		expect(tops[0]).toBeLessThan(tops[1]);
		expect(tops[1]).toBeLessThan(tops[2]);
	});

	test('one tile and a peek; only those two load, as thumbnails with decoded pixels', async ({
		page
	}) => {
		await stubRest(page);
		const seen = await stubCams(page);
		await open(page);
		await expect(tiles(page).nth(1)).toHaveAttribute('data-status', 'live');
		await page.waitForTimeout(1500);
		expect((await visibility(page)).slice(0, 3)).toEqual(['full', 'partial', 'none']);
		expect(seen.some((u) => u.includes('latest-frame.jpg'))).toBe(false);
		expect(new Set(seen.map((u) => u.split('?')[0]))).toEqual(
			new Set([
				'https://cameras.alertcalifornia.org/public-camera-data/Axis-TamEast/latest-thumb.jpg',
				'https://cameras.alertcalifornia.org/public-camera-data/Axis-TamWest/latest-thumb.jpg'
			])
		);
		expect(await decodedImages(page.locator('section#cams'))).toBe(2);
		await page
			.locator('section#cams [data-cam-slot="alert-barnabe-east"]')
			.scrollIntoViewIfNeeded();
		await expect(page.locator('[data-camera-id="alert-barnabe-east"]')).toHaveAttribute(
			'data-status',
			'live'
		);
	});

	test('scrolled away: no refresh; back after three minutes: exactly one refresh per shown tile', async ({
		page
	}) => {
		await page.clock.install({ time: T0 });
		await stubRest(page);
		const seen = await stubCams(page);
		await open(page);
		await expect(tiles(page).nth(1)).toHaveAttribute('data-status', 'live');
		// The stubbed page is short: a test-only spacer makes room to scroll the strip well past
		// the page observer's 200 px margin (Codex r3 #3).
		await page.evaluate(() => {
			const spacer = document.createElement('div');
			spacer.style.height = '4000px';
			document.querySelector('.v2-main')!.append(spacer);
			window.scrollTo(0, 2500);
		});
		await expect
			.poll(() => page.locator('.cams-row').evaluate((el) => el.getBoundingClientRect().bottom))
			.toBeLessThan(-200);
		await page.waitForTimeout(500); // observer delivery
		const before = {
			east: requestsFor(seen, 'Axis-TamEast'),
			west: requestsFor(seen, 'Axis-TamWest')
		};
		const total = seen.length;
		await page.clock.runFor(180_000);
		expect(seen.length).toBe(total);
		await page.evaluate(() => window.scrollTo(0, 0));
		await expect.poll(() => requestsFor(seen, 'Axis-TamEast')).toBe(before.east + 1);
		await expect.poll(() => requestsFor(seen, 'Axis-TamWest')).toBe(before.west + 1);
		await page.waitForTimeout(1000);
		expect(requestsFor(seen, 'Axis-TamEast')).toBe(before.east + 1);
		expect(requestsFor(seen, 'Axis-TamWest')).toBe(before.west + 1);
	});

	test('never a broken image: a dead cam is labelled, and every <img> in the strip decoded', async ({
		page
	}) => {
		await stubRest(page);
		await stubCams(page, { fail: (u) => u.includes('Axis-TamEast') });
		await open(page);
		const dead = page.locator('[data-camera-id="alert-tam-east"]');
		await expect(dead).toHaveAttribute('data-status', 'offline', { timeout: 30_000 });
		await expect(dead).toContainText('Camera offline');
		await expect(dead.locator('img')).toHaveCount(0);
		await expect(page.locator('[data-camera-id="alert-tam-west"]')).toHaveAttribute(
			'data-status',
			'live'
		);
		expect(await undecodedImages(page.locator('section#cams'))).toBe(0);
		expect(await decodedImages(page.locator('section#cams'))).toBeGreaterThan(0);
		await expect(page.locator('[data-cams-notice]')).toHaveCount(0);
	});

	test('a request still out when its tile leaves view is cancelled in the browser (Codex r4 #2, r5 #3)', async ({
		page
	}) => {
		await stubRest(page);
		await stubCams(page);
		// Registered last, so it wins: TamWest's frame never answers. Keep that exact request.
		let held: Request | undefined;
		let enteredAt = 0;
		const entered = new Promise<void>((resolve) =>
			page.route(/Axis-TamWest\/latest-thumb\.jpg/, (route) => {
				held = route.request();
				enteredAt = Date.now();
				resolve();
			})
		);
		const failed = new Set<Request>();
		page.on('requestfailed', (r) => failed.add(r));
		// The held image delays the window load event; waiting for it would let the loader's own
		// 8 s deadline cancel the request before the swipe (seen under parallel load).
		await open(page, 'domcontentloaded');
		await entered;
		expect(failed.has(held!)).toBe(false); // not failed before the swipe
		// The loader's own 8 s deadline must not be what cancels it: swipe within 5 s of entry,
		// then require the cancellation within 2 s (total < 8 s).
		expect(Date.now() - enteredAt).toBeLessThan(5_000);
		await page.locator('.cams-row').evaluate((el) => (el.scrollLeft = el.scrollWidth));
		await expect.poll(() => failed.has(held!), { timeout: 2_000 }).toBe(true);
	});

	test('every camera down: the strip says so plainly', async ({ page }) => {
		await stubRest(page);
		await stubCams(page, { fail: () => true });
		await open(page);
		await expect(page.locator('[data-cams-notice]')).toHaveText(
			'No cameras are loading right now.',
			{
				timeout: 30_000
			}
		);
		await expect(page.locator('section#cams')).toBeVisible();
		// The notice wraps rather than overflowing at the enlarged UI scale (Codex r2 #6).
		await page.evaluate(() => (document.documentElement.style.zoom = '150%'));
		expect(
			await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
		).toBeLessThanOrEqual(1);
	});

	test('hidden in ⚙: says so, requests no camera; Show brings them back', async ({ page }) => {
		await page.addInitScript(() => localStorage.setItem('mm_camerasHidden', 'true'));
		await stubRest(page);
		const seen = await stubCams(page);
		await open(page);
		await expect(page.locator('section#cams')).toContainText('Cameras are hidden.');
		await page.waitForTimeout(1500);
		expect(seen).toEqual([]);
		await page.getByRole('button', { name: 'Show cameras' }).click();
		await expect(tiles(page).first()).toHaveAttribute('data-status', 'live');
	});

	test('no horizontal page scroll; the row scrolls inside itself; no pager on phones', async ({
		page
	}) => {
		await stubRest(page);
		await stubCams(page);
		await open(page);
		expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
			390
		);
		expect(await page.locator('.cams-row').evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(
			true
		);
		await expect(page.locator('[data-cams-pager]')).toBeHidden();
	});
});

// Below 1024 the strip is the carousel; at desktop widths the wall replaces it (Goal 1).
test.describe('tablet 900', () => {
	test.use({ viewport: { width: 900, height: 900 } });

	test('five fully in view; at most seven load; › scrolls one view', async ({ page }) => {
		await stubRest(page);
		const seen = await stubCams(page);
		await open(page);
		await expect(tiles(page).nth(4)).toHaveAttribute('data-status', 'live');
		await page.waitForTimeout(1500);
		expect((await visibility(page)).filter((v) => v === 'full')).toHaveLength(5);
		expect(new Set(seen.map((u) => u.split('?')[0])).size).toBeLessThanOrEqual(7);
		expect(await decodedImages(page.locator('section#cams'))).toBeGreaterThanOrEqual(5);
		const row = page.locator('.cams-row');
		const x0 = await row.evaluate((el) => el.scrollLeft);
		await page.getByRole('button', { name: 'Next cameras' }).click();
		await expect.poll(() => row.evaluate((el) => el.scrollLeft)).toBeGreaterThan(x0 + 500);
	});
});

test.describe('desktop 1440', () => {
	test.use({ viewport: { width: 1440, height: 900 } });

	test('the wall replaces the strip: no carousel or pager; every tile decodes once in view', async ({
		page
	}) => {
		await stubRest(page);
		await stubCams(page);
		await open(page);
		await expect(page.locator('.cams-row')).toHaveCount(0);
		await expect(page.getByRole('button', { name: 'Next cameras' })).toHaveCount(0);
		await page.locator('[data-slot="cam-wall"]').scrollIntoViewIfNeeded();
		await expect(tiles(page)).toHaveCount(21);
		await expect(page.locator('section#cams [data-status="live"]')).toHaveCount(21);
		expect(await undecodedImages(page.locator('section#cams'))).toBe(0);
	});

	test("Caltrans tiles read the source's own capture age; ridge tiles claim none", async ({
		page
	}) => {
		await stubRest(page);
		await stubCams(page, { lastModified: Date.now() - 4 * 60_000 });
		await open(page);
		await page.locator('[data-cam-slot="caltrans-spencer"]').scrollIntoViewIfNeeded();
		const tile = page.locator('[data-camera-id="caltrans-spencer"]');
		await expect(tile.locator('[data-cam-meta]')).toContainText(/Caltrans · updated [45] min ago/);
		expect(await decodedImages(tile)).toBe(1);
		await expect(page.locator('[data-camera-id="alert-tam-east"] [data-cam-meta]')).toHaveText(
			'ALERTCalifornia | UC San Diego'
		);
	});

	test("Caltrans' stand-in cards read unavailable, never 'updated' (MAPX4b, real captured frames)", async ({
		page
	}) => {
		const fixture = (name: string) =>
			readFileSync(new URL(`../../src/lib/dashboard/__fixtures__/${name}`, import.meta.url));
		const cards: Record<string, Buffer> = {
			tve75us101marinsr1: fixture('caltrans-temporarily-unavailable.jpg'),
			tve83us101i580: fixture('caltrans-down-for-construction.jpg'),
			tve73us101spenceravenue: fixture('caltrans-frame.jpg')
		};
		await stubRest(page);
		await stubCams(page, {
			lastModified: Date.now() - 4 * 60_000,
			jpeg: (url) => Object.entries(cards).find(([id]) => url.includes(id))?.[1]
		});
		await open(page);
		await page.locator('[data-cam-slot="caltrans-sr1"]').scrollIntoViewIfNeeded();
		for (const id of ['caltrans-sr1', 'caltrans-580']) {
			const tile = page.locator(`[data-camera-id="${id}"]`);
			await expect(tile).toHaveAttribute('data-status', 'offline');
			await expect(tile).toContainText('Camera temporarily unavailable');
			await expect(tile.locator('[data-cam-meta]')).toHaveText('Caltrans');
			await expect(tile.locator('img')).toHaveCount(0);
		}
		const real = page.locator('[data-camera-id="caltrans-spencer"]');
		await expect(real.locator('[data-cam-meta]')).toContainText(/Caltrans · updated [45] min ago/);
		expect(await decodedImages(real)).toBe(1);
	});

	test('Caltrans without CORS still shows its picture, with no age claim (Decision 3 fallback)', async ({
		page
	}) => {
		await stubRest(page);
		await stubCams(page, { cors: false, lastModified: Date.now() - 4 * 60_000 });
		await open(page);
		await page.locator('[data-cam-slot="caltrans-spencer"]').scrollIntoViewIfNeeded();
		const tile = page.locator('[data-camera-id="caltrans-spencer"]');
		await expect(tile).toHaveAttribute('data-status', 'live');
		expect(await decodedImages(tile)).toBe(1);
		await expect(tile.locator('[data-cam-meta]')).toHaveText('Caltrans');
	});

	test('a tile opens its full-size source frame in a new tab', async ({ page }) => {
		await stubRest(page);
		await stubCams(page);
		await open(page);
		const a = page.locator('[data-camera-id="alert-tam-east"]');
		await expect(a).toHaveAttribute(
			'href',
			'https://cameras.alertcalifornia.org/public-camera-data/Axis-TamEast/latest-frame.jpg'
		);
		await expect(a).toHaveAttribute('target', '_blank');
	});
});
