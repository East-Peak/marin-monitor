/**
 * TV slice 3 in the BUILT app (npm run build, then preview): /tv reads news
 * only from GET /api/news/snapshot; no feed-proxy, article-enrichment or
 * geocode request is made; 311 pins RENDER on the visible county slide
 * without waiting on news; an unavailable snapshot shows as DEGRADED.
 * Pins are read from MapLibre (queryRenderedFeatures via the ?probe hook).
 */
import { expect, test, type Page } from '@playwright/test';
import { snapshotEnvelope } from './fixtures/news-snapshot';

const CHAIN = /\/api\/(feeds|article|geocode)(\?|$)/;
const STORY = 'Point Reyes oyster farm reopens';
const HOUR = 3_600_000;
const ISSUE = {
	id: 101,
	status: 'Open',
	summary: 'Illegal Dumping / Vertido ilegal',
	description: 'Couch left on the sidewalk',
	lat: 37.9735,
	lng: -122.5311,
	address: '1000 Fourth St, San Rafael, CA 94901',
	created_at: new Date(Date.now() - HOUR).toISOString(),
	html_url: 'https://seeclickfix.com/issues/101'
};

type Probe = { chain: string[]; snapshotServed: boolean };

async function setup(
	page: Page,
	snapshot: { status: number; body: string; delayMs?: number }
): Promise<Probe> {
	const probe: Probe = { chain: [], snapshotServed: false };
	await page.addInitScript(() => {
		localStorage.setItem('mm_onboardingComplete', 'true');
		localStorage.setItem('mm_tip_banner_dismissed', 'true');
	});
	// A deterministic world (Codex r2 #5), registered FIRST so the specific
	// routes below win: every external host except the CARTO basemap is
	// aborted at once, and any same-origin /api/** not stubbed below answers
	// a fast 503. Every TV loader therefore settles in well under a second.
	await page.route('**/*', (route) => {
		const url = new URL(route.request().url());
		if (url.hostname === 'localhost') {
			return url.pathname.startsWith('/api/')
				? route.fulfill({ status: 503, contentType: 'application/json', body: '{}' })
				: route.fallback();
		}
		return url.hostname.endsWith('cartocdn.com') ? route.fallback() : route.abort();
	});
	// The old chain is held open: anything still waiting on it would wait here.
	await page.route(CHAIN, (route) => {
		probe.chain.push(route.request().url());
	});
	await page.route('**/api/news/snapshot', async (route) => {
		if (snapshot.delayMs) await new Promise((r) => setTimeout(r, snapshot.delayMs));
		probe.snapshotServed = true;
		await route
			.fulfill({ status: snapshot.status, contentType: 'application/json', body: snapshot.body })
			.catch(() => {});
	});
	await page.route('**/api/data/311', (route) =>
		route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({ issues: [ISSUE] })
		})
	);
	return probe;
}

type ProbeMap = {
	getLayer(id: string): unknown;
	loaded(): boolean;
	queryRenderedFeatures(options: { layers: string[] }): unknown[];
};

/** ms since navigation when 311 pins are RENDERED on the visible county slide, else null. */
const rendered311 = (page: Page) =>
	page.evaluate(() => {
		const m = (window as unknown as { __tvProbeMap?: ProbeMap }).__tvProbeMap;
		const active = document
			.querySelector('[data-screen-id][aria-current="true"]')
			?.getAttribute('data-screen-id');
		if (!m || !m.getLayer('tv-overlay-311-dots') || !m.loaded() || active !== 'map-county')
			return null;
		return m.queryRenderedFeatures({ layers: ['tv-overlay-311-dots'] }).length > 0
			? performance.now()
			: null;
	});

test.describe('TV reads the news snapshot — built app', () => {
	test.use({ viewport: { width: 1920, height: 970 } });

	test('the Local News Wire comes from the snapshot; no feed, article or geocode request, no parser chunk', async ({
		page
	}) => {
		const body = snapshotEnvelope([{ title: STORY, hoursAgo: 1, slug: 'oysters' }], 7);
		const { generatedAt } = JSON.parse(body).snapshot as { generatedAt: string };
		const probe = await setup(page, { status: 200, body });
		const parserChunks: string[] = [];
		page.on('response', async (r) => {
			if (!/\/_app\/immutable\/.+\.js$/.test(r.url())) return;
			if ((await r.text().catch(() => '')).includes('onopentag')) parserChunks.push(r.url());
		});
		await page.goto('/tv');
		await page.getByRole('button', { name: 'Local News Wire' }).click();
		await expect(page.locator('h3', { hasText: STORY })).toBeVisible({ timeout: 15_000 });
		await expect(
			page.locator(`[data-news-revision="7"][data-news-generated-at="${generatedAt}"]`)
		).toHaveCount(1);
		await page.waitForTimeout(5_000);
		expect(probe.chain).toEqual([]);
		expect(parserChunks).toEqual([]);
	});

	test('311 pins render on the visible county slide while the snapshot is still pending', async ({
		page
	}) => {
		const probe = await setup(page, {
			status: 200,
			body: snapshotEnvelope([{ title: STORY, hoursAgo: 1, slug: 'oysters' }]),
			delayMs: 20_000
		});
		await page.goto('/tv?probe=1');
		await expect.poll(() => rendered311(page), { timeout: 10_000 }).not.toBeNull();
		expect(await rendered311(page)).toBeLessThan(7_000);
		expect(probe.snapshotServed).toBe(false);
	});

	test('an unavailable snapshot shows DEGRADED and keeps the TV running (pins, no NaN)', async ({
		page
	}) => {
		await setup(page, {
			status: 503,
			body: JSON.stringify({ status: 'unavailable', reason: 'missing' })
		});
		await page.goto('/tv?probe=1');
		// Concurrently: pins must render on the county slide without waiting for
		// the refresh that publishes DEGRADED (Codex r2 #5).
		await Promise.all([
			expect.poll(() => rendered311(page), { timeout: 10_000 }).not.toBeNull(),
			expect(page.getByText(/DEGRADED · \d+/)).toBeVisible({ timeout: 15_000 })
		]);
		await expect(page.locator('[data-news-revision]')).toHaveCount(0);
		await page.getByRole('button', { name: 'Local News Wire' }).click();
		await expect(page.locator('h3', { hasText: /Point Reyes/ })).toHaveCount(0);
		await expect(page.locator('body')).not.toContainText(/NaN[dhm]\b/);
	});
});
