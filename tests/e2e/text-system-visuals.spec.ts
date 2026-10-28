import { readFileSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { stubCams } from './fixtures/cams';
import { stubBrief, stubCivic, stubCost, stubRest } from './fixtures/v2-populated';

/**
 * TEXT1 changes text, rows and disclosures only (Stuart, 2026-10-28): every chart, map and image
 * the page drew before TEXT1 is still drawn after it. BASELINE was captured from 9c3ce96 (the
 * commit before TEXT1) with CAPTURE_VISUALS=<file>; each run holds the page to it.
 */
test.skip(({ baseURL }) => baseURL?.startsWith('https://') ?? false, 'stubbed');

const BASELINE_FILE = 'tests/e2e/fixtures/visuals-before-text1.json';
const capture = process.env.CAPTURE_VISUALS;

/**
 * One key per drawn visual: where it sits, what it is, what it's called (figures folded). Drawn
 * means more than a shell (Codex 1b #5): an image decoded, a chart with marks, the map loaded.
 */
const inventory = (page: Page) =>
	page.evaluate(() => {
		const root = document.querySelector('[data-layout="v2"]')!;
		const map = (window as unknown as { __v2ProbeMap?: { loaded(): boolean } }).__v2ProbeMap;
		const drawn = (el: Element) =>
			el instanceof HTMLImageElement
				? el.complete && el.naturalWidth > 0
				: el instanceof HTMLCanvasElement
					? !!el.closest('.v2-map') && map?.loaded() === true
					: [...el.querySelectorAll('path, circle, rect, line, polyline, polygon')].some((m) =>
							m.tagName === 'path'
								? (m.getAttribute('d') ?? '').length > 1
								: m.getAttribute('r') !== '0'
						);
		const counts: Record<string, number> = {};
		for (const el of root.querySelectorAll('svg, canvas, img')) {
			if (el.parentElement?.closest('svg')) continue; // a nested svg is part of its chart
			const r = el.getBoundingClientRect();
			if (r.width < 1 || r.height < 1 || !el.checkVisibility({ checkVisibilityCSS: true }))
				continue;
			if (!drawn(el)) continue;
			const place =
				el.closest('section[id]')?.id ??
				el.closest('[data-slot]')?.getAttribute('data-slot') ??
				'page';
			const holder = el.closest('[data-card], [data-chart], [data-slot]');
			const what =
				holder?.getAttribute('data-card') ??
				holder?.getAttribute('data-chart') ??
				holder?.getAttribute('data-slot') ??
				'';
			// A class name without Svelte's per-build hash.
			const cls = [...el.classList].filter((c) => !c.startsWith('svelte-')).join(' ');
			const name = (el.getAttribute('aria-label') ?? el.getAttribute('alt') ?? cls)
				.replace(/[\d.,:−-]+/g, '#')
				.replace(/\s+/g, ' ')
				.trim()
				.slice(0, 60);
			// How it's drawn, so a changed chart or image is caught, not only a missing one (Codex
			// 1d #2): a chart's kinds of marks and their colours, an image's source. Counts vary
			// with the clock, so they stay out.
			const drawing =
				el instanceof HTMLImageElement
					? (el.currentSrc || el.src).startsWith('blob:')
						? 'blob' // a frame fetched and drawn locally (Caltrans): a fresh URL each load
						: new URL(el.currentSrc || el.src, location.href).pathname
					: el instanceof SVGElement
						? [
								...new Set(
									[...el.querySelectorAll('path, circle, rect, line, polyline, polygon')].map(
										(m) => {
											const cs = getComputedStyle(m);
											return `${m.tagName}:${cs.stroke}/${cs.fill}`;
										}
									)
								)
							]
								.sort()
								.join(' ')
						: '';
			const key = `${place} | ${what} | ${el.tagName.toLowerCase()} | ${name} | ${drawing}`;
			counts[key] = (counts[key] ?? 0) + 1;
		}
		return counts;
	});

/** The same inventory twice, a full second apart: the page has stopped drawing. */
async function settledInventory(page: Page) {
	let last = await inventory(page);
	for (let i = 0; i < 30; i++) {
		await page.waitForTimeout(1_000);
		const now = await inventory(page);
		if (JSON.stringify(now) === JSON.stringify(last)) return now;
		last = now;
	}
	throw new Error('the page kept drawing for 30 s');
}

for (const [name, viewport] of [
	['1440', { width: 1440, height: 1000 }],
	['390', { width: 390, height: 844 }]
] as const) {
	test(`every chart, map and image from before TEXT1 still renders at ${name}`, async ({
		page
	}) => {
		test.setTimeout(120_000);
		await page.setViewportSize(viewport);
		await stubRest(page);
		await stubBrief(page); // includes Outdoors' reads
		await stubCost(page);
		await stubCivic(page);
		await stubCams(page);
		await page.goto('/?layout=v2&probe');
		await expect(page.locator('[data-layout="v2"][data-hydrated="true"]')).toBeVisible();
		await expect(page.locator('.v2-map .maplibregl-canvas')).toBeVisible({ timeout: 20_000 });
		// On the phone every section opens (desktop's are always open).
		const closed = page.locator('[data-section-toggle][aria-expanded="false"]');
		while ((await closed.count()) > 0) await closed.first().click();
		// Through the page once, so whatever loads on view (the cam wall's frames) has loaded.
		for (let y = 0; y < (await page.evaluate(() => document.documentElement.scrollHeight)); ) {
			await page.evaluate((top) => window.scrollTo({ top, behavior: 'instant' }), y);
			await page.waitForTimeout(250);
			y += viewport.height / 2;
		}
		await expect(page.locator('[data-camera-id] img').first()).toBeAttached({ timeout: 20_000 });
		await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
		const seen = await settledInventory(page);
		// Negative control: a broken image and an empty chart are shells, not visuals.
		const shells = await page.evaluate(() => {
			const host = document.querySelector('[data-layout="v2"] section[id]')!;
			host.insertAdjacentHTML(
				'beforeend',
				'<img alt="shell" src="data:," width="40" height="40"><svg aria-label="shell" width="40" height="40"></svg>'
			);
			return host.id;
		});
		const withShells = await inventory(page);
		expect(
			Object.keys(withShells).filter((k) => k.startsWith(`${shells} |`) && k.includes('shell'))
		).toEqual([]);

		if (capture) {
			const all = (() => {
				try {
					return JSON.parse(readFileSync(capture, 'utf8'));
				} catch {
					return {};
				}
			})();
			writeFileSync(capture, JSON.stringify({ ...all, [name]: seen }, null, '\t') + '\n');
			return;
		}
		const before: Record<string, number> = JSON.parse(readFileSync(BASELINE_FILE, 'utf8'))[name];
		expect(Object.keys(before).length).toBeGreaterThan(5);
		const missing = Object.entries(before)
			.filter(([key, n]) => (seen[key] ?? 0) < n)
			.map(([key, n]) => `${key}: ${seen[key] ?? 0} of ${n}`);
		expect(missing, 'visuals drawn before TEXT1 and not now').toEqual([]);
	});
}
