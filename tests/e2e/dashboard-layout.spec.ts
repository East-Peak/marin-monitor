import { expect, test, type Page } from '@playwright/test';

/**
 * Requests only the retired legacy layout made: browser RSS through /api/feeds, article and
 * geocode enrichment, Strava, and the NWS 7-day (non-hourly) forecast.
 */
const LEGACY_ONLY =
	/\/api\/(feeds|article|geocode)\b|\/api\/data\/strava|api\.weather\.gov\/gridpoints\/[A-Z]{3}\/\d+,\d+\/forecast(?:$|\?)/;

/** Every URL that used to pick a layout, and one that never did. */
const STALE_LAYOUT_URLS = ['/?layout=legacy', '/?layout=edit', '/?layout=v2', '/?layout=nonsense'];

function recordRequests(page: Page, pattern: RegExp): string[] {
	const seen: string[] = [];
	page.on('request', (req) => {
		if (pattern.test(req.url())) seen.push(req.url());
	});
	return seen;
}

async function hydrated(page: Page) {
	await expect(page.locator('[data-layout="v2"][data-hydrated="true"]')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
	await page.addInitScript(() => localStorage.setItem('mm_onboardingComplete', 'true'));
});

test.describe('one dashboard layout', () => {
	test('the dashboard hydrates, starts none of the retired layout’s loaders, and links to no old layout', async ({
		page
	}) => {
		const errors: string[] = [];
		page.on('pageerror', (e) => errors.push(e.message));
		const legacy = recordRequests(page, LEGACY_ONLY);
		await page.goto('/');
		await hydrated(page);
		// Interactivity proves hydration attached to the server markup.
		await page.locator('[data-layout="v2"] .picker-trigger').click();
		await expect(page.getByRole('listbox', { name: 'Marin towns' })).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(page.getByRole('link', { name: 'Old dashboard' })).toHaveCount(0);
		await page.waitForTimeout(3_000);
		await expect(page.locator('[data-layout]')).toHaveCount(1);
		expect(legacy).toEqual([]);
		expect(errors).toEqual([]);
	});

	test('a stale ?layout= link opens the same dashboard', async ({ page }) => {
		await page.goto('/?layout=legacy');
		await hydrated(page);
		await expect(page).toHaveURL(/\?layout=legacy$/);
		await expect(page.locator('[data-layout]')).toHaveCount(1);
	});

	test('server HTML is the same dashboard for / and every stale ?layout= URL', async ({
		request
	}) => {
		for (const path of ['/', ...STALE_LAYOUT_URLS]) {
			const res = await request.get(path);
			expect(res.status(), path).toBe(200);
			const html = await res.text();
			expect(html.match(/data-layout="/g), path).toHaveLength(1);
			expect(html, path).toContain('data-layout="v2"');
			expect(html, path).not.toMatch(/LegacyDashboard/);
		}
	});

	// Origin headers only. Vercel strips s-maxage from client-visible responses, so the
	// deployed-CDN assertions live in dashboard-cache.spec.ts (production only).
	test('origin cache-control does not depend on ?layout', async ({ request, baseURL }) => {
		test.skip(
			baseURL?.startsWith('https://') ?? false,
			'origin headers are asserted against the local server only'
		);
		// This server has no SSR news seed, so the page is private (DASH-FLIP1); the seeded public
		// header is asserted on the SSR server (dashboard-v2-ssr.spec.ts).
		for (const path of ['/', ...STALE_LAYOUT_URLS]) {
			const res = await request.get(path);
			expect(res.headers()['cache-control'], path).toBe('private, no-store');
			const data = await request.get(path.replace('/', '/__data.json'));
			expect(data.headers()['cache-control'], `${path} data`).toBe('private, no-store');
		}
	});

	test('meta: every URL is indexable and names the root as canonical', async ({ request }) => {
		const head = async (path: string) => {
			const html = await (await request.get(path)).text();
			return html.slice(0, html.indexOf('</head>'));
		};
		for (const path of ['/', ...STALE_LAYOUT_URLS]) {
			const h = await head(path);
			expect(h, path).toContain('<title>Marin Monitor</title>');
			// One owner (DashboardHead): app.html carries no title or description of its own.
			expect(h.match(/<title>/g), `${path} titles`).toHaveLength(1);
			expect(h.match(/name="description"/g), `${path} descriptions`).toHaveLength(1);
			expect(h, path).toContain('property="og:title" content="Marin Monitor"');
			expect(h, path).toContain('name="twitter:card" content="summary"');
			expect(h, path).toMatch(/name="description" content="Everything happening in Marin County/);
			expect(h, path).not.toContain('noindex');
			expect(h.match(/rel="canonical"/g), `${path} canonicals`).toHaveLength(1);
			expect(h, path).toMatch(/<link rel="canonical" href="https:\/\/marinmonitor\.com\/"\/?>/);
		}
	});
});
