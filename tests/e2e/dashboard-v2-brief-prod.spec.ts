import { expect, test } from '@playwright/test';
import { SETTLED_HEALTH_LABEL } from '../../src/lib/dashboard/health-labels';

test.skip(({ baseURL }) => !baseURL?.startsWith('https://'), 'production readback only');

test('production brief: every card answers or says why not; nothing says LIVE or just now', async ({
	page
}) => {
	await page.goto(`/?layout=v2&cb=${Date.now()}`);
	await expect(page.locator('[data-layout="v2"][data-hydrated="true"]')).toBeVisible();
	await expect(page.locator('[data-card="weather"]')).toContainText(
		/Observed at Gnoss Field \(Novato\)|Observation unavailable/,
		{ timeout: 30_000 }
	);
	await expect(page.locator('[data-card="rain"]')).toContainText(
		/Rain today: \d+%|Rain chance unknown|Forecast unavailable/,
		{ timeout: 30_000 }
	);
	await expect(page.locator('[data-card="tide"]')).toContainText(
		/(Point Reyes|San Francisco) · NOAA prediction|Tide predictions unavailable/,
		{ timeout: 30_000 }
	);
	// The same pattern the unit test proves every settled label matches, "Sources: degraded" included (Codex r2 #6).
	await expect(page.getByRole('button', { name: SETTLED_HEALTH_LABEL })).toBeVisible({
		timeout: 30_000
	});
	for (const card of await page.locator('[data-card]').all()) {
		expect(await card.getAttribute('data-state')).toMatch(
			/^(loading|ok|stale|unavailable|unknown)$/
		);
	}
	expect(await page.locator('main').innerText()).not.toMatch(/\bLIVE\b|just now|all clear/i);
});
