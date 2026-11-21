import { expect, test } from '@playwright/test';

/** With the Lifestyle Index on, a town with no household is a 404 that reaches the branded page. */
test('/cost/<unknown town> is a 404 with the branded page', async ({ page }) => {
	const response = await page.goto('/cost/stinson');
	expect(response?.status()).toBe(404);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(
		/^There.s no page at \/cost\/stinson$/
	);
	await expect(page.locator('nav a')).toHaveText(['Dashboard', 'Map', 'Cost of living']);
});

test('every link on the error page is followed and answers 200', async ({ page }) => {
	await page.goto('/cost/stinson');
	const hrefs = await page
		.locator('nav a')
		.evaluateAll((as) => as.map((a) => a.getAttribute('href')!));
	expect(hrefs).toEqual(['/', '/map', '/cost']);
	for (const href of hrefs) {
		const response = await page.goto(href);
		expect(response?.status(), `${href} should answer 200`).toBe(200);
	}
});

test('the cost link lands on the households side by side', async ({ page }) => {
	await page.goto('/cost/stinson');
	await page.locator('nav a', { hasText: 'Cost of living' }).click();
	await expect(page).toHaveURL(/\/cost$/);
	await expect(page.locator('[data-household]')).toHaveCount(3);
});
