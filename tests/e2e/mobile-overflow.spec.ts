// tests/e2e/mobile-overflow.spec.ts
import { test, expect } from '@playwright/test';

test.describe('mobile horizontal overflow', () => {
	test.use({ viewport: { width: 393, height: 844 } });

	test('page does not scroll horizontally at iPhone width', async ({ page }) => {
		await page.goto('/');
		await page.waitForSelector('.signal-layout', { timeout: 10_000 });
		// Give panels a moment to hydrate
		await page.waitForTimeout(500);

		const overflow = await page.evaluate(() => ({
			scrollWidth: document.documentElement.scrollWidth,
			clientWidth: document.documentElement.clientWidth
		}));

		expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
	});

	test('signal-layout does not overflow its container', async ({ page }) => {
		await page.goto('/');
		await page.waitForSelector('.signal-layout', { timeout: 10_000 });
		await page.waitForTimeout(500);

		const result = await page.evaluate(() => {
			const el = document.querySelector('.signal-layout') as HTMLElement;
			if (!el) return null;
			return {
				scrollWidth: el.scrollWidth,
				offsetWidth: el.offsetWidth
			};
		});

		expect(result).not.toBeNull();
		expect(result!.scrollWidth).toBeLessThanOrEqual(result!.offsetWidth + 1);
	});
});
