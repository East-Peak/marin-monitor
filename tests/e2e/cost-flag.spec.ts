import { expect, test } from '@playwright/test';

/** With the Lifestyle Index's flag off, as in production until Stuart's look (LIFE2), none of it exists. */
test.skip(
	({ baseURL }) => baseURL?.startsWith('https://') ?? false,
	'the local server has the flag off'
);

test('the household page and the card’s data do not exist with the flag off', async ({ page }) => {
	expect((await page.goto('/cost/larkspur'))?.status()).toBe(404);
	expect((await page.request.get('/api/data/lifestyle')).status()).toBe(404);
});
