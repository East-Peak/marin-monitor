/**
 * MAPX3: /map's first paint, from the SSR server that reads
 * tests/e2e/fixtures/news-snapshot-producer.json (playwright.config.ts, project "ssr").
 */
import { expect, test } from '@playwright/test';

test('with JS disabled, /map HTML is the shell: layer rail, a loading list and the seeded news', async ({
	browser
}) => {
	const context = await browser.newContext({
		javaScriptEnabled: false,
		viewport: { width: 1440, height: 900 }
	});
	const page = await context.newPage();
	await page.goto('/map');
	await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
	const rail = page.locator('[data-explore-shell-layers]');
	for (const name of ['Fix It Marin (311)', 'Traffic', 'Fire', 'Gas prices'])
		await expect(rail).toContainText(name);
	await expect(page.locator('[data-explore-shell-list]')).toContainText('Loading…');
	await expect(page.locator('[data-slot="latest-reporting"]')).toContainText(
		'San Rafael council approves Canal housing plan'
	);
	await expect(page.getByRole('link', { name: '← Dashboard' })).toHaveAttribute('href', '/');
	await context.close();
});

test('/map is publicly cached once seeded, and never indexed', async ({ request }) => {
	const res = await request.get('/map');
	expect(res.headers()['cache-control']).toBe('s-maxage=60, stale-while-revalidate=300');
	expect(await res.text()).toContain('<meta name="robots" content="noindex"');
});

test('/map hydrates with no mismatch', async ({ page }) => {
	const warnings: string[] = [];
	page.on('console', (m) => {
		if (/hydration/i.test(m.text())) warnings.push(m.text());
	});
	// Origin-anchored: the dev server's own modules live under /src/lib/api/.
	await page.route(/^https?:\/\/[^/]+\/api\/|earthquake\.usgs\.gov/, (r) =>
		r.fulfill({ status: 503, body: 'stubbed' })
	);
	await page.goto('/map');
	// The dev server compiles /map on its first visit.
	await expect(page.locator('[data-layout="explore"]')).toHaveAttribute('data-hydrated', 'true', {
		timeout: 30_000
	});
	await expect(page.locator('[data-layer-panel][data-rail]')).toBeVisible();
	expect(warnings).toEqual([]);
});
