import { expect, test } from '@playwright/test';

/** With the Lifestyle Index on, a town with no household is a 404 that reaches the branded page. */
test('/cost/<unknown town> is a 404 with the branded page', async ({ page }) => {
	const response = await page.goto('/cost/stinson');
	expect(response?.status()).toBe(404);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(
		/^There.s no page at \/cost\/stinson$/
	);
	await expect(page.locator('nav a')).toHaveText(['Dashboard', 'Map', 'Cost of living by town']);
});
