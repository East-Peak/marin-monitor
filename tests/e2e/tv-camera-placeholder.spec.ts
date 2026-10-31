import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

/**
 * Caltrans serves a stand-in card ("Temporarily Unavailable") at a down camera's own URL. The TV
 * reads it as unavailable: no picture and no age. Real frames still show, and a card that turns
 * back into a real frame recovers. Both JPEGs are real captures.
 */
test.skip(({ baseURL }) => baseURL?.startsWith('https://') ?? false, 'stubbed');

const jpeg = (name: string) => readFileSync(`src/lib/dashboard/__fixtures__/${name}`);
const CARD = jpeg('caltrans-temporarily-unavailable.jpg');
const FRAME = jpeg('caltrans-frame.jpg');

async function stubCaltrans(page: Page, frameFor: (url: string) => Buffer) {
	await page.route(/cwwp2\.dot\.ca\.gov/, (r) =>
		r.fulfill({
			status: 200,
			contentType: 'image/jpeg',
			headers: { 'access-control-allow-origin': '*' },
			body: frameFor(r.request().url())
		})
	);
}
const tile = (page: Page, id: string) => page.locator(`[data-camera-id="${id}"]`);

async function openCameras(page: Page) {
	await page.goto('/tv?probe');
	await expect(page.locator('[data-screen-id]').first()).toBeVisible();
	await page.keyboard.press('Space');
	await expect(page.getByText('PAUSED', { exact: true })).toBeVisible();
	await page.locator('[data-screen-id="cameras-central-highway"]').click();
}

test('a card reads unavailable, a real frame beside it shows, and the card recovers', async ({
	page
}) => {
	let down = true;
	await stubCaltrans(page, (url) => (down && url.includes('marinsr1') ? CARD : FRAME));
	await openCameras(page);

	await expect(tile(page, 'caltrans-sr1')).toHaveAttribute('data-status', 'unavailable');
	await expect(tile(page, 'caltrans-sr1')).toContainText('Camera temporarily unavailable');
	await expect(tile(page, 'caltrans-sr1').locator('img')).toHaveCount(0);

	await expect(tile(page, 'caltrans-spencer')).toHaveAttribute('data-status', 'live');
	const shown = tile(page, 'caltrans-spencer').locator('img');
	await expect(shown).toBeVisible();
	expect(await shown.evaluate((i) => (i as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);

	down = false;
	await expect(tile(page, 'caltrans-sr1')).toHaveAttribute('data-status', 'live', {
		timeout: 25_000
	});
	await expect(tile(page, 'caltrans-sr1').locator('img')).toBeVisible();
});

test('legacy: a card reads unavailable with its picture hidden, a real frame still shows', async ({
	page
}) => {
	test.setTimeout(60_000);
	await stubCaltrans(page, (url) => (url.includes('marinsr1') ? CARD : FRAME));
	await page.goto('/?layout=legacy');
	const panel = page.locator('[data-camera="caltrans-sr1"]').first();
	await panel.scrollIntoViewIfNeeded();
	await expect(panel.locator('img')).toHaveAttribute('data-stand-in', '');
	await expect(panel.locator('img')).toBeHidden();
	const real = page.locator('[data-camera="caltrans-spencer"] img').first();
	await real.scrollIntoViewIfNeeded();
	await expect(real).toBeVisible();
	await expect(real).not.toHaveAttribute('data-stand-in', '');
});
