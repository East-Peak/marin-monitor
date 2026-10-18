import { expect, test, type Page, type Route } from '@playwright/test';
import { reportingSnapshot } from './fixtures/v2-reporting';
import { settled, sourceCount } from './fixtures/v2-probe';
import { frameProblems } from './fixtures/frame-whole';
import { png } from './fixtures/cams';

/** MAPX4: the fire cameras on the map, a wedge per last reported heading, the frame on click. */
test.skip(({ baseURL }) => baseURL?.startsWith('https://') ?? false, 'stubbed');

const T0 = Math.floor(Date.now() / 1000) * 1000;
// Muir Beach looks out over the ocean: nothing else under its wedge to take the click.
const MUIR: [number, number] = [-122.58572, 37.86281];
const PIXEL = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
	'base64'
);
const HEADINGS = {
	headingAt: T0 - 20_000,
	cams: [
		{ id: 'alert-muir-beach', az: 200.2, fov: 62.8, patrolling: false, frameAt: T0 - 60_000 },
		{ id: 'alert-tam-west', az: 333.69, fov: 65.1, patrolling: true, frameAt: T0 - 60_000 },
		// Its frame is 10 minutes old: no wedge.
		{ id: 'alert-bolinas', az: 97.6, fov: 62.8, patrolling: false, frameAt: T0 - 600_000 }
	]
};
const json = (route: Route, body: unknown, status = 200) =>
	route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

async function open(page: Page, heading: (r: Route) => Promise<void>) {
	await page.route(
		/\/api\/(data|nps|transit|health|feeds|article|geocode|calfire|traffic)\b|earthquake\.usgs\.gov|api\.weather\.gov|tidesandcurrents/,
		(r) => r.fulfill({ status: 503, body: 'stubbed' })
	);
	await page.route(/cameras\.alertcalifornia\.org|cwwp2\.dot\.ca\.gov/, (r) =>
		r.fulfill({ status: 200, contentType: 'image/png', body: PIXEL })
	);
	await page.route('**/api/cams/heading', heading);
	await page.route('**/api/news/snapshot', (r) =>
		r.fulfill({
			status: 200,
			contentType: 'application/json',
			body: reportingSnapshot(T0, [])
		})
	);
	await page.goto('/?probe');
	await expect(page.locator('[data-layout="v2"][data-hydrated="true"]')).toBeVisible();
	await settled(page);
}

/** The screen point `km` from the camera along `az` (flat-earth: fine at 5 km). */
const along = (page: Page, [lon, lat]: [number, number], az: number, km: number) =>
	page.evaluate(
		([x, y]) => {
			const m = (
				window as unknown as {
					__v2ProbeMap: {
						project(c: number[]): { x: number; y: number };
						getCanvas(): HTMLCanvasElement;
					};
				}
			).__v2ProbeMap;
			const p = m.project([x, y]);
			const r = m.getCanvas().getBoundingClientRect();
			return { x: r.left + p.x, y: r.top + p.y };
		},
		[
			lon + (km * Math.sin((az * Math.PI) / 180)) / (111.32 * Math.cos((lat * Math.PI) / 180)),
			lat + (km * Math.cos((az * Math.PI) / 180)) / 110.57
		]
	);
const panel = (page: Page) => page.getByRole('complementary', { name: 'In view' });
/** A camera's emphasis on its wedge: the rendered feature's state and the source's own. */
const wedgeLit = (page: Page, id: string) =>
	page.evaluate((camId) => {
		const m = (
			window as unknown as {
				__v2ProbeMap: {
					queryRenderedFeatures(o: { layers: string[] }): {
						id?: unknown;
						state: Record<string, unknown>;
					}[];
					getFeatureState(f: { source: string; id: string }): Record<string, unknown>;
				};
			}
		).__v2ProbeMap;
		const drawn = m
			.queryRenderedFeatures({ layers: ['camera-wedges-fill'] })
			.find((f) => f.id === camId);
		return {
			rendered: drawn ? drawn.state.emphasis === true : null,
			wedge: m.getFeatureState({ source: 'camera-wedges', id: camId }).emphasis === true,
			pin: m.getFeatureState({ source: 'cameras', id: camId }).emphasis === true
		};
	}, id);
const layerRow = (page: Page, id: string) => page.locator(`[data-layer-row="${id}"]`);

test.beforeEach(async ({ page }) => {
	await page.clock.install({ time: T0 });
});

test.describe('desktop 1440×900', () => {
	test.use({ viewport: { width: 1440, height: 900 } });

	test('clicking a wedge opens that camera: its latest frame, its credit, its last heading', async ({
		page
	}) => {
		await open(page, (r) => json(r, HEADINGS));
		await expect.poll(() => sourceCount(page, 'cameras')).toBe(21);
		// Muir Beach is still and fresh, Tam West sweeping; Bolinas' frame is stale. Plus the four
		// Caltrans wedges, which need no heading.
		await expect.poll(() => sourceCount(page, 'camera-wedges')).toBe(6);
		// The whole map on screen: Muir Beach's wedge reaches the map's south edge.
		await page.locator('#v2-map-canvas').evaluate((el) => el.scrollIntoView({ block: 'end' }));
		await page.waitForTimeout(500); // the map's paint after the synced revision
		const inWedge = await along(page, MUIR, 200.2, 5);
		await page.mouse.click(inWedge.x, inWedge.y);
		const detail = panel(page).locator('[data-detail]');
		await expect(detail.getByRole('heading', { name: 'Muir Beach' })).toBeVisible();
		await expect(detail).toContainText('ALERTCalifornia | UC San Diego');
		await expect(detail).toContainText(/Last reported heading: SSW \(200°\) · \d+:\d\d [AP]M/);
		await expect(detail.locator('img')).toHaveAttribute(
			'src',
			/Axis-MuirBeach\/latest-frame\.jpg\?t=\d+/
		);
		// CAMBAR1: the panel shows the frame whole, nothing over its info bar.
		expect(await frameProblems(detail.locator('img'))).toEqual([]);
		await page.screenshot({ path: '/tmp/claude-501/mapx4/wedge-click-1440.png' });
	});

	test('hovering a pin lights its wedge; a selection keeps it lit until deselected (CAMQUIET1)', async ({
		page
	}) => {
		await open(page, (r) => json(r, HEADINGS));
		await expect.poll(() => sourceCount(page, 'camera-wedges')).toBe(6);
		await page.locator('#v2-map-canvas').evaluate((el) => el.scrollIntoView({ block: 'end' }));
		await page.waitForTimeout(500); // the map's paint after the synced revision
		const quiet = { rendered: false, wedge: false, pin: false };
		const loud = { rendered: true, wedge: true, pin: true };
		expect(await wedgeLit(page, 'alert-muir-beach')).toEqual(quiet);
		const pin = await along(page, MUIR, 0, 0);
		await page.mouse.move(pin.x, pin.y);
		await expect.poll(() => wedgeLit(page, 'alert-muir-beach')).toEqual(loud);
		// Off the map: the hover ends.
		await page.mouse.move(5, 5);
		await expect.poll(() => wedgeLit(page, 'alert-muir-beach')).toEqual(quiet);
		// Its in-view row lights it too (before a selection's flight reshapes the list).
		await panel(page).locator('[data-in-view-row="cams:alert-muir-beach"]').hover();
		await expect.poll(() => wedgeLit(page, 'alert-muir-beach')).toEqual(loud);
		await page.mouse.move(5, 5);
		await expect.poll(() => wedgeLit(page, 'alert-muir-beach')).toEqual(quiet);
		// Selected: lit with the pointer elsewhere; Back clears it.
		await page.mouse.click(pin.x, pin.y);
		await expect(panel(page).getByRole('heading', { name: 'Muir Beach' })).toBeVisible();
		await page.mouse.move(5, 5);
		await expect.poll(() => wedgeLit(page, 'alert-muir-beach')).toEqual(loud);
		await panel(page).getByRole('button', { name: '← Back to list' }).click();
		await expect.poll(() => wedgeLit(page, 'alert-muir-beach')).toEqual(quiet);
	});

	test("the panel's frame enlarges: the whole frame in a dialog, credited; Esc returns to it (CAMQUIET1)", async ({
		page
	}) => {
		await open(page, (r) => json(r, HEADINGS));
		// A real frame's size (1920×1080); registered last, so it wins over the 1×1 stub.
		await page.route(/cameras\.alertcalifornia\.org/, (r) =>
			r.fulfill({ status: 200, contentType: 'image/png', body: png(1920, 1080) })
		);
		await page.locator('#v2-map-canvas').evaluate((el) => el.scrollIntoView({ block: 'end' }));
		await page.waitForTimeout(500);
		const pin = await along(page, MUIR, 0, 0);
		await page.mouse.click(pin.x, pin.y);
		const frame = panel(page).locator('[data-frame-enlarge]');
		await expect(frame).toBeVisible();
		await frame.click();
		const dialog = page.getByRole('dialog', { name: 'Muir Beach' });
		await expect(dialog).toBeVisible();
		const img = dialog.locator('img');
		expect(await frameProblems(img)).toEqual([]);
		// Bigger than the panel's preview: up to 90vw × 80vh.
		const box = (await img.boundingBox())!;
		expect(box.height).toBeGreaterThan(900 * 0.6);
		expect(box.height).toBeLessThanOrEqual(900 * 0.8 + 1);
		expect(box.width).toBeLessThanOrEqual(1440 * 0.9 + 1);
		await expect(dialog).toContainText('ALERTCalifornia | UC San Diego');
		await expect(dialog).toContainText(/Last reported heading: SSW \(200°\) · \d+:\d\d [AP]M/);
		await page.screenshot({ path: '/tmp/claude-501/camquiet1/e2e-enlarged-1440.png' });
		await page.keyboard.press('Escape');
		await expect(dialog).toBeHidden();
		await expect(frame).toBeFocused();
		// Esc closed the dialog only: the camera's detail is still open.
		await expect(panel(page).getByRole('heading', { name: 'Muir Beach' })).toBeVisible();
	});

	test('a tile shows its heading on its own row: the full credit stays readable (Codex MAPX4 #8)', async ({
		page
	}) => {
		await open(page, (r) => json(r, HEADINGS));
		const tile = page.locator('section#cams [data-camera-id="alert-muir-beach"]');
		await tile.scrollIntoViewIfNeeded();
		const heading = tile.locator('[data-cam-heading]');
		await expect(heading).toHaveText('Looking SSW · 200°');
		const h = (await heading.boundingBox())!;
		const credit = (await tile.locator('[data-cam-meta]').boundingBox())!;
		expect(h.y + h.height).toBeLessThanOrEqual(credit.y + 1);
		await expect(tile.locator('[data-cam-meta]')).toHaveText('ALERTCalifornia | UC San Diego');
		expect(
			await tile.locator('[data-cam-meta]').evaluate((el) => el.scrollWidth <= el.clientWidth)
		).toBe(true);
	});

	test('the Layers row names the source and its time, and says what a wedge means', async ({
		page
	}) => {
		await open(page, (r) => json(r, HEADINGS));
		await page.getByRole('button', { name: 'Layers' }).click();
		await expect(layerRow(page, 'cams')).toContainText('ALERTCalifornia | UC San Diego · as of');
		await expect(layerRow(page, 'cams')).toContainText(
			'Wedge: direction of view, not how far it sees'
		);
	});

	test('a failed heading read: the layer says so, no wedge, the cameras still open', async ({
		page
	}) => {
		await open(page, (r) => json(r, { error: 'ALERTCalifornia feed HTTP 404' }, 503));
		await expect.poll(() => sourceCount(page, 'cameras')).toBe(21);
		expect(await sourceCount(page, 'camera-wedges')).toBe(4); // Caltrans only
		await page.getByRole('button', { name: 'Layers' }).click();
		await expect(layerRow(page, 'cams')).toContainText('unavailable');
		await expect(layerRow(page, 'cams')).toContainText('ALERTCalifornia directions unavailable');
	});
});
