import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { SERVED_FRAME, stubCams } from './fixtures/cams';
import { preparePhone } from './fixtures/phone-audit';

/**
 * MOBILE1: the phone dashboard's first paint is the page it becomes. What loads after it
 * (hydration, the brief, the cameras, the map, the advisories) fills space that was already
 * held, so nothing moves under a reader or a thumb.
 */
test.beforeEach(async ({ page }) => {
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
	// The advisories read on the server (the phone server's seed: two Coastal Flood Advisories).
	expect(html.match(/Coastal Flood Advisory<\/span>/g)?.length).toBe(2);
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
	// The phone bench's weather (fixtures/phone-audit.ts), not whatever NWS says right now.
	await expect(page.locator('[data-card="weather"] .v2-card-value')).toHaveText('64°F', {
		timeout: 15_000
	});
	// The first camera settled, whichever way: a picture, or a camera that is offline.
	await expect(page.locator('a.cam-tile').first()).toHaveAttribute(
		'data-status',
		/live|stale|offline/,
		{ timeout: 30_000 }
	);
	await page.waitForTimeout(1_500);
	const shift = await page.evaluate(() => (window as unknown as { __shift: number }).__shift);
	expect(shift).toBeLessThanOrEqual(0.1);
});

test('@phone with cameras hidden in ⚙, the page holds still and asks for no camera', async ({
	page
}) => {
	await page.addInitScript(() => localStorage.setItem('mm_camerasHidden', 'true'));
	const frames: string[] = [];
	page.on('request', (r) => {
		// The sources, and our own first-frame route (LCP1).
		if (/alertcalifornia|cwwp2\.dot\.ca\.gov|\/api\/cams\/frame\//.test(r.url()))
			frames.push(r.url());
	});
	// The server's HTML first, alone: the app's scripts held until it has been measured.
	let release!: () => void;
	const held = new Promise<void>((done) => (release = done));
	await page.route('**/_app/immutable/**/*.js', async (r) => {
		await held;
		await r.fallback();
	});
	await page.goto('/', { waitUntil: 'domcontentloaded' });
	const mapY = () =>
		page.locator('#map').evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
	const before = await mapY();
	await expect(page.getByText('Cameras are hidden.')).toBeVisible();
	release();
	await expect(page.locator('[data-hydrated="true"][data-cycling="false"]')).toBeVisible({
		timeout: 20_000
	});
	await expect(page.getByText('Cameras are hidden.')).toBeVisible();
	expect(Math.abs((await mapY()) - before)).toBeLessThan(1);
	expect(frames).toEqual([]);
});

test('@phone the largest paint is the first camera frame, from the HTML, before any script (LCP1)', async ({
	page
}) => {
	// A real frame's bytes: the browser ignores a flat stand-in (low entropy) as a largest paint.
	const real = readFileSync(
		new URL('../../src/lib/dashboard/__fixtures__/caltrans-frame.jpg', import.meta.url)
	);
	const seen = await stubCams(page, { jpeg: () => real });
	let release!: () => void;
	const held = new Promise<void>((done) => (release = done));
	await page.route('**/_app/immutable/**/*.js', async (r) => {
		await held;
		await r.fallback();
	});
	await page.goto('/', { waitUntil: 'domcontentloaded' });
	const first = page.locator('section#cams [data-cam-slot]').first().locator('img.cam-img');
	await expect
		.poll(() => first.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0))
		.toBe(true);
	await expect(first).toBeVisible();
	await expect(page.locator('[data-hydrated="false"]').first()).toBeAttached();
	expect(seen.filter((u) => SERVED_FRAME.test(u))).toHaveLength(1);
	// The browser reports a paint a frame or more after it: wait for an image's entry (or 5 s).
	const lcp = await page.evaluate(
		() =>
			new Promise<string | null>((done) => {
				if (!PerformanceObserver.supportedEntryTypes.includes('largest-contentful-paint'))
					return done('unsupported');
				let last: string | null = null;
				new PerformanceObserver((list) => {
					const e = list.getEntries().at(-1) as unknown as { element: Element | null };
					last = e?.element?.getAttribute('src') ?? e?.element?.tagName ?? null;
					if (e?.element instanceof HTMLImageElement) done(last);
				}).observe({ type: 'largest-contentful-paint', buffered: true });
				setTimeout(() => done(last), 5_000);
			})
	);
	if (lcp !== 'unsupported') expect(lcp).toMatch(SERVED_FRAME);
	release();
});
