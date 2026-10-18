import { expect, test, type Page, type Route } from '@playwright/test';
import { reportingSnapshot } from './fixtures/v2-reporting';
import { settled, sourceCount } from './fixtures/v2-probe';

/** MAPX4: the fire cameras on the map, a wedge per last reported heading, the frame on click. */
test.skip(({ baseURL }) => baseURL?.startsWith('https://') ?? false, 'stubbed');

const T0 = Math.floor(Date.now() / 1000) * 1000;
// Muir Beach looks out over the ocean: nothing else under its wedge to take the click.
const MUIR: [number, number] = [-122.5784, 37.8592];
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
		await expect.poll(() => sourceCount(page, 'cameras')).toBe(17);
		// Muir Beach is still and fresh, Tam West sweeping; Bolinas' frame is stale.
		await expect.poll(() => sourceCount(page, 'camera-wedges')).toBe(2);
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
		await page.screenshot({ path: '/tmp/claude-501/mapx4/wedge-click-1440.png' });
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
		await expect.poll(() => sourceCount(page, 'cameras')).toBe(17);
		expect(await sourceCount(page, 'camera-wedges')).toBe(0);
		await page.getByRole('button', { name: 'Layers' }).click();
		await expect(layerRow(page, 'cams')).toContainText('unavailable');
		await expect(layerRow(page, 'cams')).toContainText('Directions unavailable');
	});
});
