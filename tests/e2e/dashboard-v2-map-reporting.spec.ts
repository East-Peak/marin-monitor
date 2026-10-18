import { expect, test, type Page, type Route } from '@playwright/test';
import {
	MILL_VALLEY,
	PARKING_BOILERPLATE,
	SAN_RAFAEL,
	SOURCES,
	reportingSnapshot,
	type ReportingStory
} from './fixtures/v2-reporting';
import { expectNoAlertAffordance } from './fixtures/alert-affordances';
import { FRESHNESS_CLAIM, LIVE_BADGE } from './fixtures/freshness-claims';
import { camsOff, mapCenter, pinAt, probe, settled, sourceCount } from './fixtures/v2-probe';

test.skip(
	({ baseURL }) => baseURL?.startsWith('https://') ?? false,
	'stubbed; production uses dashboard-v2-map-reporting-prod.spec.ts'
);

const T0 = Math.floor(Date.now() / 1000) * 1000;
const MV_POINT = { lat: 37.906, lon: -122.545 };
// airport-status is owned by Getting Around (its spec pins one request open, none closed).
const UNOWNED = /\/api\/traffic\/events\b/;
let unowned: string[] = [];
const json = (route: Route, body: unknown, status = 200) =>
	route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
/** One Fix It (311) issue in San Rafael, as the /api/data/311 blob carries it. */
const FIX_IT_BLOB = {
	lastUpdated: new Date(T0).toISOString(),
	count: 1,
	issues: [
		{
			id: 901,
			status: 'Open',
			summary: 'Pothole / Bache',
			description: 'Deep pothole',
			lat: 37.9735,
			lng: -122.5311,
			address: '1400 Fifth Ave, San Rafael, CA',
			created_at: new Date(T0 - 3_600_000).toISOString(),
			updated_at: new Date(T0 - 3_600_000).toISOString(),
			html_url: 'https://seeclickfix.com/issues/901'
		}
	]
};

/** Broad fail-fast first, specific routes after (later routes win). Gates switch a source off mid-test. */
/** One USGS quake near Novato, in the shape fetchEarthquakesOrThrow reads (re-anchor on usgs.ts). */
const QUAKE_BODY = {
	type: 'FeatureCollection',
	metadata: { generated: T0 },
	features: [
		{
			id: 'nc1',
			properties: {
				mag: 3.1,
				place: '5 km N of Novato, CA',
				time: T0 - 3_600_000,
				url: 'https://earthquake.usgs.gov/nc1'
			},
			geometry: { type: 'Point', coordinates: [-122.57, 38.15, 5] }
		}
	]
};
async function stub(
	page: Page,
	stories: ReportingStory[],
	gates: { snapshot?: () => boolean; fixIt?: () => boolean; quakes?: () => boolean } = {}
) {
	await page.route(
		/\/api\/(data|nps|transit|health|feeds|article|geocode|calfire)\b|earthquake\.usgs\.gov|api\.weather\.gov|tidesandcurrents/,
		(r) => r.fulfill({ status: 503, body: 'stubbed' })
	);
	await page.route(UNOWNED, (r) => {
		unowned.push(r.request().url());
		return json(r, {});
	});
	if (gates.fixIt)
		await page.route('**/api/data/311', (r) =>
			gates.fixIt!() ? json(r, FIX_IT_BLOB) : r.fulfill({ status: 503, body: 'down' })
		);
	if (gates.quakes)
		await page.route(/earthquake\.usgs\.gov/, (r) =>
			gates.quakes!() ? json(r, QUAKE_BODY) : r.fulfill({ status: 503, body: 'down' })
		);
	await page.route('**/api/news/snapshot', (r) =>
		(gates.snapshot?.() ?? true)
			? r.fulfill({
					status: 200,
					contentType: 'application/json',
					body: reportingSnapshot(T0, stories)
				})
			: r.fulfill({ status: 503, body: 'down' })
	);
}
async function openV2(page: Page) {
	await camsOff(page);
	await page.goto('/?layout=v2&probe');
	await expect(page.locator('[data-layout="v2"][data-hydrated="true"]')).toBeVisible();
}
const rows = (page: Page) => page.locator('[data-slot="latest-reporting"] [data-reporting-row]');
const rowTitles = (page: Page) => rows(page).locator('.v2-news-title').allInnerTexts();
const mapStatus = (page: Page) => page.locator('[data-slot="map-status"] [data-section-status]');

const ALL_OF_MARIN: ReportingStory[] = [
	{
		slug: 'a',
		title: 'Mill Valley opens the new Miller Avenue bike lane',
		source: SOURCES.ptReyes,
		hoursAgo: 1,
		town: MILL_VALLEY,
		point: MV_POINT
	},
	{ slug: 'b', title: 'Supervisors adopt the county budget', source: SOURCES.nbc, hoursAgo: 2 },
	{ slug: 'c', title: 'Oyster season opens on the coast', source: SOURCES.ptReyes, hoursAgo: 3 },
	{
		slug: 'd',
		title: PARKING_BOILERPLATE,
		source: SOURCES.sanRafael,
		hoursAgo: 4,
		town: SAN_RAFAEL
	},
	{ slug: 'e', title: 'Marin schools report enrollment', source: SOURCES.ij, hoursAgo: 5 },
	{ slug: 'f', title: 'Sixth newest, cut by the cap', source: SOURCES.ij, hoursAgo: 6 },
	{ slug: 'g', title: 'An undated item never qualifies', source: SOURCES.ptReyes, hoursAgo: null },
	{ slug: 'h', title: 'Satire never qualifies', source: SOURCES.lately, hoursAgo: 0.5 }
];

test.beforeEach(async ({ page }) => {
	unowned = [];
	await page.clock.install({ time: T0 });
});

test.describe('desktop 1440×900', () => {
	test.use({ viewport: { width: 1440, height: 900 } });

	test('All of Marin: the five newest dated reporting items, each with source · age · scope', async ({
		page
	}) => {
		await stub(page, ALL_OF_MARIN);
		await openV2(page);
		await settled(page);
		expect(await rowTitles(page)).toEqual([
			'Mill Valley opens the new Miller Avenue bike lane',
			'Supervisors adopt the county budget',
			'Oyster season opens on the coast',
			PARKING_BOILERPLATE,
			'Marin schools report enrollment'
		]);
		expect(await rows(page).locator('.v2-news-meta').allInnerTexts()).toEqual([
			'Point Reyes Light · 1 h ago · Mill Valley',
			'NBC Bay Area – Marin · 2 h ago · County-wide',
			'Point Reyes Light · 3 h ago · No town named',
			'City of San Rafael · 4 h ago · San Rafael',
			'Marin Independent Journal · 5 h ago · County-wide'
		]);
		for (const label of await page
			.locator('section#map [data-text-role="meta"], section#map [data-section-status]')
			.allInnerTexts()) {
			expect(label).not.toMatch(LIVE_BADGE);
			expect(label).not.toMatch(FRESHNESS_CLAIM);
		}
	});

	test('Mill Valley: 3 town items + 2 county-wide; a newer unlocated item never pads', async ({
		page
	}) => {
		await stub(page, [
			{ slug: 'u', title: 'Unlocated, newest of all', source: SOURCES.ptReyes, hoursAgo: 0.2 },
			{ slug: 'mv1', title: 'MV one', source: SOURCES.ptReyes, hoursAgo: 1, town: MILL_VALLEY },
			{ slug: 'c1', title: 'County one', source: SOURCES.ij, hoursAgo: 1.5 },
			{ slug: 'mv2', title: 'MV two', source: SOURCES.ptReyes, hoursAgo: 2, town: MILL_VALLEY },
			{ slug: 'c2', title: 'County two', source: SOURCES.nbc, hoursAgo: 2.5 },
			{ slug: 'mv3', title: 'MV three', source: SOURCES.ptReyes, hoursAgo: 3, town: MILL_VALLEY },
			{ slug: 'c3', title: 'County three', source: SOURCES.ij, hoursAgo: 3.5 },
			{ slug: 'mv4', title: 'MV four', source: SOURCES.ptReyes, hoursAgo: 4, town: MILL_VALLEY }
		]);
		await openV2(page);
		await settled(page);
		await page.locator('[data-layout="v2"] .picker-trigger').click();
		await page.getByRole('option', { name: 'Mill Valley' }).click();
		await expect
			.poll(() => rowTitles(page))
			.toEqual(['MV one', 'County one', 'MV two', 'County two', 'MV three']);
	});

	test('the keyword-flagged boilerplate is an ordinary row, and nothing pulses on the map (Decision 10)', async ({
		page
	}) => {
		await stub(page, ALL_OF_MARIN);
		await openV2(page);
		await expect(rows(page).filter({ hasText: 'parking violation' })).toHaveCount(1);
		await expectNoAlertAffordance(page.locator('[data-slot="latest-reporting"]'));
		// Read from the map itself (not the hook), so control (a) can reach this assertion.
		await expect.poll(() => sourceCount(page, 'news-pins'), { timeout: 20_000 }).toBeGreaterThan(0);
		expect(await sourceCount(page, 'alert-pulses')).toBe(0);
	});

	test('ordinary words are not alerts: a Nixle /alert/ link and a headline with "alert" and "live" pass the guard (Codex r1 #3)', async ({
		page
	}) => {
		await stub(page, [
			{
				slug: 'nixle-lift',
				title: 'Library alert list moves to email; board meeting goes live at noon',
				source: SOURCES.sanRafael,
				hoursAgo: 1,
				town: SAN_RAFAEL,
				link: 'https://local.nixle.com/alert/123/'
			}
		]);
		await openV2(page);
		await settled(page);
		const row = rows(page).filter({ hasText: 'alert list' });
		await expect(row.locator('a')).toHaveAttribute('href', 'https://local.nixle.com/alert/123/');
		await expectNoAlertAffordance(page.locator('[data-slot="latest-reporting"]'));
	});

	test('the v2 map draws only owned layers, asks for no unowned data, and names failing layer sources (Decision 3; Codex r3 #1)', async ({
		page
	}) => {
		await stub(page, ALL_OF_MARIN);
		await openV2(page);
		const p = await settled(page);
		expect(p.synced!.counts['news-pins']).toBeGreaterThan(0);
		expect(p.synced!.counts['alert-pulses']).toBe(0);
		await expect(mapStatus(page)).toHaveAttribute('data-section-status', 'partial');
		await expect(mapStatus(page)).toContainText('USGS earthquakes'); // USGS is stubbed down
		// Airports are Getting Around's own read since MAPX2c (dashboard-v2-map-layers-restore).
		for (const place of ['gas-stations', 'ev-charging-stations', 'coffee-shops', 'fitness-studios'])
			expect(await sourceCount(page, place), place).toBe(0);
		await expect(
			page.locator('.v2-map').getByRole('button', { name: /^(Gas|EV|Coffee|Fitness)/ })
		).toHaveCount(0);
		await expect(page.locator('.v2-map .traffic-toggle')).toHaveCount(0);
		await page.waitForTimeout(2_000);
		expect(unowned).toEqual([]);
	});

	test('311 and quakes that load with their payload time are not named in the map status', async ({
		page
	}) => {
		await stub(page, ALL_OF_MARIN, { fixIt: () => true, quakes: () => true });
		await openV2(page);
		const p = await settled(page);
		expect(p.synced!.counts['311-reports']).toBeGreaterThan(0);
		expect(p.synced!.counts['earthquakes']).toBeGreaterThan(0);
		const container = page.locator('[data-slot="map-status"]');
		const text =
			(await mapStatus(page).count()) === 0 ? 'no status line' : await container.innerText();
		console.log(`map status: ${text}`);
		await expect(container).not.toHaveText(/Fix It Marin \(311\)/);
		await expect(container).not.toHaveText(/USGS earthquakes/);
	});

	test('negative control: quakes with no payload time still read "unverified"', async ({
		page
	}) => {
		await stub(page, ALL_OF_MARIN, { fixIt: () => true, quakes: () => true });
		const { metadata: _, ...untimed } = QUAKE_BODY;
		await page.route(/earthquake\.usgs\.gov/, (r) => json(r, untimed));
		await openV2(page);
		const p = await settled(page);
		expect(p.synced!.counts['earthquakes']).toBeGreaterThan(0);
		await expect(mapStatus(page)).toContainText('USGS earthquakes unverified');
	});

	test('success → failure: kept pins are dimmed, say from when, and the status is not fresh (Codex r3 #1)', async ({
		page
	}) => {
		let up = true;
		await stub(page, ALL_OF_MARIN, { snapshot: () => up });
		await openV2(page);
		expect((await settled(page)).synced!.counts['news-pins:retained']).toBe(0);
		up = false;
		// V2_REFRESH_MS: the next cycle's snapshot read fails. fastForward fires the refresh interval
		// once; runFor would step every tick and map frame of five minutes, which overran under load.
		await page.clock.fastForward(5 * 60_000 + 1_000);
		await expect
			.poll(
				async () => {
					const c = (await probe(page))?.synced?.counts;
					return !!c && c['news-pins'] > 0 && c['news-pins:retained'] === c['news-pins'];
				},
				{ timeout: 20_000 }
			)
			.toBe(true);
		await expect(mapStatus(page)).not.toHaveAttribute('data-section-status', /ok|loading/);
		await expect.poll(() => pinAt(page), { timeout: 20_000 }).not.toBeNull();
		const at = (await pinAt(page))!;
		await page.mouse.click(at.x, at.y);
		console.log(
			`snapshot kept note: ${await page.locator('[data-inspector-note]').first().innerText()}`
		);
		await expect(page.locator('[data-inspector-note]').first()).toHaveText(
			/^Kept from ([A-Z][a-z]{2} \d{1,2}, )?\d{1,2}:\d{2} [AP]M · /
		);
	});

	test('success → failure: kept 311 and quake pins open a detail that says so (Codex r4 #2; MAPX2 panel)', async ({
		page
	}) => {
		let up = true;
		await stub(page, ALL_OF_MARIN, { fixIt: () => up, quakes: () => up });
		await openV2(page);
		const first = await settled(page);
		expect(first.layers).toMatchObject({ '311': 'value', earthquakes: 'value' });
		up = false;
		// fastForward fires the refresh interval once, at the jump's end: past the USGS cache TTL
		// (5 min), so the quake read goes to the network, where v2's live-only read fails and the
		// last list is kept. (runFor stepped every tick and map frame of ten minutes; it overran.)
		await page.clock.fastForward(10 * 60_000 + 1_000);
		await expect
			.poll(
				async () => {
					const c = (await probe(page))?.synced?.counts;
					return (
						!!c &&
						c['311-reports'] > 0 &&
						c['311-reports:retained'] === c['311-reports'] &&
						c['earthquakes:retained'] === c['earthquakes'] &&
						c['earthquakes'] > 0
					);
				},
				{ timeout: 30_000 }
			)
			.toBe(true);
		type Cam = { getCenter(): unknown; getZoom(): number; jumpTo(o: object): void };
		const view = await page.evaluate(() => {
			const m = (window as unknown as { __v2ProbeMap: Cam }).__v2ProbeMap;
			return { center: m.getCenter(), zoom: m.getZoom() };
		});
		for (const layer of ['311-reports-layer', 'earthquakes-layer']) {
			// A selection flies to its item (MAPX2): start each layer from the county view.
			await page.evaluate(
				(v) => (window as unknown as { __v2ProbeMap: Cam }).__v2ProbeMap.jumpTo(v),
				view
			);
			await expect.poll(() => pinAt(page, layer), { timeout: 20_000 }).not.toBeNull();
			const at = (await pinAt(page, layer))!;
			await page.mouse.click(at.x, at.y);
			// Desktop: the detail opens in the docked in-view panel, not a popup (MAPX2).
			const inspector = page.locator('[data-detail-panel]');
			await expect(inspector.locator('[data-detail]'), layer).toBeVisible();
			console.log(
				`${layer} kept note: ${await inspector.locator('[data-inspector-note]').innerText()}`
			);
			await expect(inspector.locator('[data-inspector-note]'), layer).toHaveText(
				/^Kept from ([A-Z][a-z]{2} \d{1,2}, )?\d{1,2}:\d{2} [AP]M · /
			);
			await inspector.getByRole('button', { name: '← Back to list' }).click();
		}
	});

	test('legacy → v2 with a failing first v2 Fix It read draws no inherited 311 pins (Codex r3 #1)', async ({
		page
	}) => {
		let up = true;
		await stub(page, ALL_OF_MARIN, { fixIt: () => up });
		const legacy311 = page.waitForResponse(
			(r) => new URL(r.url()).pathname === '/api/data/311' && r.status() === 200
		);
		await page.goto('/?layout=legacy');
		await expect(page.locator('[data-layout="legacy"]')).toBeVisible();
		await legacy311;
		// Not hollow (Codex 9c #3): the response alone doesn't prove the store commit; legacy's
		// wire renders the issue from the shared 311 store only once it is committed.
		await expect(page.getByText(/Pothole/).first()).toBeAttached({ timeout: 30_000 });
		up = false;
		await page.evaluate(() => {
			const a = document.createElement('a');
			a.href = '/?layout=v2&probe';
			a.id = 'to-v2';
			a.textContent = 'Preview'; // an empty link has no box and is never "visible"
			document.querySelector('[data-layout="legacy"]')!.append(a);
		});
		// Legacy may show its welcome modal over the page; dispatch the click so SvelteKit's router
		// still takes it as a client-side navigation (the shared stores survive it).
		await page.evaluate(() => ((window as unknown as { __noReload?: number }).__noReload = 1));
		await page.locator('#to-v2').dispatchEvent('click');
		await expect(page.locator('[data-layout="v2"][data-hydrated="true"]')).toBeVisible();
		// Not hollow: a full reload would empty the shared stores this test is about.
		expect(
			await page.evaluate(() => (window as unknown as { __noReload?: number }).__noReload)
		).toBe(1);
		const p = await settled(page);
		expect(p.layers['311']).toBe('unavailable');
		expect(p.synced!.counts['311-reports']).toBe(0);
		expect(await sourceCount(page, '311-reports')).toBe(0);
	});

	test('a town with nothing on the map reads "nothing for this town", never "nothing new" (Codex r3 #4)', async ({
		page
	}) => {
		await stub(page, ALL_OF_MARIN);
		await openV2(page);
		await settled(page);
		await page.locator('[data-layout="v2"] .picker-trigger').click();
		await page.getByRole('option', { name: 'Novato' }).click();
		await expect(mapStatus(page)).toHaveAttribute('data-section-status', 'no-match');
		await expect(mapStatus(page)).not.toContainText('Nothing new');
	});

	test('a pin opens its detail in the in-view panel and never changes the town (§2.4, MAPX2)', async ({
		page
	}) => {
		await stub(page, ALL_OF_MARIN);
		await openV2(page);
		await settled(page);
		await expect.poll(() => pinAt(page), { timeout: 20_000 }).not.toBeNull();
		const at = (await pinAt(page))!;
		await page.mouse.click(at.x, at.y);
		await expect(
			page.getByRole('complementary', { name: 'In view' }).locator('[data-detail]')
		).toBeVisible();
		await expect(page.locator('aside.inspector, aside.feature-inspector')).toHaveCount(0);
		await expect(page.locator('[data-layout="v2"] .picker-trigger')).toHaveText(/All of Marin/);
		expect(await page.evaluate(() => localStorage.getItem('mm_town'))).toBeNull();
	});
});

test.describe('phone 390×844', () => {
	test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

	test('with every section closed the map preview has its pins drawn (§13.7); Expand map opens /map (MAPX3)', async ({
		page
	}) => {
		await stub(page, ALL_OF_MARIN);
		await openV2(page);
		for (const t of await page.locator('[data-section-toggle]').all())
			await expect(t).toHaveAttribute('aria-expanded', 'false');
		expect((await settled(page)).synced!.counts['news-pins']).toBeGreaterThan(0);
		expect((await page.locator('#v2-map-canvas').boundingBox())!.height).toBeLessThan(260);
		// The link has a corner of its own: it never covers the attribution (Codex 9c #2).
		const expand = page.getByRole('link', { name: 'Expand map' });
		const a = (await expand.boundingBox())!;
		const b = (await page.locator('.v2-map .maplibregl-ctrl-attrib').boundingBox())!;
		expect(
			a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
		).toBe(false);
		await expand.click();
		await expect(page).toHaveURL(/\/map\?/);
		await expect(page.locator('[data-layout="explore"][data-hydrated="true"]')).toBeVisible();
		await expect(page.getByRole('region', { name: 'In view' })).toBeVisible();
		await expect(
			page.locator('.v2-map aside.inspector, .v2-map aside.feature-inspector')
		).toHaveCount(0);
	});

	test('a vertical drag on the preview scrolls the page and does not pan the map; on /map, the map pans (Codex r1 #13)', async ({
		page
	}) => {
		await stub(page, ALL_OF_MARIN);
		await openV2(page);
		await settled(page);
		const box = (await page.locator('#v2-map-canvas').boundingBox())!;
		const cdp = await page.context().newCDPSession(page);
		const swipe = (b: { x: number; y: number; width: number; height: number }) =>
			cdp.send('Input.synthesizeScrollGesture', {
				x: Math.round(b.x + b.width / 2),
				y: Math.round(b.y + b.height / 2),
				yDistance: -150,
				gestureSourceType: 'touch',
				speed: 600
			});
		const before = await mapCenter(page);
		await page.evaluate(() => window.scrollTo(0, 0));
		await swipe(box);
		await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
		expect(await mapCenter(page)).toEqual(before);
		await page.getByRole('link', { name: 'Expand map' }).click();
		await expect(page.locator('[data-layout="explore"][data-hydrated="true"]')).toBeVisible();
		await settled(page);
		const atMap = await mapCenter(page);
		// The upper part of the map: clear of the sheet at the bottom.
		const open = (await page.locator('#v2-map-canvas').boundingBox())!;
		await swipe({ ...open, height: Math.min(open.height, 300) });
		await expect.poll(() => mapCenter(page)).not.toEqual(atMap);
	});
});
