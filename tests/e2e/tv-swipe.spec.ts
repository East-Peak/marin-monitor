// tests/e2e/tv-swipe.spec.ts
import { test, expect, type Page } from '@playwright/test';

/**
 * Simulate a horizontal swipe by dispatching TouchEvents directly.
 * Playwright's built-in touchscreen.tap() only taps; it doesn't swipe.
 * We dispatch touchstart → touchmove (past slop) → touchend (past commit).
 */
async function swipeLeft(page: Page, x: number, y: number) {
	await page.evaluate(
		({ x, y }) => {
			const target = document.elementFromPoint(x, y) ?? document.body;
			const mkTouch = (clientX: number): Touch =>
				new Touch({
					identifier: 1,
					target,
					clientX,
					clientY: y,
					pageX: clientX,
					pageY: y,
					screenX: clientX,
					screenY: y
				});

			const fire = (type: string, list: Touch[]) => {
				target.dispatchEvent(
					new TouchEvent(type, {
						bubbles: true,
						cancelable: true,
						touches: type === 'touchend' ? [] : list,
						targetTouches: type === 'touchend' ? [] : list,
						changedTouches: list
					})
				);
			};

			fire('touchstart', [mkTouch(x)]);
			fire('touchmove', [mkTouch(x - 60)]); // past 10px slop
			fire('touchend', [mkTouch(x - 120)]); // past 50px commit
		},
		{ x, y }
	);
}

test.describe('TV swipe navigation', () => {
	test.use({ viewport: { width: 393, height: 844 } });

	test('swiping left advances to the next screen', async ({ page }) => {
		await page.goto('/tv');
		// Wait for the wallboard header to render (confirms TV loaded)
		await page.waitForSelector('.tv-header', { timeout: 15_000 });
		await page.waitForTimeout(1000);

		// Read the active pager dot index before swipe
		const beforeIdx = await page.evaluate(() => {
			const dots = document.querySelectorAll('[data-screen-idx]');
			for (let i = 0; i < dots.length; i++) {
				if (dots[i].getAttribute('aria-current') === 'true') return i;
			}
			return -1;
		});

		await swipeLeft(page, 196, 400);
		await page.waitForTimeout(300);

		const afterIdx = await page.evaluate(() => {
			const dots = document.querySelectorAll('[data-screen-idx]');
			for (let i = 0; i < dots.length; i++) {
				if (dots[i].getAttribute('aria-current') === 'true') return i;
			}
			return -1;
		});

		// Screen should have advanced
		expect(afterIdx).not.toBe(beforeIdx);
	});
});
