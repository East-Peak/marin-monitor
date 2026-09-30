import { expect, test, type Route } from '@playwright/test';

/**
 * Work only the legacy controller does. v2 legitimately requests /api/data/*,
 * /api/transit, /api/news/snapshot and (from D1 PR 8) its own NWS observation,
 * hourly and alert URLs, so those are not evidence of a leak.
 */
const LEGACY_WORK =
	/\/api\/(feeds|article|geocode)\b|api\.weather\.gov\/gridpoints\/[A-Z]{3}\/\d+,\d+\/forecast(?:$|\?)/;

test('a destroyed legacy controller starts no further work (debounce, timers, visibility, delayed responses)', async ({
	page
}) => {
	await page.clock.install();
	await page.addInitScript(() => localStorage.setItem('mm_onboardingComplete', 'true'));
	const held: Route[] = [];
	let navigated = false;
	// Hold every feed and transit response until the controller is gone. Transit is a
	// sequential per-agency loop, so a released response would start the next agency.
	// v2's news loader requests /api/transit too: after the navigation, answer it at once.
	await page.route(/\/api\/(feeds|transit)\?/, (route) => {
		if (navigated && route.request().url().includes('/api/transit?')) {
			return route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: '{"Entities":[]}'
			});
		}
		held.push(route);
	});
	// A late legacy continuation would fetch this article; answering keeps the run fast and deterministic.
	await page.route(/\/api\/article\b/, (route) =>
		route.fulfill({
			status: 200,
			contentType: 'text/html',
			body: '<article><p>Crash at 1200 Fourth Street, San Rafael.</p></article>'
		})
	);

	await page.goto('/');
	await expect(page.locator('[data-layout="legacy"]')).toBeVisible();
	const heldUrl = (re: RegExp) => held.some((r) => re.test(r.request().url()));
	await expect.poll(() => heldUrl(/\/api\/feeds\?/), { timeout: 15_000 }).toBe(true);
	await expect.poll(() => heldUrl(/\/api\/transit\?/), { timeout: 15_000 }).toBe(true);

	// A town change arms the 500 ms weather debounce; navigate to v2 immediately.
	await page.locator('.picker-trigger').click();
	await page.getByRole('option', { name: 'Novato' }).click();
	navigated = true;
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
	const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>t</title><item><title>Novato council approves late story</title><link>https://www.marinij.com/2026/09/29/late-legacy-story/</link><pubDate>${new Date().toUTCString()}</pubDate></item></channel></rss>`;
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

	// Codex C4: no news-store write either. The news store outlives the page component, so a
	// late write by the destroyed controller would render at once on a round trip back to
	// legacy, before the new controller's (held) feed requests could answer.
	await page.evaluate(() => {
		const a = document.createElement('a');
		a.href = '/';
		document.querySelector('[data-layout="v2"]')!.append(a);
		a.click();
	});
	await expect(page.locator('[data-layout="legacy"]')).toBeVisible();
	await page.waitForTimeout(1_000);
	await expect(page.getByText('Novato council approves late story')).toHaveCount(0);
});

/** Work only a surviving legacy panel does: the sentinel grid it alone was given, or a legacy-shaped tide request. */
const PANEL_WORK =
	/api\.weather\.gov\/gridpoints\/MTR\/1,1\b|tidesandcurrents\.noaa\.gov\/[^#]*\bend_date=/;

test('legacy panels start no request after teardown (NWS grid chains, tide retries)', async ({
	page
}) => {
	await page.clock.install();
	await page.addInitScript(() => localStorage.setItem('mm_onboardingComplete', 'true'));
	const held: Route[] = [];
	await page.route(/api\.weather\.gov\/points\/|tidesandcurrents\.noaa\.gov/, (route) => {
		held.push(route); // hold each panel's first hop until the legacy dashboard is gone
	});

	await page.goto('/');
	await expect(page.locator('[data-layout="legacy"]')).toBeVisible();
	const heldUrl = (re: RegExp) => held.some((r) => re.test(r.request().url()));
	await expect.poll(() => heldUrl(/\/points\//), { timeout: 15_000 }).toBe(true);
	await expect.poll(() => heldUrl(/tidesandcurrents/), { timeout: 15_000 }).toBe(true);

	// v2's own weather (D1 PR 8) gets a different grid and fast answers; only legacy ever sees grid 1,1.
	await page.route(/api\.weather\.gov\/points\//, (route) =>
		route.fulfill({
			status: 200,
			contentType: 'application/geo+json',
			body: JSON.stringify({ properties: { gridId: 'MTR', gridX: 2, gridY: 2 } })
		})
	);
	await page.route(/api\.weather\.gov\/(gridpoints|stations|alerts)\//, (route) =>
		route.fulfill({ status: 503, body: 'test' })
	);
	await page.route(/tidesandcurrents\.noaa\.gov/, (route) =>
		route.fulfill({ status: 503, body: 'test' })
	);

	await page.evaluate(() => {
		const a = document.createElement('a');
		a.href = '/?layout=v2';
		document.querySelector('[data-layout="legacy"]')!.append(a);
		a.click();
	});
	await expect(page.locator('[data-layout="v2"][data-hydrated="true"]')).toBeVisible();

	const late: string[] = [];
	page.on('request', (req) => {
		if (PANEL_WORK.test(req.url())) late.push(req.url());
	});

	// /points answers with the sentinel grid (a live chain would now fetch gridpoints/MTR/1,1); tides fail
	// (a live ServiceClient would retry after its backoff).
	for (const route of held.splice(0)) {
		if (route.request().url().includes('/points/')) {
			await route.fulfill({
				status: 200,
				contentType: 'application/geo+json',
				body: JSON.stringify({ properties: { gridId: 'MTR', gridX: 1, gridY: 1 } })
			});
		} else {
			await route.fulfill({ status: 503, body: 'unavailable' });
		}
	}
	await page.clock.runFor(60_000);
	await page.waitForTimeout(1_500);

	expect(late).toEqual([]);
});
