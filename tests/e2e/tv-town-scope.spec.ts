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

/**
 * Dashboard → TV as a client navigation, so the dashboard's stores and the TV's transient
 * overrides share one document (the dashboard has no link to /tv; the router takes any).
 */
async function openTvInPlace(page: Page) {
	await expect(page.locator('[data-layout="v2"][data-hydrated="true"]')).toBeVisible();
	await page.evaluate(() => {
		(window as unknown as { __mm: string }).__mm = 'same-document';
		const a = document.createElement('a');
		a.href = '/tv';
		a.textContent = 'TV';
		document.querySelector('[data-layout="v2"]')!.append(a);
		a.click();
	});
	await expect(page).toHaveURL(/\/tv$/);
	await tvReady(page);
}

/** TV's Escape goes to / by client navigation; the document must be the same one. */
async function escapeToDashboard(page: Page) {
	await page.keyboard.press('Escape');
	await expect(page).toHaveURL(/\/$/);
	await expect(page.locator('[data-layout="v2"]')).toBeVisible();
	expect(await page.evaluate(() => (window as unknown as { __mm?: string }).__mm)).toBe(
		'same-document'
	);
}

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

	test('dashboard → TV → dashboard (Escape) in one document restores the town', async ({
		page
	}) => {
		await saveTown(page, 'mill-valley');
		await page.reload();
		await expect(pickerLabel(page)).toHaveText('Mill Valley');
		await openTvInPlace(page);
		await escapeToDashboard(page);
		await expect(pickerLabel(page)).toHaveText('Mill Valley');
		expect(await page.evaluate(() => localStorage.getItem('mm_town'))).toBe('mill-valley');
	});
});

async function saveLightTheme(page: Page) {
	await page.goto('/');
	await page.evaluate(() => {
		localStorage.setItem('mm_onboardingComplete', 'true');
		localStorage.setItem('mm_theme', '"light"');
	});
}

const savedTheme = (page: Page) => page.evaluate(() => localStorage.getItem('mm_theme'));
const shownTheme = (page: Page) =>
	page.evaluate(() => document.documentElement.getAttribute('data-theme'));

test.describe('TV forces dark without saving it', () => {
	test('a TV visit and reload (no onDestroy) keep the saved light theme', async ({ page }) => {
		await saveLightTheme(page);
		await page.goto('/tv');
		await tvReady(page);
		expect(await shownTheme(page)).toBe('dark');
		expect(await savedTheme(page)).toBe('"light"');
		// TV's own 6-hour location.reload(), or a closed tab: onDestroy never runs.
		await page.reload();
		await tvReady(page);
		expect(await savedTheme(page)).toBe('"light"');
		await page.goto('/');
		await expect(page.locator('[data-layout="v2"]')).toBeVisible();
		await expect.poll(() => shownTheme(page)).toBe('light');
		expect(await savedTheme(page)).toBe('"light"');
	});

	test('dashboard → TV → dashboard (Escape) in one document restores the light theme', async ({
		page
	}) => {
		await saveLightTheme(page);
		await page.reload();
		await expect.poll(() => shownTheme(page)).toBe('light');
		await openTvInPlace(page);
		expect(await shownTheme(page)).toBe('dark');
		await escapeToDashboard(page);
		await expect.poll(() => shownTheme(page)).toBe('light');
		expect(await savedTheme(page)).toBe('"light"');
	});
});
