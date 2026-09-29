import { expect, test, type Page } from '@playwright/test';

async function saveTown(page: Page, slug: string) {
	await page.goto('/');
	await page.evaluate((s) => {
		localStorage.setItem('mm_onboardingComplete', 'true');
		localStorage.setItem('mm_town', s);
	}, slug);
}

const pickerLabel = (page: Page) => page.locator('.picker-trigger .picker-label');
const tvReady = (page: Page) =>
	expect(page.getByRole('button', { name: 'Crime & Safety' })).toBeVisible();

test.describe('TV has its own transient scope', () => {
	test('visiting /tv directly does not clear the saved dashboard town', async ({ page }) => {
		await saveTown(page, 'mill-valley');
		await page.goto('/tv');
		await expect(page).toHaveURL(/\/tv$/);
		await tvReady(page);
		await page.waitForTimeout(500);
		expect(await page.evaluate(() => localStorage.getItem('mm_town'))).toBe('mill-valley');
		await page.goto('/');
		await expect(pickerLabel(page)).toHaveText('Mill Valley');
	});

	test('dashboard → TV → dashboard by keyboard (client navigation) keeps the town', async ({
		page
	}) => {
		await saveTown(page, 'mill-valley');
		await page.reload();
		await expect(pickerLabel(page)).toHaveText('Mill Valley');
		await page.keyboard.press('m');
		await expect(page).toHaveURL(/\/tv$/);
		await tvReady(page);
		await page.keyboard.press('Escape');
		await expect(page).toHaveURL(/\/$/);
		await expect(page.locator('[data-layout="legacy"]')).toBeVisible();
		await expect(pickerLabel(page)).toHaveText('Mill Valley');
		expect(await page.evaluate(() => localStorage.getItem('mm_town'))).toBe('mill-valley');
	});
});
