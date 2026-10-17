import { expect, test, type Page } from '@playwright/test';
import { DEFAULT_DASHBOARD_LAYOUT } from '../../src/lib/dashboard/layout-flag';

/** Requests only the legacy dashboard's loaders make (news, weather, datasets, Strava). */
const DATA_REQUEST = /\/api\/|api\.weather\.gov|earthquake\.usgs\.gov|tidesandcurrents\.noaa\.gov/;
/** A new legacy refresh cycle always starts with RSS fetches through /api/feeds. */
const FEED_REQUEST = /\/api\/feeds\?/;
/**
 * Requests only the legacy controller makes. v2 reads the snapshot, its own
 * /api/data/* and /api/transit, and (PR 8) the NWS hourly/observation/alert URLs;
 * after the NWS zone fix legacy and v2 query the same alert URL, so alerts are
 * not a legacy signature. The 7-day `/forecast` (non-hourly) is legacy-only.
 */
const LEGACY_ONLY =
	/\/api\/(feeds|article|geocode)\b|\/api\/data\/strava|api\.weather\.gov\/gridpoints\/[A-Z]{3}\/\d+,\d+\/forecast(?:$|\?)/;

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
		// v2 owns its essentials since D1 PR 6; what must never start is legacy work or Strava.
		expect(data.filter((u) => LEGACY_ONLY.test(u))).toEqual([]);
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
		const legacy = await (await request.get('/?layout=legacy')).text();
		expect(legacy).toContain('data-layout="legacy"');
		expect(legacy).not.toContain('data-layout="v2"');
	});

	// Origin headers only. Vercel strips s-maxage from client-visible responses, so the
	// deployed-CDN assertions live in dashboard-cache.spec.ts (production only).
	test('origin cache-control: only the default layout is public, whichever is requested first', async ({
		request,
		baseURL
	}) => {
		test.skip(
			baseURL?.startsWith('https://') ?? false,
			'origin headers are asserted against the local server only'
		);
		// This server has no SSR news seed, so a default v2 is private too (DASH-FLIP1);
		// the seeded public header is asserted on the SSR server (dashboard-v2-ssr.spec.ts).
		const defaultCache =
			DEFAULT_DASHBOARD_LAYOUT === 'legacy'
				? 's-maxage=120, stale-while-revalidate=300'
				: 'private, no-store';
		const expected: Record<string, [string, string]> = {
			'/': [defaultCache, DEFAULT_DASHBOARD_LAYOUT],
			'/?layout=v2': ['private, no-store', 'v2'],
			'/?layout=legacy': ['private, no-store', 'legacy']
		};
		for (const order of [Object.keys(expected), Object.keys(expected).reverse()]) {
			for (const path of order) {
				const res = await request.get(path);
				const [cache, layout] = expected[path];
				expect(res.headers()['cache-control'], path).toBe(cache);
				expect(await res.text(), path).toContain(`data-layout="${layout}"`);
			}
		}
		// Client navigation fetches __data.json; it follows the same policy.
		for (const [path, [cache]] of Object.entries(expected)) {
			const data = await request.get(path.replace('/', '/__data.json'));
			expect(data.headers()['cache-control'], `${path} data`).toBe(cache);
		}
	});

	test('meta: the default is indexable; each ?layout override is noindex, v2’s canonical to /', async ({
		request
	}) => {
		const head = async (path: string) => {
			const html = await (await request.get(path)).text();
			return html.slice(0, html.indexOf('</head>'));
		};
		for (const path of ['/', '/?layout=v2', '/?layout=legacy']) {
			const h = await head(path);
			expect(h, path).toContain('<title>Marin Monitor</title>');
			expect(h, path).toContain('property="og:title" content="Marin Monitor"');
			expect(h, path).toContain('name="twitter:card" content="summary"');
			expect(h, path).toMatch(/name="description" content="Everything happening in Marin County/);
		}
		expect(await head('/')).not.toContain('noindex');
		expect(await head('/')).not.toContain('rel="canonical"');
		expect(await head('/?layout=v2')).toContain('name="robots" content="noindex"');
		expect(await head('/?layout=v2')).toMatch(
			/<link rel="canonical" href="https:\/\/marinmonitor\.com\/"\/?>/
		);
		expect(await head('/?layout=legacy')).toContain('name="robots" content="noindex"');
		expect(await head('/?layout=legacy')).not.toContain('rel="canonical"');
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
		await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
		await page.getByRole('link', { name: 'Old dashboard' }).click();
		await expect(page.locator('[data-layout="legacy"]')).toBeVisible();
		await expect(page.locator('[data-layout]')).toHaveCount(1);
		// v2's canonical must not linger on the legacy override; both overrides stay noindex.
		await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
		await expect(page.locator('meta[name="robots"][content="noindex"]')).toHaveCount(1);
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
