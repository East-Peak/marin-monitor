import { expect, test, type Page } from '@playwright/test';
import { mapCenter, settled } from './fixtures/v2-probe';

/**
 * The desktop map's way back (Stuart, 2026-10-16): clicking a town flies in, and "All of
 * Marin" returns to the opening county view and clears the town. The key under it says how
 * each layer is placed (stories by town circle, not street). Readiness is the probe map.
 */
type CameraMap = {
	getZoom(): number;
	queryRenderedFeatures(o: { layers: string[] }): {
		properties: Record<string, unknown>;
		geometry: { coordinates: number[] };
	}[];
	queryRenderedFeatures(box: [[number, number], [number, number]]): { layer: { id: string } }[];
	project(c: number[]): { x: number; y: number };
	getCanvas(): HTMLCanvasElement;
};
const zoom = (page: Page) =>
	page.evaluate(
		() => (window as unknown as { __v2ProbeMap?: CameraMap }).__v2ProbeMap?.getZoom() ?? -1
	);
/**
 * A town whose circle is the only thing under its point (311 pins and fire-context landmarks
 * win clicks over circles, and some sit on Fairfax), with its point on the map canvas (not the
 * page: the page above the map can still shift before the click). Fairfax first.
 */
const clickableTown = (page: Page) =>
	page.evaluate((winners) => {
		const CLICK_WINNERS = new RegExp(winners);
		const m = (window as unknown as { __v2ProbeMap?: CameraMap }).__v2ProbeMap;
		if (!m) return null;
		const fairfaxFirst = (t: { properties: Record<string, unknown> }) =>
			t.properties.slug === 'fairfax' ? 0 : 1;
		const towns = m
			.queryRenderedFeatures({ layers: ['towns-layer'] })
			.sort((a, b) => fairfaxFirst(a) - fairfaxFirst(b));
		for (const t of towns) {
			const p = m.project(t.geometry.coordinates);
			const under = m
				.queryRenderedFeatures([
					[p.x - 16, p.y - 16],
					[p.x + 16, p.y + 16]
				])
				.map((f) => f.layer.id);
			if (!under.some((id) => CLICK_WINNERS.test(id)))
				return { slug: String(t.properties.slug), x: p.x, y: p.y };
		}
		return null;
	}, '^(311|landmarks|news-pins|earthquakes|airports)');

const townName = (slug: string) =>
	slug
		.split('-')
		.map((w) => w[0].toUpperCase() + w.slice(1))
		.join(' ');

test.use({ viewport: { width: 1440, height: 1000 } });

test('a town click flies in; "All of Marin" brings back the county view and clears the town', async ({
	page
}) => {
	await page.goto('/?layout=v2&probe');
	await expect(page.locator('[data-layout="v2"][data-hydrated="true"]')).toBeVisible();
	await settled(page, 45_000);
	await expect.poll(() => clickableTown(page), { timeout: 30_000 }).not.toBeNull();
	const homeZoom = await zoom(page);
	const homeCenter = (await mapCenter(page))!;
	const reset = page.locator('[data-map-reset]');
	await expect(reset).toHaveCount(0);

	const town = (await clickableTown(page))!;
	console.log(`clicking ${town.slug}`);
	await page
		.locator('#v2-map-canvas canvas.maplibregl-canvas')
		.click({ position: { x: town.x, y: town.y } });
	await expect.poll(() => zoom(page), { timeout: 10_000 }).toBeGreaterThan(12.5);
	await expect(page.locator('.v2-scope-label + *')).toContainText(townName(town.slug));
	await expect(reset).toBeVisible();
	await expect(reset).toHaveText('All of Marin');

	await reset.click();
	await expect.poll(() => zoom(page), { timeout: 10_000 }).toBeCloseTo(homeZoom, 1);
	const back = (await mapCenter(page))!;
	expect(Math.abs(back.lng - homeCenter.lng)).toBeLessThan(0.01);
	expect(Math.abs(back.lat - homeCenter.lat)).toBeLessThan(0.01);
	await expect(page.locator('.v2-scope-label + *')).toContainText('All of Marin');
	await expect(reset).toHaveCount(0);
	expect(await page.evaluate(() => localStorage.getItem('mm_town'))).toBeNull();
});

test('the key names how each layer is placed, inside the map', async ({ page }) => {
	await page.goto('/?layout=v2&probe');
	await expect(page.locator('[data-layout="v2"][data-hydrated="true"]')).toBeVisible();
	const key = page.locator('#v2-map-canvas [data-slot="map-key"]');
	await expect(key).toBeVisible({ timeout: 30_000 });
	await expect(key.locator('[data-key="stories"]')).toContainText(
		'Stories one circle per town, not street spots'
	);
	await expect(key.locator('[data-key="311"]')).toContainText(
		'Fix It Marin each report at its spot'
	);
	await expect(key.locator('[data-key="earthquakes"]')).toContainText('Earthquakes each epicenter');
	// Inside the canvas, so it costs the page no height. Both boxes come from one layout: read
	// apart, a shift above the map between them made them disagree by up to ~90 px.
	const { keyBottom, canvasBottom } = await page.evaluate(() => {
		const canvas = document.querySelector('#v2-map-canvas')!.getBoundingClientRect();
		const key = document
			.querySelector('#v2-map-canvas [data-slot="map-key"]')!
			.getBoundingClientRect();
		return { keyBottom: key.bottom, canvasBottom: canvas.bottom };
	});
	expect(keyBottom).toBeLessThanOrEqual(canvasBottom);
});
