import { expect, test } from '@playwright/test';
import { knownBroken, preparePhone } from './fixtures/phone-audit';

/**
 * MOBILE1: the phone dashboard's first paint is the page it becomes. What loads after it
 * (hydration, the brief, the cameras, the map, the advisories) fills space that was already
 * held, so nothing moves under a reader or a thumb.
 */
test.beforeEach(async ({ page }, info) => {
	knownBroken(info);
	await preparePhone(page);
});

test('@phone the first paint holds a place, sized, for everything that loads later', async ({
	request
}) => {
	const html = await (await request.get('/')).text();
	// Held, and never claiming "no data" before anything was read.
	for (const slot of ['brief', 'cams', 'map-preview'])
		expect(html, `${slot} is in the first paint`).toContain(`data-slot="${slot}"`);
	expect(html).toContain('Loading observation…');
	expect(html).toContain('Loading tides…');
	expect(html).not.toMatch(/Observation unavailable|Tide predictions unavailable/);
});

test('@phone hydration and the first data move nothing (layout shift ≤ 0.1)', async ({
	page
}, info) => {
	test.skip(info.project.name !== 'phone-chromium', 'WebKit has no LayoutShift API');
	await page.addInitScript(() => {
		const w = window as unknown as { __shift: number };
		w.__shift = 0;
		new PerformanceObserver((list) => {
			for (const e of list.getEntries() as unknown as { value: number; hadRecentInput: boolean }[])
				if (!e.hadRecentInput) w.__shift += e.value;
		}).observe({ type: 'layout-shift', buffered: true });
	});
	// A phone's pace (Lighthouse's mobile profile): on a fast machine hydration lands before the
	// first paint and there is nothing to see move. Slowed, the page paints first, as a phone's does.
	const cdp = await page.context().newCDPSession(page);
	await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
	await cdp.send('Network.enable');
	await cdp.send('Network.emulateNetworkConditions', {
		offline: false,
		latency: 150,
		downloadThroughput: (1.6 * 1024 * 1024) / 8,
		uploadThroughput: (750 * 1024) / 8
	});
	await page.goto('/');
	await expect(page.locator('[data-hydrated="true"][data-cycling="false"]')).toBeVisible({
		timeout: 45_000
	});
	await expect(page.locator('[data-card="weather"] .v2-card-value')).toBeVisible({
		timeout: 15_000
	});
	await expect(page.locator('img.cam-img').first()).toBeVisible({ timeout: 30_000 });
	await page.waitForTimeout(1_500);
	const shift = await page.evaluate(() => (window as unknown as { __shift: number }).__shift);
	expect(shift).toBeLessThanOrEqual(0.1);
});
