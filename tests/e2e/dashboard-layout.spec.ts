import { expect, test, type Page } from '@playwright/test';

/** Requests only the legacy dashboard's loaders make (news, weather, datasets, Strava). */
const DATA_REQUEST = /\/api\/|api\.weather\.gov|earthquake\.usgs\.gov|tidesandcurrents\.noaa\.gov/;
/** A new legacy refresh cycle always starts with RSS fetches through /api/feeds. */
const FEED_REQUEST = /\/api\/feeds\?/;

function recordRequests(page: Page, pattern: RegExp): string[] {
	const seen: string[] = [];
	page.on('request', (req) => {
		if (pattern.test(req.url())) seen.push(req.url());
	});
	return seen;
}

async function v2Hydrated(page: Page) {
	await expect(page.locator('[data-layout="v2"][data-hydrated="true"]')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
	// Keep the legacy onboarding modal from covering the page.
	await page.addInitScript(() => localStorage.setItem('mm_onboardingComplete', 'true'));
});

test.describe('dashboard layout flag', () => {
	test('direct load of ?layout=v2 hydrates only v2 and starts no legacy loaders', async ({
		page
	}) => {
		const errors: string[] = [];
		page.on('pageerror', (e) => errors.push(e.message));
		const data = recordRequests(page, DATA_REQUEST);
		await page.goto('/?layout=v2');
		await v2Hydrated(page);
		// Interactivity proves hydration attached to the server markup.
		await page.locator('[data-layout="v2"] .picker-trigger').click();
		await expect(page.getByRole('listbox', { name: 'Marin towns' })).toBeVisible();
		await page.keyboard.press('Escape');
		await page.waitForTimeout(3_000);
		await expect(page.locator('[data-layout]')).toHaveCount(1);
		expect(data).toEqual([]);
		expect(errors).toEqual([]);
	});

	test('the default page is still the legacy dashboard and still loads data', async ({ page }) => {
		const data = recordRequests(page, DATA_REQUEST);
		await page.goto('/');
		await expect(page.locator('[data-layout="legacy"]')).toBeVisible();
		await expect(page.locator('[data-layout]')).toHaveCount(1);
		await expect.poll(() => data.length, { timeout: 15_000 }).toBeGreaterThan(0);
	});

	test('server HTML already carries the resolved layout (no client-side switch)', async ({
		request
	}) => {
		const v2 = await (await request.get('/?layout=v2')).text();
		expect(v2).toContain('data-layout="v2"');
		expect(v2).not.toContain('data-layout="legacy"');
		const legacy = await (await request.get('/')).text();
		expect(legacy).toContain('data-layout="legacy"');
		expect(legacy).not.toContain('data-layout="v2"');
	});

	// Origin headers only. Vercel strips s-maxage from client-visible responses, so the
	// deployed-CDN assertions live in dashboard-cache.spec.ts (production only).
	test('origin cache-control headers hold whichever layout is requested first', async ({
		request,
		baseURL
	}) => {
		test.skip(
			baseURL?.startsWith('https://') ?? false,
			'origin headers are asserted against the local server only'
		);
		for (const order of [
			['/', '/?layout=v2'],
			['/?layout=v2', '/']
		]) {
			for (const path of order) {
				const res = await request.get(path);
				const cacheControl = res.headers()['cache-control'];
				const html = await res.text();
				if (path.includes('layout=v2')) {
					expect(cacheControl).toBe('private, no-store');
					expect(html).toContain('data-layout="v2"');
				} else {
					expect(cacheControl).toContain('s-maxage=120');
					expect(html).toContain('data-layout="legacy"');
				}
			}
		}
		// Client navigation fetches __data.json; it follows the same policy.
		const v2Data = await request.get('/__data.json?layout=v2');
		expect(v2Data.headers()['cache-control']).toBe('private, no-store');
		const legacyData = await request.get('/__data.json');
		expect(legacyData.headers()['cache-control']).toContain('s-maxage=120');
	});

	test('client navigation v2 → legacy → v2, then back/forward, keeps exactly one layout', async ({
		page
	}) => {
		await page.goto('/?layout=v2');
		await v2Hydrated(page);
		await page.evaluate(() => {
			(window as unknown as { __mm: string }).__mm = 'same-document';
		});

		const legacyFeeds = recordRequests(page, FEED_REQUEST);
		await expect(page.locator('meta[name="robots"][content="noindex"]')).toHaveCount(1);
		await page.getByRole('link', { name: 'Leave preview' }).click();
		await expect(page.locator('[data-layout="legacy"]')).toBeVisible();
		await expect(page.locator('[data-layout]')).toHaveCount(1);
		// The preview's noindex must not linger on the indexable legacy page.
		await expect(page.locator('meta[name="robots"][content="noindex"]')).toHaveCount(0);
		await expect(page).toHaveTitle('Marin Monitor');
		// Let legacy start its refresh cycle, so requests it issues later cannot be mistaken for v2 leaks.
		await expect.poll(() => legacyFeeds.length, { timeout: 15_000 }).toBeGreaterThan(0);
		await page.waitForTimeout(1_000);

		// Legacy has no link to the preview. Add one inside the app root so the SvelteKit router handles it.
		await page.evaluate(() => {
			const a = document.createElement('a');
			a.href = '/?layout=v2';
			a.id = 'to-v2';
			a.textContent = 'to preview';
			document.querySelector('[data-layout="legacy"]')!.append(a);
			a.click();
		});
		await v2Hydrated(page);
		await expect(page.locator('[data-layout]')).toHaveCount(1);
		expect(await page.evaluate(() => (window as unknown as { __mm?: string }).__mm)).toBe(
			'same-document'
		);

		const feeds = recordRequests(page, FEED_REQUEST);
		await page.waitForTimeout(3_000);
		expect(feeds).toEqual([]); // no legacy refresh cycle starts under v2

		await page.goBack();
		await expect(page.locator('[data-layout="legacy"]')).toBeVisible();
		await page.goForward();
		await v2Hydrated(page);
		await expect(page.locator('[data-layout]')).toHaveCount(1);
	});
});
