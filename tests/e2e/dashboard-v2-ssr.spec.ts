/**
 * DASH-FLIP1: v2's first paint carries real news. This spec's server alone reads
 * tests/e2e/fixtures/news-snapshot-producer.json as its server-side snapshot
 * (playwright.config.ts, project "ssr"): five dated Marin stories.
 */
import { expect, test, type Page } from '@playwright/test';

const ROWS = '[data-slot="latest-reporting"] [data-reporting-row]';

/** Every client read fails: whatever the page shows came from the server. */
async function stub(page: Page) {
	await page.route(
		/\/api\/(data|nps|transit|airport-status|traffic|health|feeds|article|geocode|news|cams)\b|earthquake\.usgs\.gov|api\.weather\.gov|tidesandcurrents|airnowapi/,
		(r) => r.fulfill({ status: 503, body: 'stubbed' })
	);
}

for (const [name, viewport] of [
	['desktop', { width: 1440, height: 900 }],
	['phone', { width: 390, height: 844 }]
] as const) {
	test(`${name}: with JS disabled, /?layout=v2 HTML has five Latest-reporting items with their times`, async ({
		browser
	}) => {
		const context = await browser.newContext({ javaScriptEnabled: false, viewport });
		const page = await context.newPage();
		await page.goto('/?layout=v2');
		await expect(page.locator(ROWS)).toHaveCount(5);
		// "source · age · scope": the fixture's stories are dated, so each age is a time or a date.
		for (const row of await page.locator(ROWS).all())
			await expect(row.locator('.v2-news-meta')).toHaveText(
				/ · (\d+ min ago|\d+ h ago|[A-Z][a-z]{2} \d{1,2}) · /
			);
		await expect(page.locator('[data-slot="latest-reporting"]')).toContainText(
			'San Rafael council approves Canal housing plan'
		);
		// The fixture holds no Marin Lately piece: no band, no "quiet" text.
		await expect(page.locator('[data-slot="lately"]')).toHaveCount(0);
		await context.close();
	});
}

test('the default / is v2 with the seeded news in its HTML, publicly cached and indexable', async ({
	request
}) => {
	const res = await request.get('/');
	expect(res.headers()['cache-control']).toBe('s-maxage=60, stale-while-revalidate=300');
	const html = await res.text();
	expect(html).toContain('data-layout="v2"');
	expect(html).toContain('San Rafael council approves Canal housing plan');
	expect(html).not.toContain('noindex');
	expect(html).not.toContain('rel="canonical"');
});

test('a saved town: hydration adopts the county-wide server rows, then the list narrows once', async ({
	page
}) => {
	const warnings: string[] = [];
	page.on('console', (m) => {
		if (/hydration/i.test(m.text())) warnings.push(m.text());
	});
	await stub(page);
	await page.addInitScript(() => {
		localStorage.setItem('mm_town', 'novato');
		// Parsing done, scripts not yet run: hold the server-rendered rows.
		document.addEventListener('readystatechange', () => {
			if (document.readyState !== 'interactive') return;
			const rows = [...document.querySelectorAll('[data-reporting-row]')];
			Object.assign(window, {
				ssrRows: rows.length,
				ssrNovato: rows.find((r) => r.textContent?.includes('Novato')) ?? null
			});
		});
	});
	await page.goto('/?layout=v2');
	await expect(page.locator('[data-layout="v2"]')).toHaveAttribute('data-hydrated', 'true');
	await expect(page.locator(ROWS)).toHaveCount(1);
	await expect(page.locator(ROWS)).toContainText('Novato');
	// County-wide in the HTML. A first client render that already read the saved town would
	// not match it: Svelte would patch the first server row into Novato's and drop the rest.
	// Matching, hydration adopts all five and the keyed narrowing keeps Novato's own node.
	const ssr = await page.evaluate((sel) => {
		const w = window as unknown as { ssrRows: number; ssrNovato: Element | null };
		return { rows: w.ssrRows, kept: w.ssrNovato === document.querySelector(sel) };
	}, ROWS);
	expect(ssr).toEqual({ rows: 5, kept: true });
	expect(warnings).toEqual([]);
});
