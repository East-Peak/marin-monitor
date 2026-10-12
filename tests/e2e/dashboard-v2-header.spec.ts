import { expect, test } from '@playwright/test';

/**
 * The town picker is the page's scope control (§2.1 "Showing: Mill Valley ▾", §1, §4, §8).
 * The shared TownPicker hides its label at ≤ 720 px; the v2 header must still name the town,
 * on screen and to assistive tech. The legacy page keeps its icon-only phone picker.
 */
test.describe('phone 390×844', () => {
	test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

	test('the v2 picker names the selected town, visibly and in its accessible name', async ({
		page
	}) => {
		await page.goto('/?layout=v2');
		await expect(page.locator('[data-layout="v2"][data-hydrated="true"]')).toBeVisible();
		const trigger = page.locator('[data-layout="v2"] .picker-trigger');
		await expect(trigger.locator('.picker-label')).toBeVisible();
		await expect(trigger).toHaveText(/All of Marin/, { useInnerText: true });
		await expect(trigger).toHaveAccessibleName(/All of Marin/);

		await trigger.click();
		await page.getByRole('option', { name: 'Mill Valley' }).click();
		await expect(trigger).toHaveText(/Mill Valley/, { useInnerText: true });
		await expect(trigger).toHaveAccessibleName(/Mill Valley/);
		expect(
			await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
		).toBeLessThanOrEqual(1);
	});

	test('with the town named, the settings menu still opens inside the viewport', async ({
		page
	}) => {
		// The label widens the picker, so the gear can wrap to the start of a header line
		// (it does with the default "All of Marin" at 390 px); a panel anchored to the gear's
		// right edge would then open off-screen.
		await page.goto('/?layout=v2');
		await expect(page.locator('[data-layout="v2"][data-hydrated="true"]')).toBeVisible();
		await expect(page.locator('[data-layout="v2"] .picker-label')).toHaveText('All of Marin');
		await page.getByRole('button', { name: 'Dashboard settings' }).click();
		const panel = await page.getByRole('group', { name: 'Dashboard settings' }).boundingBox();
		expect(panel!.x).toBeGreaterThanOrEqual(0);
		expect(panel!.x + panel!.width).toBeLessThanOrEqual(390);
		await page.getByRole('button', { name: 'Reset sections' }).click({ timeout: 5_000 });
	});

	test('legacy guard: / keeps its icon-only phone picker (the fix is v2-scoped)', async ({
		page
	}) => {
		await page.goto('/');
		await expect(page.locator('[data-layout="legacy"]')).toBeVisible();
		await expect(page.locator('.picker-trigger .picker-label').first()).toBeHidden();
	});
});
