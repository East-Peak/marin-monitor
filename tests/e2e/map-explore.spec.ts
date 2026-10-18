import { expect, test, type Page, type Route } from '@playwright/test';
import { MILL_VALLEY, SOURCES, reportingSnapshot } from './fixtures/v2-reporting';
import { mapCenter, settled } from './fixtures/v2-probe';

/** MAPX3: Explore mode at /map — the URL holds view, layers and selection; Esc goes home. */
test.skip(({ baseURL }) => baseURL?.startsWith('https://') ?? false, 'stubbed');

const T0 = Math.floor(Date.now() / 1000) * 1000;
const json = (route: Route, body: unknown) =>
	route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
const FIX_IT = {
	lastUpdated: new Date(T0).toISOString(),
	count: 1,
	issues: [
		{
			id: 901,
			status: 'Open',
			summary: 'Pothole / Bache',
			description: 'Deep pothole by the crosswalk',
			lat: 37.955,
			lng: -122.49,
			address: '1400 Fifth Ave, San Rafael, CA',
			created_at: new Date(T0 - 3_600_000).toISOString(),
			updated_at: new Date(T0 - 3_600_000).toISOString(),
			html_url: 'https://seeclickfix.com/issues/901'
		}
	]
};
const STORIES = [
	{
		slug: 'a',
		title: 'Mill Valley opens the new Miller Avenue bike lane',
		source: SOURCES.ptReyes,
		hoursAgo: 1,
		town: MILL_VALLEY,
		point: { lat: 37.906, lon: -122.545 }
	}
];
const SEL = '311:seeclickfix-901';

async function stub(page: Page, fixIt: (r: Route) => unknown = (r) => json(r, FIX_IT)) {
	await page.route(
		/\/api\/(data|nps|transit|health|feeds|article|geocode|calfire|traffic|airport-status|cams)\b|earthquake\.usgs\.gov|api\.weather\.gov|tidesandcurrents/,
		(r) => r.fulfill({ status: 503, body: 'stubbed' })
	);
	await page.route('**/api/data/311', fixIt);
	await page.route('**/api/news/snapshot', (r) =>
		r.fulfill({
			status: 200,
			contentType: 'application/json',
			body: reportingSnapshot(T0, STORIES)
		})
	);
}
async function explore(page: Page, path: string) {
	await page.goto(path.replace('/map', '/map?probe').replace('?probe?', '?probe&'));
	await expect(page.locator('[data-layout="explore"][data-hydrated="true"]')).toBeVisible();
	await settled(page);
}
const drawer = (page: Page) => page.getByRole('complementary', { name: 'In view' });
const layer = (page: Page, id: string) =>
	page.locator(`[data-layer-panel] [data-layer-row="${id}"] input[type="checkbox"]`);
const search = (page: Page) => new URL(page.url()).searchParams;

test.beforeEach(async ({ page }) => {
	await page.clock.install({ time: T0 });
});

test.describe('desktop 1440×900', () => {
	test.use({ viewport: { width: 1440, height: 900 } });

	test('the URL opens its view, layers and selection; the map honours the view over the county fit', async ({
		page
	}) => {
		await stub(page);
		await explore(page, `/map?layers=311,news&sel=${SEL}#12/37.95/-122.49`);
		await expect(drawer(page).locator('[data-detail]')).toContainText(
			'Deep pothole by the crosswalk'
		);
		await expect(layer(page, '311')).toBeChecked();
		await expect(layer(page, 'traffic')).not.toBeChecked();
		const c = (await mapCenter(page))!;
		expect(Math.hypot(c.lng + 122.49, c.lat - 37.95)).toBeLessThan(0.01);
	});

	test('layer toggles, selections and Back write the URL at once; a pan writes the hash', async ({
		page
	}) => {
		await stub(page);
		await explore(page, `/map?layers=311#11/37.95/-122.49`);
		await layer(page, 'traffic').check();
		expect(search(page).get('layers')?.split(',')).toContain('traffic');
		await drawer(page).locator(`[data-in-view-row="${SEL}"]`).click();
		expect(search(page).get('sel')).toBe(SEL);
		await drawer(page).getByRole('button', { name: '← Back to list' }).click();
		expect(search(page).get('sel')).toBeNull();
		const before = new URL(page.url()).hash;
		const box = (await page.locator('.v2-map-canvas').boundingBox())!;
		await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
		await page.mouse.down();
		await page.mouse.move(box.x + box.width / 2 - 150, box.y + box.height / 2 - 80, { steps: 8 });
		await page.mouse.up();
		await expect.poll(() => new URL(page.url()).hash).not.toBe(before);
		expect(new URL(page.url()).hash).toMatch(/^#[\d.]+\/[\d.-]+\/[\d.-]+$/);
	});

	test('URL layers apply for the visit and never overwrite the saved choices', async ({ page }) => {
		await stub(page);
		await page.addInitScript(() =>
			localStorage.setItem(
				'mm_sections_v2',
				JSON.stringify({ version: 3, open: {}, layers: { ev: true } })
			)
		);
		await explore(page, '/map?layers=311');
		await expect(layer(page, 'ev')).not.toBeChecked();
		await layer(page, 'gas').check();
		expect(
			JSON.parse((await page.evaluate(() => localStorage.getItem('mm_sections_v2')))!)
		).toEqual({
			version: 3,
			open: {},
			layers: { ev: true }
		});
	});

	test('a selection whose layer is off turns that layer on for the visit', async ({ page }) => {
		await stub(page);
		await explore(page, `/map?layers=&sel=${SEL}`);
		await expect(layer(page, '311')).toBeChecked();
		await expect(drawer(page).locator('[data-detail]')).toContainText('Deep pothole');
	});

	test('an unknown selection never errors: its source unavailable, or the item gone', async ({
		page
	}) => {
		await stub(page, (r) => r.fulfill({ status: 503, body: 'down' }));
		await explore(page, `/map?sel=${SEL}`);
		await expect(drawer(page).locator('[data-in-view-notice]')).toHaveText(
			'Fix It Marin is unavailable right now'
		);
		await page.unrouteAll({ behavior: 'ignoreErrors' });
		await stub(page);
		await explore(page, '/map?sel=311:seeclickfix-404');
		await expect(drawer(page).locator('[data-in-view-notice]')).toHaveText(
			'That item is no longer in the feed'
		);
		expect(search(page).get('sel')).toBeNull();
	});

	test('Esc goes back from a detail to the list, then back to the dashboard', async ({ page }) => {
		await stub(page);
		await explore(page, `/map?sel=${SEL}`);
		await expect(drawer(page).locator('[data-detail]')).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(drawer(page).locator('[data-in-view-count]')).toBeVisible();
		await expect(page).toHaveURL(/\/map/);
		await page.keyboard.press('Escape');
		await expect(page).toHaveURL(/\/(\?.*)?$/);
		await expect(page.locator('[data-layout="v2"]')).toBeVisible();
	});

	test('Explore ↗ on the dashboard map opens /map by client navigation, with its view and layers', async ({
		page
	}) => {
		await stub(page);
		await page.goto('/?probe');
		await expect(page.locator('[data-layout="v2"][data-hydrated="true"]')).toBeVisible();
		await settled(page);
		await page.evaluate(() => Object.assign(window, { __sameDocument: true }));
		await page.getByRole('link', { name: 'Explore ↗' }).click();
		await expect(page.locator('[data-layout="explore"][data-hydrated="true"]')).toBeVisible();
		expect(await page.evaluate(() => (window as { __sameDocument?: boolean }).__sameDocument)).toBe(
			true
		);
		expect(search(page).get('layers')?.split(',')).toContain('311');
		expect(new URL(page.url()).hash).toMatch(/^#[\d.]+\/[\d.-]+\/[\d.-]+$/);
		await expect(page.locator('[data-layer-panel][data-rail]')).toBeVisible();
		await page.getByRole('link', { name: '← Dashboard' }).click();
		await expect(page.locator('[data-layout="v2"]')).toBeVisible();
	});
});

test.describe('phone 390×844', () => {
	test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
	const sheet = (page: Page) => page.getByRole('region', { name: 'In view' });
	const handle = (page: Page) => sheet(page).locator('[data-sheet-handle]');

	test('the sheet: peek shows the count, the keyboard raises and lowers it, a pick opens a modal detail', async ({
		page
	}) => {
		await stub(page);
		await explore(page, '/map?layers=311#11/37.95/-122.49');
		await expect(handle(page)).toHaveText(/In view · \d+/);
		await expect(handle(page)).toHaveAttribute('aria-expanded', 'false');
		await expect(sheet(page).locator('[data-in-view-row]')).toHaveCount(0);
		await handle(page).focus();
		await page.keyboard.press('ArrowUp');
		await expect(handle(page)).toHaveAttribute('aria-expanded', 'true');
		const dir = process.env.SHOTS_DIR;
		if (dir) await page.screenshot({ path: `${dir}/map-explore-390-half.png` });
		await sheet(page).locator(`[data-in-view-row="${SEL}"]`).click();
		const dialog = page.getByRole('dialog');
		await expect(dialog).toHaveAttribute('aria-modal', 'true');
		await expect(dialog).toContainText('Deep pothole by the crosswalk');
		expect(search(page).get('sel')).toBe(SEL);
		await page.keyboard.press('Escape');
		await expect(dialog).toHaveCount(0);
		expect(search(page).get('sel')).toBeNull();
		await handle(page).focus();
		await page.keyboard.press('ArrowDown');
		await expect(handle(page)).toHaveAttribute('aria-expanded', 'false');
		await page.keyboard.press('Escape');
		await expect(page.locator('[data-layout="v2"]')).toBeVisible();
	});

	test('a touch swipe on the handle raises the sheet, and another lowers it', async ({ page }) => {
		await stub(page);
		await explore(page, '/map?layers=311');
		const cdp = await page.context().newCDPSession(page);
		const swipe = async (yDistance: number) => {
			const b = (await handle(page).boundingBox())!;
			await cdp.send('Input.synthesizeScrollGesture', {
				x: Math.round(b.x + b.width / 2),
				y: Math.round(b.y + b.height / 2),
				yDistance,
				gestureSourceType: 'touch',
				speed: 800
			});
		};
		// A negative yDistance moves the finger up the screen (as in the preview gesture test).
		await swipe(-120);
		await expect(handle(page)).toHaveAttribute('aria-expanded', 'true');
		await swipe(120);
		await expect(handle(page)).toHaveAttribute('aria-expanded', 'false');
	});

	test('layers sit behind a button; a choice with no URL layers is saved', async ({ page }) => {
		await stub(page);
		await explore(page, '/map');
		await expect(page.locator('[data-layer-panel][data-rail]')).toHaveCount(0);
		await page.getByRole('button', { name: 'Layers' }).click();
		await layer(page, 'ev').check();
		expect(search(page).get('layers')?.split(',')).toContain('ev');
		expect(
			JSON.parse((await page.evaluate(() => localStorage.getItem('mm_sections_v2')))!)
		).toMatchObject({ layers: { ev: true } });
	});
});

test.describe('screenshots', () => {
	for (const [width, height] of [
		[1440, 900],
		[2000, 1100],
		[390, 844]
	] as const)
		test(`/map at ${width}`, async ({ browser }) => {
			const context = await browser.newContext({
				viewport: { width, height },
				...(width < 768 ? { hasTouch: true, isMobile: true } : {})
			});
			const page = await context.newPage();
			await page.clock.install({ time: T0 });
			await stub(page);
			await explore(page, `/map?layers=311,news,traffic,fire&sel=${SEL}`);
			await expect(page.locator('[data-detail]').first()).toBeVisible();
			const dir = process.env.SHOTS_DIR;
			if (dir) await page.screenshot({ path: `${dir}/map-explore-${width}.png` });
			await context.close();
		});
});
