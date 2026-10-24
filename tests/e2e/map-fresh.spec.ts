import { expect, test, type Page, type Route } from '@playwright/test';
import { MILL_VALLEY, SAN_RAFAEL, SOURCES, reportingSnapshot } from './fixtures/v2-reporting';
import { settled, sourceCount } from './fixtures/v2-probe';
import { CAM_HOSTS } from './fixtures/cams';

/**
 * MAPFRESH1: the map shows stories from the last 7 days, never a stale fire listing as a fire
 * (nor its absence as an all-clear), and the cameras' cones are seen at rest.
 */
test.skip(({ baseURL }) => baseURL?.startsWith('https://') ?? false, 'stubbed');

const T0 = Math.floor(Date.now() / 1000) * 1000;
const DAY = 86_400_000;
const json = (route: Route, body: unknown) =>
	route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

const OLD = 30 * 24;
const STORIES = [
	{
		slug: 'a',
		title: 'Mill Valley opens the new Miller Avenue bike lane',
		source: SOURCES.ptReyes,
		hoursAgo: 1,
		town: MILL_VALLEY,
		point: { lat: 37.906, lon: -122.545 }
	},
	{
		slug: 'd',
		title: 'San Rafael council sets a hearing',
		source: SOURCES.sanRafael,
		hoursAgo: 2,
		town: SAN_RAFAEL
	},
	// NBC's Sep 23 story, a month on: placed by its headline, if it were eligible.
	{ slug: 'burn', title: 'Prescribed burn on Angel Island', source: SOURCES.nbc, hoursAgo: OLD },
	{
		slug: 'old-pin',
		title: 'Mill Valley repaves Throckmorton',
		source: SOURCES.ptReyes,
		hoursAgo: OLD,
		town: MILL_VALLEY,
		point: { lat: 37.91, lon: -122.55 }
	},
	{
		slug: 'old-town',
		title: 'San Rafael budget hearing',
		source: SOURCES.sanRafael,
		hoursAgo: OLD,
		town: SAN_RAFAEL
	}
];
const OLD_IDS = [
	'nbc-bay-area-marin:burn',
	'point-reyes-light:old-pin',
	'city-of-san-rafael:old-town'
];

/** WFIGS's live BUNKER and Kirby listings (2026-10-23): no size, no containment, long ago. */
const nifc = (
	id: string,
	name: string,
	discovered: number,
	attrs: Record<string, unknown> = {},
	at = { x: -122.62, y: 38.02 }
) => ({
	attributes: {
		IrwinID: id,
		IncidentName: name,
		POOCounty: 'Marin',
		POOState: 'US-CA',
		IncidentSize: null,
		DiscoveryAcres: null,
		PercentContained: null,
		FireDiscoveryDateTime: discovered,
		ModifiedOnDateTime_dt: T0 - 2 * DAY,
		FireOutDateTime: null,
		ContainmentDateTime: null,
		ControlDateTime: null,
		...attrs
	},
	geometry: at
});
const WFIGS = {
	features: [
		nifc('bunker', 'BUNKER', T0 - 40 * DAY),
		nifc('kirby', 'Kirby', T0 - 60 * DAY, {}, { x: -122.75, y: 38.1 }),
		nifc(
			'ridge',
			'Ridge',
			T0 - DAY,
			{ IncidentSize: 12, PercentContained: 30 },
			{ x: -122.5, y: 38.2 }
		)
	]
};
const HIDDEN_NOTE =
	/2 older NIFC listings hidden \(no size or containment reported; discovered \w{3} \d+, \w{3} \d+\)/;

async function stub(page: Page) {
	await page.route(CAM_HOSTS, (r) => r.fulfill({ status: 404, body: 'stubbed' }));
	await page.route(
		/\/api\/(data|nps|transit|health|feeds|article|geocode|traffic|airport-status|cams)\b|earthquake\.usgs\.gov|api\.weather\.gov|tidesandcurrents|data\.marincounty\.gov/,
		(r) => r.fulfill({ status: 503, body: 'stubbed' })
	);
	await page.route('**/api/calfire', (r) => json(r, { features: [] }));
	await page.route(/services3\.arcgis\.com/, (r) => json(r, WFIGS));
	await page.route('**/api/news/snapshot', (r) =>
		r.fulfill({
			status: 200,
			contentType: 'application/json',
			body: reportingSnapshot(T0, STORIES)
		})
	);
}

type ProbeMap = {
	getSource(id: string): { serialize(): { data: { features: Feature[] } } } | undefined;
	getPaintProperty(layer: string, prop: string): unknown;
};
type Feature = { id?: string | number; properties: Record<string, unknown> };
const features = (page: Page, source: string) =>
	page.evaluate((id) => {
		const m = (window as unknown as { __v2ProbeMap?: ProbeMap }).__v2ProbeMap;
		return m?.getSource(id)?.serialize().data.features ?? [];
	}, source);
const townTotals = async (page: Page) =>
	Object.fromEntries(
		(await features(page, 'towns'))
			.filter((f) => Number(f.properties.total) > 0)
			.map((f) => [f.properties.slug, f.properties.total])
	);
const wedgePaint = (page: Page) =>
	page.evaluate(() =>
		JSON.stringify(
			(window as unknown as { __v2ProbeMap?: ProbeMap }).__v2ProbeMap?.getPaintProperty(
				'camera-wedges-fill',
				'fill-opacity'
			)
		)
	);

/** Old stories: no pin, no placed story, no town count; only the two fresh ones. */
async function expectOnlyFreshStories(page: Page) {
	expect(await sourceCount(page, 'news-pins')).toBe(1);
	expect(await sourceCount(page, 'story-places')).toBe(0);
	expect(await townTotals(page)).toEqual({ 'mill-valley': 1, 'san-rafael': 1 });
}

/** The stale listings: not drawn as fires; the fresh one is. */
async function expectStaleFiresHidden(page: Page) {
	const fires = await features(page, 'fire-incidents');
	expect(fires.map((f) => f.properties.name)).toEqual(['Ridge']);
}

async function openDashboard(page: Page) {
	await page.goto('/?probe');
	await expect(page.locator('[data-layout="v2"][data-hydrated="true"]')).toBeVisible();
	await settled(page);
}
async function explore(page: Page, path: string) {
	await page.goto(path.replace('/map', '/map?probe').replace('?probe?', '?probe&'));
	await expect(page.locator('[data-layout="explore"][data-hydrated="true"]')).toBeVisible();
	await settled(page);
}
const drawer = (page: Page) => page.getByRole('complementary', { name: 'In view' });
const layerRow = (page: Page, id: string) =>
	page.locator(`[data-layer-panel] [data-layer-row="${id}"]`);
/** The fire row's note, behind the Layers button. */
async function fireNote(page: Page) {
	await page.getByRole('button', { name: 'Layers' }).click();
	return layerRow(page, 'fire').locator('[data-layer-note]');
}
const rowIds = (scope: ReturnType<Page['locator']>) =>
	scope
		.locator('[data-in-view-row]')
		.evaluateAll((els) => els.map((el) => el.getAttribute('data-in-view-row')));

test.beforeEach(async ({ page }) => {
	await page.clock.install({ time: T0 });
	await stub(page);
});

test.describe('desktop 1440×900', () => {
	test.use({ viewport: { width: 1440, height: 900 } });

	test('an old story is not pinned, counted or listed; the list says its window', async ({
		page
	}) => {
		await openDashboard(page);
		await expectOnlyFreshStories(page);
		await expect
			.poll(async () => (await rowIds(drawer(page))).filter((id) => id?.startsWith('news:')))
			.toEqual(['news:point-reyes-light:a', 'news:city-of-san-rafael:d']);
		await expect(drawer(page).locator('[data-in-view-window="news"]')).toHaveText(
			'Stories from the last 7 days'
		);
		await expect(drawer(page)).not.toContainText('Prescribed burn on Angel Island');
	});

	test('a sel= link to an expired story says so and flips no switch', async ({ page }) => {
		await explore(page, `/map?layers=311&sel=news:${OLD_IDS[0]}`);
		await expect(drawer(page).locator('[data-in-view-notice]')).toHaveText(
			'That item is no longer in the feed'
		);
		await expect(layerRow(page, 'news').locator('input[type="checkbox"]')).not.toBeChecked();
		await expect(drawer(page)).not.toContainText('outside');
	});

	test('an open story that ages out on the clock leaves with "No longer listed"', async ({
		page
	}) => {
		// Six days, 23 hours and 58 minutes old at T0: out of the window three clock ticks later.
		await page.route('**/api/news/snapshot', (r) =>
			r.fulfill({
				status: 200,
				contentType: 'application/json',
				body: reportingSnapshot(T0, [{ ...STORIES[0], hoursAgo: 7 * 24 - 2 / 60 }])
			})
		);
		await explore(page, '/map?sel=news:point-reyes-light:a');
		await expect(drawer(page).locator('[data-detail]')).toContainText('Miller Avenue bike lane');
		await page.clock.runFor(3 * 60_000);
		await expect(drawer(page).locator('[data-in-view-notice]')).toHaveText('No longer listed');
		expect(await sourceCount(page, 'news-pins')).toBe(0);
	});

	test('the stale fire is hidden, and the map and Outdoors name it, never "None near"', async ({
		page
	}) => {
		await openDashboard(page);
		await expectStaleFiresHidden(page);
		await expect(await fireNote(page)).toHaveText(HIDDEN_NOTE);
		const wildfire = page.locator('[data-row="wildfire"]');
		await expect(wildfire).toContainText('1 active near');
		await expect(wildfire).toContainText(HIDDEN_NOTE);
	});

	test('only hidden listings: "No active fires listed", with the hidden ones named', async ({
		page
	}) => {
		await page.route(/services3\.arcgis\.com/, (r) =>
			json(r, { features: WFIGS.features.slice(0, 2) })
		);
		await openDashboard(page);
		expect(await sourceCount(page, 'fire-incidents')).toBe(0);
		await expect(await fireNote(page)).toHaveText(
			new RegExp(`^No active fires listed near Marin · ${HIDDEN_NOTE.source}$`)
		);
		const wildfire = page.locator('[data-row="wildfire"]');
		await expect(wildfire).toContainText('No active fires listed');
		await expect(wildfire).not.toContainText('None near');
	});

	test('a ridge cam whose patrol state is unreported draws its cone, dashed (Codex MAPFRESH1 #6)', async ({
		page
	}) => {
		await page.route('**/api/cams/heading', (r) =>
			json(r, {
				headingAt: T0,
				cams: [
					{ id: 'alert-tam-east', az: 326.78, fov: 65.1, patrolling: null, frameAt: T0 - 60_000 }
				]
			})
		);
		await openDashboard(page);
		await expect
			.poll(async () =>
				(await features(page, 'camera-wedges'))
					.filter((f) => String(f.properties.itemId).startsWith('alert-'))
					.map((f) => [f.properties.itemId, f.properties.style])
			)
			.toEqual([['alert-tam-east', 'sweeping']]);
	});

	test("a cone's at-rest fill reads the new opacity from its paint", async ({ page }) => {
		await openDashboard(page);
		const paint = await wedgePaint(page);
		expect(paint).toContain('0.12');
		expect(paint).toContain('0.08');
	});
});

test.describe('phone 390×844', () => {
	test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
	const sheet = (page: Page) => page.getByRole('region', { name: 'In view' });

	test('/map: no old story pinned, counted or listed; the window said; the stale fire hidden', async ({
		page
	}) => {
		await explore(page, '/map');
		await expectOnlyFreshStories(page);
		await expectStaleFiresHidden(page);
		const handle = sheet(page).locator('[data-sheet-handle]');
		await handle.focus();
		await page.keyboard.press('ArrowUp');
		await expect(handle).toHaveAttribute('aria-expanded', 'true');
		await expect
			.poll(async () => (await rowIds(sheet(page))).filter((id) => id?.startsWith('news:')))
			.toEqual(['news:point-reyes-light:a', 'news:city-of-san-rafael:d']);
		await expect(sheet(page).locator('[data-in-view-window="news"]')).toHaveText(
			'Stories from the last 7 days'
		);
		expect(await wedgePaint(page)).toContain('0.12');
	});

	test('/map: a sel= link to an expired story says so and flips no switch', async ({ page }) => {
		await explore(page, `/map?layers=311&sel=news:${OLD_IDS[0]}`);
		await expect(sheet(page).locator('[data-in-view-notice]')).toHaveText(
			'That item is no longer in the feed'
		);
		expect(new URL(page.url()).searchParams.get('layers')).toBe('311');
	});

	test('the dashboard preview: the same pins and counts; Outdoors names the hidden fires', async ({
		page
	}) => {
		await openDashboard(page);
		await expectOnlyFreshStories(page);
		// The preview draws no data layers (MAPX2c): no fire at all, stale or not.
		expect(await sourceCount(page, 'fire-incidents')).toBe(0);
		await page.locator('[data-section-toggle="outdoors"]').click();
		await expect(page.locator('[data-row="wildfire"]')).toContainText(HIDDEN_NOTE);
	});
});

test.describe('TV 1920×970', () => {
	test.use({ viewport: { width: 1920, height: 970 } });

	test('the county map screen draws no old story and no stale fire', async ({ page }) => {
		await page.addInitScript(() => {
			localStorage.setItem('mm_onboardingComplete', 'true');
			localStorage.setItem('mm_tip_banner_dismissed', 'true');
		});
		// A deterministic world, as the TV snapshot spec has it: other hosts aborted (the CARTO
		// basemap aside, its tiles empty), other APIs a fast 503; this file's stubs re-registered
		// after, so they win.
		await page.route('**/*', (route) => {
			const url = new URL(route.request().url());
			if (url.hostname === 'localhost')
				return url.pathname.startsWith('/api/')
					? route.fulfill({ status: 503, contentType: 'application/json', body: '{}' })
					: route.fallback();
			if (!url.hostname.endsWith('cartocdn.com')) return route.abort();
			return /\.(mvt|pbf)$/.test(url.pathname)
				? route.fulfill({
						status: 200,
						contentType: 'application/x-protobuf',
						body: Buffer.alloc(0)
					})
				: route.fallback();
		});
		await stub(page);
		await page.goto('/tv?probe=1');
		const tvSource = (id: string) =>
			page.evaluate((sourceId) => {
				const m = (window as unknown as { __tvProbeMap?: ProbeMap }).__tvProbeMap;
				const active = document
					.querySelector('[data-screen-id][aria-current="true"]')
					?.getAttribute('data-screen-id');
				const src = active === 'map-county' ? m?.getSource(sourceId) : undefined;
				return src
					? src
							.serialize()
							.data.features.map((f) => String(f.properties.title ?? f.properties.name))
					: null;
			}, id);
		// The fresh fire draws, so the stale listings' absence is eligibility's doing.
		await expect.poll(() => tvSource('fire-incidents'), { timeout: 15_000 }).toEqual(['Ridge']);
		// The TV clears the story layers (a754d52): no pin at all, and no old headline on the screen.
		expect(await tvSource('news-pins')).toEqual([]);
		const screen = page.locator('[data-screen-id="map-county"]');
		for (const old of STORIES.filter((st) => st.hoursAgo === OLD))
			await expect(screen).not.toContainText(old.title);
	});
});
