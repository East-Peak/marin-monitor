import { expect, test } from '@playwright/test';

/** The branded error page (src/routes/+error.svelte): a real 404 status, never a 200. */
for (const path of ['/no-such-page', '/cost/stinson', '/map/nowhere']) {
	test(`${path} answers 404 with the branded page`, async ({ page }) => {
		const response = await page.goto(path);
		expect(response?.status()).toBe(404);
		await expect(page.locator('[data-wordmark]')).toHaveText('Marin Monitor');
		await expect(page.locator('[data-status]')).toHaveText('404');
		await expect(page.getByRole('heading', { level: 1 })).toHaveText(
			new RegExp(`^There.s no page at ${path}$`)
		);
		await expect(
			page.getByText("The link may be old, or the town isn't one we cover yet.")
		).toBeVisible();
		await expect(page).toHaveTitle('Page not found · Marin Monitor');
		await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
	});
}

test('three full-width links, each at least 52 px tall, that go somewhere', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/cost/stinson');
	const links = page.locator('nav a');
	await expect(links).toHaveText(['Dashboard', 'Map', 'Cost of living']);
	await expect(links).toHaveCount(3);
	const nav = (await page.locator('nav').boundingBox())!;
	for (const a of await links.all()) {
		const box = (await a.boundingBox())!;
		expect(box.height).toBeGreaterThanOrEqual(52);
		expect(box.width).toBeGreaterThanOrEqual(nav.width - 1);
	}
	expect(await links.evaluateAll((as) => as.map((a) => a.getAttribute('href')))).toEqual([
		'/',
		'/map',
		'/cost'
	]);
	await links.nth(1).click();
	await expect(page).toHaveURL(/\/map$/);
});

// Following the links, /cost included, is cost-lifestyle-404.spec.ts: /cost exists only under the
// Lifestyle Index's flag, which is on in production and off on this preview.

test('the path is shown as text, never as markup', async ({ page }) => {
	const response = await page.goto('/%3Cimg%20src=x%3E');
	expect(response?.status()).toBe(404);
	await expect(page.getByRole('heading', { level: 1 })).toContainText('<img src=x>');
	await expect(page.locator('main img')).toHaveCount(0);
});
