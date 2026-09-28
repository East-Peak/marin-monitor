// tests/e2e/tv-cameras.spec.ts
import { expect, test, type Locator, type Page } from '@playwright/test';

const CAM = /cameras\.alertcalifornia\.org|cwwp2\.dot\.ca\.gov|cdns\.abclocal\.go\.com/;
const PIXEL = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
	'base64'
);

/** /tv is client-only: keys pressed before the header renders are dropped. */
async function openPaused(page: Page) {
	await page.goto('/tv');
	await expect(page.getByRole('button', { name: 'Crime & Safety' })).toBeVisible();
	await page.keyboard.press('Space');
}

async function gotoCameraSlide(page: Page) {
	await openPaused(page);
	for (let i = 0; i < 25; i++) {
		if ((await page.locator('[data-camera-id]').count()) > 0) return;
		await page.keyboard.press('ArrowRight');
		await page.waitForTimeout(150);
	}
	throw new Error('no camera slide reached');
}

/** The tile's <img> actually rendered pixels — status alone could lie. */
async function expectDecoded(tile: Locator) {
	await expect
		.poll(() =>
			tile
				.locator('img')
				.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)
				.catch(() => false)
		)
		.toBe(true);
}

test.describe('TV camera tiles', () => {
	test.use({ viewport: { width: 1920, height: 970 } });

	test('cold load never claims "Camera offline" while frames are still arriving', async ({
		page
	}) => {
		await page.route(CAM, async (route) => {
			await new Promise((r) => setTimeout(r, 2_500));
			await route.fulfill({ status: 200, contentType: 'image/png', body: PIXEL });
		});
		await gotoCameraSlide(page);
		await expect(page.getByText('Camera offline')).toHaveCount(0);
		const live = page.locator('[data-status="live"]').first();
		await expect(live).toBeVisible({ timeout: 15_000 });
		await expectDecoded(live);
	});

	test('a camera that fails then recovers comes back', async ({ page }) => {
		test.setTimeout(90_000); // the first tile may be a 60s-refresh camera
		// Each camera fails its first two requests (preload or tile), then serves frames.
		const attempts = new Map<string, number>();
		await page.route(CAM, (route) => {
			const { origin, pathname } = new URL(route.request().url());
			const n = (attempts.get(origin + pathname) ?? 0) + 1;
			attempts.set(origin + pathname, n);
			return n <= 2
				? route.fulfill({ status: 503, body: '' })
				: route.fulfill({ status: 200, contentType: 'image/png', body: PIXEL });
		});
		await gotoCameraSlide(page);
		const id = await page.locator('[data-camera-id]').first().getAttribute('data-camera-id');
		const tile = page.locator(`[data-camera-id="${id}"]`);
		await expect(tile).not.toHaveAttribute('data-status', 'live');
		await expect(tile).toHaveAttribute('data-status', 'live', { timeout: 75_000 });
		await expectDecoded(tile);
	});

	test('the next camera slide is preloaded before it is shown', async ({ page }) => {
		const requested: string[] = [];
		let networkDown = false;
		await page.route(CAM, (route) => {
			if (networkDown) return route.abort('internetdisconnected');
			requested.push(route.request().url());
			return route.fulfill({ status: 200, contentType: 'image/png', body: PIXEL });
		});
		await openPaused(page);
		// Jump to the slide immediately BEFORE the first camera slide.
		await page.getByRole('button', { name: 'Crime & Safety' }).click();
		await expect.poll(() => requested.length, { timeout: 10_000 }).toBeGreaterThan(0);
		await page.waitForTimeout(1_000); // let the warm-up decode
		// Only the warm-up can make the next slide ready now.
		networkDown = true;
		await page.keyboard.press('ArrowRight');
		const tiles = page.locator('[data-camera-id]');
		await expect(tiles.first()).toBeVisible();
		for (const tile of await tiles.all()) {
			await expect(tile).toHaveAttribute('data-status', 'live', { timeout: 1_000 });
			await expectDecoded(tile);
		}
	});
});
