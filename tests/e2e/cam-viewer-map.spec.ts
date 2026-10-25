import { expect, test, type Page, type Route } from '@playwright/test';
import { reportingSnapshot } from './fixtures/v2-reporting';
import { mapCenter, settled } from './fixtures/v2-probe';
import { CAM_HOSTS, FRAME_16_9, png } from './fixtures/cams';
import { frameProblems } from './fixtures/frame-whole';
import { CAMERAS } from '../../src/lib/config/cameras';
import { CALTRANS_CAMS } from '../../src/lib/config/caltrans-cams';

/** CAMVIEW1 on /map: Enlarge opens the viewer on a snapshot of the cameras in view. */
test.skip(({ baseURL }) => baseURL?.startsWith('https://') ?? false, 'stubbed');
test.use({ viewport: { width: 1440, height: 900 } });

const T0 = Math.floor(Date.now() / 1000) * 1000;
const FULL = png(1920, 1080);
const HEADINGS = {
	headingAt: T0 - 20_000,
	cams: [{ id: 'alert-muir-beach', az: 200, fov: 60, patrolling: false, frameAt: T0 - 60_000 }]
};
const json = (route: Route, body: unknown) =>
	route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
/** Southern Marin: Mt. Tam to the Golden Gate. */
const VIEW = '#11.5/37.89/-122.56';

async function open(page: Page, path: string) {
	await page.route(
		/\/api\/(data|nps|transit|airport-status|health|feeds|article|geocode|calfire|traffic)\b|earthquake\.usgs\.gov|api\.weather\.gov|tidesandcurrents/,
		(r) => r.fulfill({ status: 503, body: 'stubbed' })
	);
	await page.route('**/api/news/snapshot', (r) =>
		r.fulfill({ status: 200, contentType: 'application/json', body: reportingSnapshot(T0, []) })
	);
	await page.route('**/api/cams/heading', (r) => json(r, HEADINGS));
	await page.route(CAM_HOSTS, (r) =>
		r
			.fulfill({
				status: 200,
				contentType: 'image/png',
				headers: { 'access-control-allow-origin': '*' },
				body: r.request().url().includes('latest-thumb') ? FRAME_16_9 : FULL
			})
			.catch(() => {})
	);
	await page.goto(path);
	await expect(page.locator('[data-layout="explore"][data-hydrated="true"]')).toBeVisible();
	await settled(page);
}
type ProbeMap = { isMoving(): boolean; jumpTo(o: { center?: number[]; zoom?: number }): void };
const isMoving = (page: Page) =>
	page.evaluate(() => (window as unknown as { __v2ProbeMap: ProbeMap }).__v2ProbeMap.isMoving());
const jumpTo = (page: Page, to: { center?: number[]; zoom?: number }) =>
	page.evaluate(
		(o) => (window as unknown as { __v2ProbeMap: ProbeMap }).__v2ProbeMap.jumpTo(o),
		to
	);
const viewer = (page: Page) => page.locator('[data-cam-viewer]');
const panel = (page: Page) => page.getByRole('complementary', { name: 'In view' });
const sel = (page: Page) => new URL(page.url()).searchParams.get('sel');

/** The viewer cameras whose position is on the visible map, clear of the docked panel. */
const inView = (page: Page) =>
	page.evaluate(
		(cams) => {
			const m = (
				window as unknown as {
					__v2ProbeMap: {
						project(c: number[]): { x: number; y: number };
						getCanvas(): HTMLCanvasElement;
					};
				}
			).__v2ProbeMap;
			const r = m.getCanvas().getBoundingClientRect();
			const panelEl = document.querySelector('[data-detail-panel]');
			const right = panelEl ? panelEl.getBoundingClientRect().left : r.right;
			return cams
				.filter(([, lon, lat]) => {
					const p = m.project([lon as number, lat as number]);
					return p.x >= 0 && r.left + p.x <= right && p.y >= 0 && p.y <= r.height;
				})
				.map(([id]) => id as string);
		},
		CAMERAS.filter((c) => c.type === 'image' && c.category !== 'scenic').flatMap((c) => {
			const road = CALTRANS_CAMS[c.id];
			const at = road ? [road.lon, road.lat] : c.lon !== undefined ? [c.lon, c.lat!] : null;
			return at ? [[c.id, ...at]] : [];
		})
	);

/** Every camera the viewer steps through, from the first. */
async function stepAll(page: Page): Promise<string[]> {
	const n = Number((await viewer(page).locator('.count').innerText()).split('/')[1].trim());
	for (let i = 0; i < n; i++) await page.keyboard.press('ArrowLeft');
	const ids: string[] = [];
	for (let i = 0; i < n; i++) {
		ids.push((await viewer(page).getAttribute('data-camera-id'))!);
		await page.keyboard.press('ArrowRight');
	}
	return ids;
}

async function enlargeMuir(page: Page) {
	await panel(page).locator('[data-in-view-row="cams:alert-muir-beach"]').click();
	await expect(panel(page).getByRole('heading', { name: 'Muir Beach' })).toBeVisible();
	await expect.poll(() => isMoving(page)).toBe(false);
	// The selection's flight zooms in to 13; back out, so several cameras are in view.
	await jumpTo(page, { zoom: 11 });
	await page.waitForTimeout(800); // the in-view list settles after the move
	const snapshot = await inView(page);
	await panel(page).locator('[data-frame-enlarge]').click();
	await expect(viewer(page)).toHaveAttribute('data-camera-id', 'alert-muir-beach');
	return snapshot;
}

test('Enlarge opens the viewer on the cameras in view; stepping moves neither the map nor its selection', async ({
	page
}) => {
	await open(page, `/map?probe&layers=cams${VIEW}`);
	const snapshot = await enlargeMuir(page);
	expect(snapshot.length).toBeGreaterThan(2);
	expect(snapshot.length).toBeLessThan(21);
	expect(sel(page)).toBe('cams:alert-muir-beach');
	const center = await mapCenter(page);
	expect(await frameProblems(viewer(page).locator('.viewer-img'))).toEqual([]);
	const ids = await stepAll(page);
	expect(new Set(ids)).toEqual(new Set(snapshot));
	// Arrows went to the viewer, not the map; the selection never changed.
	expect(await mapCenter(page)).toEqual(center);
	expect(sel(page)).toBe('cams:alert-muir-beach');
	await page.screenshot({ path: '/tmp/claude-501/camview/e2e-map-viewer-1440.png' });
	// One Esc closes only the viewer: the detail stays, focus on its Enlarge.
	await page.keyboard.press('Escape');
	await expect(viewer(page)).toBeHidden();
	await expect(panel(page).getByRole('heading', { name: 'Muir Beach' })).toBeVisible();
	await expect(panel(page).locator('[data-frame-enlarge]')).toBeFocused();
	expect(sel(page)).toBe('cams:alert-muir-beach');
	expect(new URL(page.url()).searchParams.get('cam')).toBeNull();
});

test('the snapshot holds: a map move does not reshuffle it, and Forward restores it', async ({
	page
}) => {
	await open(page, `/map?probe&layers=cams${VIEW}`);
	const snapshot = await enlargeMuir(page);
	await page.keyboard.press('ArrowRight');
	const at = await viewer(page).getAttribute('data-camera-id');
	await page.goBack();
	await expect(viewer(page)).toBeHidden();
	// Pan the map far away, then Forward: the same sequence, at the same camera.
	await jumpTo(page, { center: [-122.6, 38.2], zoom: 12 });
	await page.waitForTimeout(500);
	await page.goForward();
	await expect(viewer(page)).toHaveAttribute('data-camera-id', at!);
	expect(new Set(await stepAll(page))).toEqual(new Set(snapshot));
});

test('a loaded /map?cam link opens on the cameras in view, with the asked-for one added; view and selection unchanged', async ({
	page
}) => {
	await open(page, `/map?probe&layers=cams&cam=caltrans-ignacio${VIEW}`);
	await expect(viewer(page)).toHaveAttribute('data-camera-id', 'caltrans-ignacio');
	const ids = await stepAll(page);
	await page.keyboard.press('Escape');
	await expect(viewer(page)).toBeHidden();
	const inViewNow = await inView(page);
	expect(new Set(ids)).toEqual(new Set([...inViewNow, 'caltrans-ignacio']));
	expect(sel(page)).toBeNull();
	const url = new URL(page.url());
	expect(url.searchParams.get('cam')).toBeNull();
	expect(url.pathname).toBe('/map');
	const c = (await mapCenter(page))!;
	expect(Math.abs(c.lat - 37.89)).toBeLessThan(0.001);
	expect(Math.abs(c.lng + 122.56)).toBeLessThan(0.001);
});

test('a camera alone in view is a sequence of one: no arrows', async ({ page }) => {
	// Point Reyes' Vision camera, zoomed in: nothing else in view.
	await open(page, `/map?probe&layers=cams&cam=alert-vision#13/38.0796/-122.8686`);
	await expect(viewer(page)).toHaveAttribute('data-camera-id', 'alert-vision');
	await expect(viewer(page).locator('.count')).toHaveText('1 / 1');
	await expect(viewer(page).getByRole('button', { name: 'Next camera' })).toHaveCount(0);
	await expect(viewer(page).getByRole('button', { name: 'Previous camera' })).toHaveCount(0);
});
