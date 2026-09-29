import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
	await page.addInitScript(() => localStorage.setItem('mm_onboardingComplete', 'true'));
});

test('UI scale chosen in the v2 ⚙ menu carries to the legacy dashboard; v2 sections stay separate', async ({
	page
}) => {
	await page.goto('/?layout=v2');
	await expect(page.locator('[data-layout="v2"][data-hydrated="true"]')).toBeVisible();
	await page.getByRole('button', { name: 'Dashboard settings' }).click();
	await page.getByLabel('UI scale').selectOption('120');
	await expect.poll(() => page.evaluate(() => document.documentElement.style.zoom)).toBe('120%');

	await page.goto('/');
	await expect(page.locator('[data-layout="legacy"]')).toBeVisible();
	expect(await page.evaluate(() => document.documentElement.style.zoom)).toBe('120%');
	expect(await page.evaluate(() => localStorage.getItem('mm_sections_v2'))).toBeNull();
});

test('a malformed v2 key does not break the preview, and Reset sections clears it', async ({
	page
}) => {
	await page.goto('/?layout=v2');
	await page.evaluate(() => localStorage.setItem('mm_sections_v2', '{oops'));
	await page.reload();
	await expect(page.locator('[data-layout="v2"][data-hydrated="true"]')).toBeVisible();
	await page.getByRole('button', { name: 'Dashboard settings' }).click();
	await page.getByRole('button', { name: 'Reset sections' }).click();
	await expect(page.getByRole('status')).toHaveText('Sections reset to defaults.');
	expect(await page.evaluate(() => localStorage.getItem('mm_sections_v2'))).toBeNull();
});
