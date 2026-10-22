import { expect, test } from '@playwright/test';
import { probe, settled } from './fixtures/v2-probe';
import { phoneHeight, stub, T0 } from './fixtures/v2-height';

/**
 * §13.3 height acceptance, re-ruled for decision 5a (plan-dashboard-d1-cams-strip.md Decision 6),
 * 390×844, 100% UI scale, frozen clock, fonts loaded. Fixtures carry
 * long titles, an advisory and failure banners (an unreadable advisory, a partial-coverage
 * line, unavailable brief cards). Getting Around adds the all-disclosures-open gate (whole document, Getting Around populated).
 */
test.skip(({ baseURL }) => baseURL?.startsWith('https://') ?? false, 'stubbed');

test.describe('phone 390×844', () => {
	test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

	for (const mode of ['first visit', 'every section saved open', 'every camera down'] as const) {
		test(`[${mode}] the Cams strip ≤ 220 px and the 3rd Latest-reporting item ≤ 1,266 px without it (§13.3, decision 5a)`, async ({
			page
		}) => {
			if (mode === 'every camera down') test.setTimeout(90_000);
			await phoneHeight(page, mode);
		});
	}
});

test('the height measurement waits for a delayed brief card', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.clock.install({ time: T0 });
	await stub(page); // the file's own stub: broad fail-fast first, specific routes after
	let release!: () => void;
	const held = new Promise<void>((r) => (release = r));
	// Registered last, so it wins. The hourly forecast resolves its grid via /points first (the
	// file's stub fails that fast), so the forecast card is held at /points; the observation and
	// tides cards don't use it.
	await page.route(/api\.weather\.gov\/points/, async (r) => {
		await held;
		await r.fulfill({ status: 503, body: 'down' });
	});
	await page.goto('/?probe');
	await expect(page.locator('[data-layout="v2"][data-hydrated="true"]')).toBeVisible();
	// Every map source settles, but the brief's forecast card is still pending: not settled.
	await expect
		.poll(async () => (await probe(page))?.loading ?? [], { timeout: 15_000 })
		.toEqual(['brief:forecast']);
	await expect(settled(page, 3_000)).rejects.toThrow();
	release();
	const p = await settled(page);
	expect(p.loading).toEqual([]);
	await expect(page.locator('[data-card="rain"]')).toContainText("Couldn't load"); // the failure line that adds height is on screen
});
