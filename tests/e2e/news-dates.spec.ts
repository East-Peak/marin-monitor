import { expect, test } from '@playwright/test';

test('undated, future-dated and updated-only feed entries stay visible as "undated", after dated news, never fresh', async ({
	page
}) => {
	const now = Date.now();
	const dated = new Date(now - 2.5 * 3_600_000).toUTCString();
	const future = new Date(now + 3 * 86_400_000).toUTCString();
	const rss = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Fixture</title>
<item><title>Mill Valley undated notice</title><link>https://example.com/undated</link></item>
<item><title>Mill Valley future-dated notice</title><link>https://example.com/future</link><pubDate>${future}</pubDate></item>
<item><title>Mill Valley dated story</title><link>https://example.com/dated</link><pubDate>${dated}</pubDate></item>
</channel></rss>`;
	const atom = `<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Fixture</title>
<entry><title>Mill Valley updated-only entry</title><link rel="alternate" href="https://example.com/upd"/><updated>${new Date(now - 3_600_000).toISOString()}</updated><id>upd</id></entry>
</feed>`;
	let call = 0;
	await page.route(/\/api\/feeds\?/, (route) =>
		route.fulfill({
			status: 200,
			contentType: 'application/xml',
			body: call++ % 2 === 0 ? rss : atom
		})
	);
	await page.route(/\/api\/(article|geocode)\?/, (route) =>
		route.fulfill({ status: 404, body: '' })
	);
	await page.addInitScript(() => localStorage.setItem('mm_onboardingComplete', 'true'));

	await page.goto('/');
	const row = (title: string) => page.locator('.news-item', { hasText: title }).first();
	await expect(row('Mill Valley dated story')).toBeVisible({ timeout: 20_000 });
	await expect(row('Mill Valley dated story').locator('.item-time')).toHaveText('2h');
	for (const title of [
		'Mill Valley undated notice',
		'Mill Valley future-dated notice',
		'Mill Valley updated-only entry'
	]) {
		await expect(row(title)).toBeVisible();
		await expect(row(title).locator('.item-time')).toHaveText('undated');
	}
	const titles = (await page.locator('.news-item .item-title').allTextContents()).map((t) =>
		t.trim()
	);
	expect(titles.indexOf('Mill Valley dated story')).toBeLessThan(
		titles.indexOf('Mill Valley undated notice')
	);
	// Scoped to the fixture rows: real Mill Valley calendar events legitimately read "in 59d".
	const fixtureRows = page.locator('.news-item', {
		hasText: /Mill Valley (undated notice|future-dated notice|updated-only entry|dated story)/
	});
	await expect(fixtureRows.first()).toBeVisible();
	await expect(
		fixtureRows.locator('.item-time', { hasText: /^(just now|NaNd|soon|in \d)/ })
	).toHaveCount(0);
});
