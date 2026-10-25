import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';
import { openPhone, preparePhone, swipe } from './fixtures/phone-audit';
import { settled } from './fixtures/v2-probe';

/**
 * MOBILE1 interaction speed: tap to the result painted, on the Pixel at 4× CPU slowdown.
 * Measurement only: it never asserts a time (CI has no absolute timings). Run it alone:
 *   PHONE_PERF=1 npx playwright test phone-speed --project=phone-chromium --workers=1
 * Results go to test-results/phone-speed.json.
 */
test.skip(!process.env.PHONE_PERF, 'measurement: set PHONE_PERF=1');
test.skip(({ browserName }) => browserName !== 'chromium', 'CDP CPU throttling is Chromium-only');

const RUNS = 3;
const results: Record<string, number[]> = {};
const note = (name: string, ms: number) => (results[name] ??= []).push(Math.round(ms));

async function throttle(page: Page): Promise<CDPSession> {
	const cdp = await page.context().newCDPSession(page);
	await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
	return cdp;
}

/**
 * Arms the page: the next tap's input timestamp and the first frame in which
 * `done` holds. Returns ms from the tap to that frame.
 */
async function arm(page: Page, done: string, from = /pointerdown|touchstart/) {
	await page.evaluate(
		([src, fromSrc]) => {
			const w = window as unknown as { __tapAt?: number; __doneAt?: number };
			w.__tapAt = undefined;
			w.__doneAt = undefined;
			const check = new Function(`return (${src})`) as () => boolean;
			// A finger that is still moving: timed from the input named by `from`.
			// The input's own timestamp (when the finger acted), not when a handler ran.
			for (const type of ['pointerdown', 'touchstart', 'pointerup', 'touchend', 'click'])
				if (new RegExp(fromSrc).test(type))
					addEventListener(type, (e) => (w.__tapAt ??= e.timeStamp), { capture: true, once: true });
			const frame = () => {
				if (check()) {
					// The frame after the change is the one that paints it.
					requestAnimationFrame((t) => (w.__doneAt = t));
					return;
				}
				requestAnimationFrame(frame);
			};
			requestAnimationFrame(frame);
		},
		[done, from.source]
	);
	return async () => {
		await expect
			.poll(() => page.evaluate(() => (window as unknown as { __doneAt?: number }).__doneAt), {
				timeout: 15_000
			})
			.toBeDefined();
		return page.evaluate(() => {
			const w = window as unknown as { __tapAt?: number; __doneAt: number; __tapFallback: number };
			return w.__doneAt - (w.__tapAt ?? w.__tapFallback);
		});
	};
}
/** Taps the centre of a locator, noting a fallback start in case Event Timing saw nothing. */
async function tap(page: Page, x: number, y: number) {
	await page.evaluate(
		() => ((window as unknown as { __tapFallback: number }).__tapFallback = performance.now())
	);
	await page.touchscreen.tap(x, y);
}

test.describe.configure({ mode: 'serial' });

test.describe('@phone speed', () => {
	test.beforeEach(async ({ page }) => {
		await preparePhone(page);
	});

	test.afterAll(() => {
		mkdirSync('test-results', { recursive: true });
		const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
		const out = Object.fromEntries(
			Object.entries(results).map(([k, xs]) => [k, { median: median(xs), runs: xs }])
		);
		writeFileSync('test-results/phone-speed.json', JSON.stringify(out, null, 2));
		console.log(JSON.stringify(out, null, 2));
	});

	for (let run = 0; run < RUNS; run++) {
		test(`dashboard journeys (run ${run + 1})`, async ({ page }) => {
			await openPhone(page, '/', page.locator('.v2-news-title'));
			await expect(page.locator('[data-hydrated="true"]')).toBeVisible();
			await page.waitForLoadState('networkidle').catch(() => {});
			const cdp = await throttle(page);

			for (const id of ['getting-around', 'outdoors', 'news', 'cost', 'events']) {
				const t = page.locator(`[data-section-toggle="${id}"]`);
				await t.scrollIntoViewIfNeeded();
				const b = (await t.boundingBox())!;
				const painted = await arm(
					page,
					`(document.querySelector('#${id} .v2-section-body')?.innerText.trim().length ?? 0) > 40`
				);
				await tap(page, b.x + b.width / 2, b.y + b.height / 2);
				note(`expand ${id}`, await painted());
				// Closed again, so the next toggle is where it was measured.
				await t.tap();
				await expect(page.locator(`#${id} .v2-section-body`)).toBeHidden();
				await page.waitForTimeout(300);
			}

			// Open a camera: the tap opens the viewer (CAMVIEW1), its first frame decoded.
			await page.evaluate(() => window.scrollTo(0, 0));
			const tile = page.locator('a.cam-tile').first();
			await tile.scrollIntoViewIfNeeded();
			const tb = (await tile.boundingBox())!;
			await page.evaluate(
				() => ((window as unknown as { __tapFallback: number }).__tapFallback = performance.now())
			);
			const t0 = Date.now();
			await page.touchscreen.tap(tb.x + tb.width / 2, tb.y + tb.height / 2);
			await expect(page.locator('[data-cam-viewer] .viewer-img')).toBeVisible();
			note('open a camera (tap → viewer frame)', Date.now() - t0);
			await page.locator('[data-cam-viewer]').getByRole('button', { name: 'Close' }).tap();
			await expect(page.locator('[data-cam-viewer]')).toBeHidden();

			// Scroll the whole dashboard with a finger: long frames over 50 ms.
			await page.evaluate(() => window.scrollTo(0, 0));
			await page.evaluate(() => {
				const w = window as unknown as { __frames: number[] };
				w.__frames = [];
				let last = performance.now();
				const f = (t: number) => {
					w.__frames.push(t - last);
					last = t;
					if (w.__frames.length < 2000) requestAnimationFrame(f);
				};
				requestAnimationFrame(f);
			});
			const height = await page.evaluate(() => document.documentElement.scrollHeight);
			await cdp.send('Input.synthesizeScrollGesture', {
				x: 200,
				y: 600,
				yDistance: -height,
				gestureSourceType: 'touch',
				speed: 2500
			});
			const frames = await page.evaluate(
				() => (window as unknown as { __frames: number[] }).__frames
			);
			note('scroll: frames > 50 ms', frames.filter((d) => d > 50).length);
			note('scroll: longest frame', Math.max(...frames));
		});

		test(`map journeys (run ${run + 1})`, async ({ page }) => {
			// map-ready: from navigation start to the first pan the map answers.
			const cdp = await throttle(page);
			await page.goto('/map?probe', { waitUntil: 'commit' });
			let readyAt: number | null = null;
			const deadline = Date.now() + 30_000;
			while (readyAt === null && Date.now() < deadline) {
				const canvas = await page
					.locator('.v2-map-canvas canvas')
					.boundingBox()
					.catch(() => null);
				const ready = await page.evaluate(
					() => !!(window as unknown as { __v2ProbeMap?: unknown }).__v2ProbeMap
				);
				if (canvas && ready) {
					const center = () =>
						page.evaluate(() => {
							const c = (
								window as unknown as { __v2ProbeMap: { getCenter(): { lng: number } } }
							).__v2ProbeMap.getCenter();
							return c.lng;
						});
					const before = await center();
					const mid = { x: canvas.x + canvas.width / 2, y: canvas.y + canvas.height * 0.4 };
					await swipe(page, mid, { x: mid.x - 60, y: mid.y }, 4);
					await page.waitForTimeout(50);
					if (Math.abs((await center()) - before) > 1e-6)
						readyAt = await page.evaluate(() => performance.now());
				} else await page.waitForTimeout(100);
			}
			expect(readyAt).not.toBeNull();
			note('map-ready (nav → first answered pan)', readyAt!);

			await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
			await settled(page);
			await expect(page.locator('[data-sheet-handle]')).toHaveText(/In view · [1-9]/, {
				timeout: 20_000
			});
			await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

			// Select a pin: whatever inspectable point is topmost, clear of the sheet.
			const at = await page.evaluate(() => {
				type M = {
					queryRenderedFeatures(
						g?: unknown
					): { layer: { id: string }; geometry: { type: string; coordinates: number[] } }[];
					project(c: number[]): { x: number; y: number };
					getCanvas(): HTMLCanvasElement;
				};
				const m = (window as unknown as { __v2ProbeMap: M }).__v2ProbeMap;
				const r = m.getCanvas().getBoundingClientRect();
				for (const f of m.queryRenderedFeatures()) {
					if (f.geometry.type !== 'Point' || !/hit-layer$/.test(f.layer.id)) continue;
					const p = m.project(f.geometry.coordinates);
					if (p.x < 40 || p.y < 80 || p.x > r.width - 40 || p.y > r.height - 120) continue;
					if (m.queryRenderedFeatures([p.x, p.y])[0]?.layer.id === f.layer.id)
						return { x: r.left + p.x, y: r.top + p.y };
				}
				return null;
			});
			expect(at).not.toBeNull();
			let painted = await arm(page, `!!document.querySelector('[role="dialog"] [data-detail]')`);
			await tap(page, at!.x, at!.y);
			note('select a map pin', await painted());
			await page.getByRole('dialog').getByRole('button', { name: 'Close' }).tap();
			await expect(page.getByRole('dialog')).toHaveCount(0);

			// Drag the sheet up.
			const h = (await page.locator('[data-sheet-handle]').boundingBox())!;
			// Timed from the finger lifting: the drag itself is the user's, not the page's.
			painted = await arm(
				page,
				`!!document.querySelector('[data-sheet] [data-in-view-row]')`,
				/pointerup|touchend/
			);
			await page.evaluate(
				() => ((window as unknown as { __tapFallback: number }).__tapFallback = performance.now())
			);
			await swipe(
				page,
				{ x: h.x + h.width / 2, y: h.y + h.height / 2 },
				{ x: h.x + h.width / 2, y: h.y - 100 }
			);
			note('drag the map sheet', await painted());
		});

		test(`cost journey (run ${run + 1})`, async ({ page }) => {
			await openPhone(page, '/cost/larkspur', page.locator('section.budget details'));
			await throttle(page);
			const link = page.locator('a[href="/cost/mill-valley"]').first();
			const b = (await link.boundingBox())!;
			const painted = await arm(
				page,
				`location.pathname === '/cost/mill-valley' && !!document.querySelector('section.budget details')`
			);
			await tap(page, b.x + b.width / 2, b.y + b.height / 2);
			note('change the household (/cost)', await painted());
		});
	}
});
