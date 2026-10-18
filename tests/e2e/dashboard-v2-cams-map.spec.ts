import { expect, test, type Page, type Route } from '@playwright/test';
import { reportingSnapshot } from './fixtures/v2-reporting';
import { mapCenter, rendered, settled, sourceCount } from './fixtures/v2-probe';
import { frameProblems } from './fixtures/frame-whole';
import { png } from './fixtures/cams';
import {
	INSPECTION_CLICK_LAYERS,
	TOWN_CLICK_LAYERS
} from '../../src/lib/components/map/map-interactions';

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

async function open(page: Page, heading: (r: Route) => Promise<void>, path = '/?probe') {
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
	await page.goto(path);
	const layout = path.startsWith('/map') ? 'explore' : 'v2';
	await expect(page.locator(`[data-layout="${layout}"][data-hydrated="true"]`)).toBeVisible();
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

/** CAMDESEL1: a selected camera lets go — Back, a click on empty map, Esc — and stays let go. */
const QUIET = { rendered: false, wedge: false, pin: false };
const LOUD = { rendered: true, wedge: true, pin: true };
const ringCount = (page: Page) => sourceCount(page, 'v2-in-view-highlight');
const sel = (page: Page) => new URL(page.url()).searchParams.get('sel');
/** Whether any of our interactive layers (pins, wedges, data layers, towns) is under a point. */
const hitsAt = (page: Page, at: { x: number; y: number }) =>
	page.evaluate(
		({ x, y, layers }) => {
			const m = (
				window as unknown as {
					__v2ProbeMap: {
						getLayer(id: string): unknown;
						queryRenderedFeatures(p: [number, number], o: { layers: string[] }): unknown[];
						getCanvas(): HTMLCanvasElement;
					};
				}
			).__v2ProbeMap;
			const r = m.getCanvas().getBoundingClientRect();
			return m.queryRenderedFeatures([x - r.left, y - r.top], {
				layers: layers.filter((l) => m.getLayer(l))
			}).length;
		},
		{ ...at, layers: [...INSPECTION_CLICK_LAYERS, ...TOWN_CLICK_LAYERS] }
	);
/** The map at rest, Muir Beach's pin drawn where it projects: coordinates are now safe to use
 *  (Codex CAMDESEL1 #4). */
const mapStill = (page: Page) =>
	expect
		.poll(() =>
			page.evaluate(([lon, lat]) => {
				const m = (
					window as unknown as {
						__v2ProbeMap?: {
							isMoving(): boolean;
							getLayer(id: string): unknown;
							project(c: number[]): { x: number; y: number };
							queryRenderedFeatures(
								p: [number, number],
								o: { layers: string[] }
							): { properties: Record<string, unknown> }[];
						};
					}
				).__v2ProbeMap;
				if (!m || m.isMoving()) return false;
				const p = m.project([lon, lat]);
				const layers = ['cameras-layer', 'cameras-hit-layer'].filter((l) => m.getLayer(l));
				return m
					.queryRenderedFeatures([p.x, p.y], { layers })
					.some((f) => f.properties.itemId === 'alert-muir-beach');
			}, MUIR)
		)
		.toBe(true);
/** Muir Beach selected by its pin, the way a reader does it: hover, click, the flight lands. */
async function selectMuir(page: Page) {
	await page.locator('#v2-map-canvas').evaluate((el) => el.scrollIntoView({ block: 'end' }));
	await mapStill(page);
	const pin = await along(page, MUIR, 0, 0);
	await page.mouse.move(pin.x, pin.y, { steps: 4 });
	await expect.poll(() => wedgeLit(page, 'alert-muir-beach')).toEqual(LOUD);
	await page.mouse.click(pin.x, pin.y);
	await expect(panel(page).getByRole('heading', { name: 'Muir Beach' })).toBeVisible();
	// The selection flies to the camera; positions are read after it lands.
	await expect
		.poll(async () => {
			const c = await mapCenter(page);
			return c ? Math.hypot(c.lng - MUIR[0], c.lat - MUIR[1]) : Infinity;
		})
		.toBeLessThan(0.002);
	await mapStill(page);
}
/** Into the panel, as the pointer goes to reach Back. */
async function intoPanel(page: Page) {
	const box = (await panel(page).boundingBox())!;
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 });
}
async function letGo(page: Page) {
	await expect(panel(page).locator('[data-in-view-count]')).toBeVisible();
	await expect.poll(() => wedgeLit(page, 'alert-muir-beach')).toEqual(QUIET);
	expect(await ringCount(page)).toBe(0);
}
/** A point on the map clear of Muir Beach's wedge (169°–231°), with none of our features under
 *  it and the map's own canvas on top (no panel, inspector or control). */
async function emptyPoint(page: Page) {
	for (const [az, km] of [
		[320, 1.2],
		[280, 2],
		[260, 4],
		[300, 3],
		[250, 7],
		[140, 3]
	]) {
		const at = await along(page, MUIR, az, km);
		const onCanvas = await page.evaluate(
			({ x, y }) => document.elementFromPoint(x, y)?.classList.contains('maplibregl-canvas'),
			at
		);
		if (onCanvas && (await hitsAt(page, at)) === 0) return at;
	}
	throw new Error('no empty point near Muir Beach');
}

for (const path of ['/?probe', '/map?probe']) {
	test.describe(`deselect at 1440×900 on ${path} (CAMDESEL1)`, () => {
		test.use({ viewport: { width: 1440, height: 900 } });
		const explore = path.startsWith('/map');

		test('Back to list lets the camera go, though the pointer passed into the panel', async ({
			page
		}) => {
			await open(page, (r) => json(r, HEADINGS), path);
			await selectMuir(page);
			if (explore) expect(sel(page)).toBe('cams:alert-muir-beach');
			await intoPanel(page);
			await panel(page).getByRole('button', { name: '← Back to list' }).click();
			await letGo(page);
			if (explore) expect(sel(page)).toBeNull();
		});

		test('Back after choosing the row lets go too: focus back on the row lights nothing', async ({
			page
		}) => {
			await open(page, (r) => json(r, HEADINGS), path);
			await page.locator('#v2-map-canvas').evaluate((el) => el.scrollIntoView({ block: 'end' }));
			await panel(page).locator('[data-in-view-row="cams:alert-muir-beach"]').click();
			await expect(panel(page).getByRole('heading', { name: 'Muir Beach' })).toBeVisible();
			await panel(page).getByRole('button', { name: '← Back to list' }).click();
			await expect(panel(page).locator('[data-in-view-row="cams:alert-muir-beach"]')).toBeFocused();
			await page.mouse.move(5, 5);
			await letGo(page);
		});

		test('Esc after choosing the row by mouse lets go: the key restores focus, not the light', async ({
			page
		}) => {
			await open(page, (r) => json(r, HEADINGS), path);
			await page.locator('#v2-map-canvas').evaluate((el) => el.scrollIntoView({ block: 'end' }));
			const row = panel(page).locator('[data-in-view-row="cams:alert-muir-beach"]');
			await row.click();
			await expect(panel(page).getByRole('heading', { name: 'Muir Beach' })).toBeVisible();
			await page.keyboard.press('Escape');
			await expect(row).toBeFocused();
			await page.mouse.move(5, 5);
			await letGo(page);
			if (explore) expect(sel(page)).toBeNull();
		});

		test('a click on empty map lets go; a drag does not', async ({ page }) => {
			await open(page, (r) => json(r, HEADINGS), path);
			await selectMuir(page);
			// A drag pans the map and keeps the selection.
			const from = await emptyPoint(page);
			await page.mouse.move(from.x, from.y);
			await page.mouse.down();
			await page.mouse.move(from.x - 60, from.y + 40, { steps: 8 });
			await page.mouse.up();
			await mapStill(page);
			await expect(panel(page).getByRole('heading', { name: 'Muir Beach' })).toBeVisible();
			expect(await wedgeLit(page, 'alert-muir-beach')).toEqual(LOUD);
			// A click on nothing of ours (land or water) is a click away.
			const at = await emptyPoint(page);
			await page.mouse.click(at.x, at.y);
			await letGo(page);
			if (explore) expect(sel(page)).toBeNull();
		});

		test('Esc lets go, with the pointer resting on the panel', async ({ page }) => {
			await open(page, (r) => json(r, HEADINGS), path);
			await selectMuir(page);
			await intoPanel(page);
			await page.keyboard.press('Escape');
			await letGo(page);
			if (explore) {
				expect(sel(page)).toBeNull();
				await expect(page).toHaveURL(/\/map/);
			}
		});
	});
}

test.describe('deselect by keyboard at 1440×900 (CAMDESEL1)', () => {
	test.use({ viewport: { width: 1440, height: 900 } });

	test("Tab lights a row's camera, Enter selects, Esc returns to the row still lit; a mouse Back leaves it unlit", async ({
		page
	}) => {
		await open(page, (r) => json(r, HEADINGS));
		await page.locator('#v2-map-canvas').evaluate((el) => el.scrollIntoView({ block: 'end' }));
		const row = panel(page).locator('[data-in-view-row="cams:alert-muir-beach"]');
		await panel(page).locator('[data-in-view-count]').focus();
		for (let i = 0; i < 60 && !(await row.evaluate((el) => el === document.activeElement)); i++)
			await page.keyboard.press('Tab');
		await expect(row).toBeFocused();
		await expect.poll(() => wedgeLit(page, 'alert-muir-beach')).toEqual(LOUD);
		await page.keyboard.press('Enter');
		await expect(panel(page).getByRole('heading', { name: 'Muir Beach' })).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(row).toBeFocused();
		// Keyboard focus on the row: its camera lit, as intended.
		await expect.poll(() => wedgeLit(page, 'alert-muir-beach')).toEqual(LOUD);
		await page.keyboard.press('Enter');
		await expect(panel(page).getByRole('heading', { name: 'Muir Beach' })).toBeVisible();
		await panel(page).getByRole('button', { name: '← Back to list' }).click();
		await expect(row).toBeFocused();
		await page.mouse.move(5, 5);
		await letGo(page);
	});
});

test.describe('deselect at tablet 900×1000 (CAMDESEL1)', () => {
	test.use({ viewport: { width: 900, height: 1000 } });
	const inspector = (page: Page) =>
		page.getByRole('complementary', { name: 'Map feature inspector' });

	async function inspectMuir(page: Page) {
		await open(page, (r) => json(r, HEADINGS));
		await page.locator('#v2-map-canvas').evaluate((el) => el.scrollIntoView({ block: 'end' }));
		await mapStill(page);
		const pin = await along(page, MUIR, 0, 0);
		await page.mouse.move(pin.x, pin.y, { steps: 4 });
		await page.mouse.click(pin.x, pin.y);
		await expect(inspector(page)).toContainText('Muir Beach');
		await intoInspector(page);
		await expect.poll(() => wedgeLit(page, 'alert-muir-beach')).toEqual(LOUD);
	}
	async function intoInspector(page: Page) {
		const box = (await inspector(page).boundingBox())!;
		await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 });
	}
	async function closed(page: Page) {
		await expect(inspector(page)).toHaveCount(0);
		await page.mouse.move(5, 5);
		await expect.poll(() => wedgeLit(page, 'alert-muir-beach')).toEqual(QUIET);
	}

	test("the inspector's Close lets the camera go", async ({ page }) => {
		await inspectMuir(page);
		await inspector(page).getByRole('button', { name: 'Close inspector' }).click();
		await closed(page);
	});

	test('a click on empty map closes the inspector and lets the camera go', async ({ page }) => {
		await inspectMuir(page);
		const at = await emptyPoint(page);
		await page.mouse.click(at.x, at.y);
		await closed(page);
	});

	test('Esc closes the inspector though the Layers list is open (Codex CAMDESEL1 #1)', async ({
		page
	}) => {
		await inspectMuir(page);
		await page.getByRole('button', { name: 'Layers' }).click();
		await expect(page.getByRole('button', { name: 'Layers' })).toHaveAttribute(
			'aria-expanded',
			'true'
		);
		await inspector(page).getByRole('button', { name: 'Close inspector' }).focus();
		await page.keyboard.press('Escape');
		await closed(page);
	});

	test('Esc closes the inspector and lets the camera go', async ({ page }) => {
		await inspectMuir(page);
		await page.keyboard.press('Escape');
		await closed(page);
	});
});

test.describe('deselect on the phone 390×844 (CAMDESEL1)', () => {
	test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

	test("/map: the detail's Close lets the camera go and clears its URL", async ({ page }) => {
		await open(page, (r) => json(r, HEADINGS), '/map?probe');
		await mapStill(page);
		const pin = await along(page, MUIR, 0, 0);
		await page.touchscreen.tap(pin.x, pin.y);
		const dialog = page.getByRole('dialog');
		await expect(dialog.getByRole('heading', { name: 'Muir Beach' })).toBeVisible();
		expect(sel(page)).toBe('cams:alert-muir-beach');
		await expect.poll(() => wedgeLit(page, 'alert-muir-beach')).toEqual(LOUD);
		await dialog.getByRole('button', { name: 'Close' }).click();
		await expect(dialog).toHaveCount(0);
		expect(sel(page)).toBeNull();
		await expect.poll(() => wedgeLit(page, 'alert-muir-beach')).toEqual(QUIET);
		expect(await ringCount(page)).toBe(0);
	});

	test('the dashboard preview: no camera is drawn, and a tap lights or opens nothing', async ({
		page
	}) => {
		await open(page, (r) => json(r, HEADINGS));
		await page.locator('#v2-map-canvas').evaluate((el) => el.scrollIntoView({ block: 'center' }));
		// The preview draws no data layer (MAPX3): there is no camera to select.
		expect(await rendered(page, ['cameras-layer', 'camera-wedges-fill'])).toBe(0);
		const pin = await along(page, MUIR, 0, 0);
		await page.touchscreen.tap(pin.x, pin.y);
		await page.waitForTimeout(300); // a tap that lit or opened anything would show by now
		await expect(page.locator('.feature-inspector:visible')).toHaveCount(0);
		expect(await wedgeLit(page, 'alert-muir-beach')).toMatchObject({ wedge: false, pin: false });
	});
});
