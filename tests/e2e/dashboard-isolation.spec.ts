import { expect, test, type Route } from '@playwright/test';

/** Anything the legacy controller could start after it is destroyed. */
const LEGACY_WORK = /\/api\/(feeds|article|geocode|transit|data\/)|api\.weather\.gov/;

test('a destroyed legacy controller starts no further work (debounce, timers, visibility, delayed responses)', async ({
	page
}) => {
	await page.clock.install();
	await page.addInitScript(() => localStorage.setItem('mm_onboardingComplete', 'true'));
	const held: Route[] = [];
	// Hold every feed and transit response until the controller is gone. Transit is a
	// sequential per-agency loop, so a released response would start the next agency.
	await page.route(/\/api\/(feeds|transit)\?/, (route) => {
		held.push(route);
	});

	await page.goto('/');
	await expect(page.locator('[data-layout="legacy"]')).toBeVisible();
	const heldUrl = (re: RegExp) => held.some((r) => re.test(r.request().url()));
	await expect.poll(() => heldUrl(/\/api\/feeds\?/), { timeout: 15_000 }).toBe(true);
	await expect.poll(() => heldUrl(/\/api\/transit\?/), { timeout: 15_000 }).toBe(true);

	// A town change arms the 500 ms weather debounce; navigate to v2 immediately.
	await page.locator('.picker-trigger').click();
	await page.getByRole('option', { name: 'Novato' }).click();
	await page.evaluate(() => {
		const a = document.createElement('a');
		a.href = '/?layout=v2';
		document.querySelector('[data-layout="legacy"]')!.append(a);
		a.click();
	});
	await expect(page.locator('[data-layout="v2"][data-hydrated="true"]')).toBeVisible();

	// PF5: the refresh store persists lastRefresh on every endRefresh; snapshot it at teardown.
	const readRefresh = () => page.evaluate(() => localStorage.getItem('refreshSettings'));
	const refreshAtTeardown = await readRefresh();

	const late: string[] = [];
	page.on('request', (req) => {
		if (LEGACY_WORK.test(req.url())) late.push(req.url());
	});

	// Delayed responses arrive after the controller is gone.
	const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>t</title><item><title>Mill Valley council approves late story</title><link>https://example.com/late</link><pubDate>${new Date().toUTCString()}</pubDate></item></channel></rss>`;
	for (const route of held.splice(0)) {
		if (route.request().url().includes('/api/transit?')) {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: '{"Entities":[]}'
			});
		} else {
			await route.fulfill({ status: 200, contentType: 'application/rss+xml', body: xml });
		}
	}
	// Past the debounce and the 5-minute auto-refresh, then a tab-visible event.
	await page.clock.runFor(6 * 60_000);
	await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
	await page.clock.runFor(1_000);
	await page.waitForTimeout(1_500);

	expect(late).toEqual([]);
	expect(held).toEqual([]); // no new feed request was even attempted
	expect(await readRefresh()).toBe(refreshAtTeardown); // no refresh.endRefresh after teardown
});
