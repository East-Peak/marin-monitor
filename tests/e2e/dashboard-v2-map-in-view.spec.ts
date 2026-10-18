import { expect, test, type Page, type Route } from '@playwright/test';
import { MILL_VALLEY, SAN_RAFAEL, SOURCES, reportingSnapshot } from './fixtures/v2-reporting';
import { camsOff, pinAt, probe, settled } from './fixtures/v2-probe';

/** MAPX2: the full-width map, its docked in-view list, and detail in the panel (no popup). */
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
			// East of San Rafael's town circle, so the rebalance check samples each on its own.
			lat: 37.955,
			lng: -122.49,
			address: '1400 Fifth Ave, San Rafael, CA',
			created_at: new Date(T0 - 3_600_000).toISOString(),
			updated_at: new Date(T0 - 3_600_000).toISOString(),
			html_url: 'https://seeclickfix.com/issues/901'
		}
	]
};
const QUAKES = {
	type: 'FeatureCollection',
	metadata: { generated: T0 },
	features: [
		{
			id: 'nc1',
			properties: {
				mag: 3.1,
				place: '5 km N of Novato, CA',
				time: T0 - 7_200_000,
				url: 'https://earthquake.usgs.gov/nc1'
			},
			geometry: { type: 'Point', coordinates: [-122.57, 38.15, 5] }
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
	},
	{ slug: 'b', title: 'Supervisors adopt the county budget', source: SOURCES.nbc, hoursAgo: 2 },
	{
		slug: 'd',
		title: 'San Rafael council sets a hearing',
		source: SOURCES.sanRafael,
		hoursAgo: 4,
		town: SAN_RAFAEL
	},
	{ slug: 'e', title: 'Marin schools report enrollment', source: SOURCES.ij, hoursAgo: 5 },
	{ slug: 'f', title: 'Ferry schedule changes', source: SOURCES.ij, hoursAgo: 6 },
	{ slug: 'g', title: 'Library hours extend', source: SOURCES.ij, hoursAgo: 7 }
];

/** `extra` routes are added after the broad fail-fast stub, so they win. */
async function open(page: Page, extra: (page: Page) => Promise<unknown> = async () => {}) {
	await camsOff(page);
	await page.route(
		/\/api\/(data|nps|transit|health|feeds|article|geocode|calfire|traffic)\b|earthquake\.usgs\.gov|api\.weather\.gov|tidesandcurrents/,
		(r) => r.fulfill({ status: 503, body: 'stubbed' })
	);
	await page.route('**/api/data/311', (r) => json(r, FIX_IT));
	await page.route(/earthquake\.usgs\.gov/, (r) => json(r, QUAKES));
	await extra(page);
	await page.route('**/api/news/snapshot', (r) =>
		r.fulfill({
			status: 200,
			contentType: 'application/json',
			body: reportingSnapshot(T0, STORIES)
		})
	);
	await page.goto('/?probe');
	await expect(page.locator('[data-layout="v2"][data-hydrated="true"]')).toBeVisible();
	await settled(page);
}
const panel = (page: Page) => page.getByRole('complementary', { name: 'In view' });
const listed = (page: Page) => panel(page).locator('[data-in-view-row]');

test.beforeEach(async ({ page }) => {
	await page.clock.install({ time: T0 });
});

test.describe('desktop 1440×900', () => {
	test.use({ viewport: { width: 1440, height: 900 } });

	test('the map spans the content width; Latest reporting sits under it as one row of five', async ({
		page
	}) => {
		await open(page);
		const main = (await page.locator('section#map').boundingBox())!;
		const map = (await page.locator('.v2-map-canvas').boundingBox())!;
		expect(Math.abs(map.width - main.width)).toBeLessThanOrEqual(2);
		expect(map.height).toBe(Math.round(Math.min(820, Math.max(520, 0.62 * 900))));
		const rows = page.locator('[data-slot="latest-reporting"] [data-reporting-row]');
		await expect(rows).toHaveCount(5);
		const tops = await rows.evaluateAll((els) =>
			els.map((el) => Math.round(el.getBoundingClientRect().top))
		);
		expect(new Set(tops).size).toBe(1);
		expect(tops[0]).toBeGreaterThan(map.y + map.height);
	});

	test('the in-view list names what is on the visible map, newest first per layer', async ({
		page
	}) => {
		await open(page);
		// Placed only: the street-pinned MV story, the San Rafael town story at its circle, the
		// 311 report and the quake. Unplaced county stories are not on the map, so not listed.
		await expect
			.poll(() => listed(page).evaluateAll((els) => els.map((el) => el.dataset.inViewRow)))
			.toEqual([
				'news:point-reyes-light:a',
				'news:city-of-san-rafael:d',
				'311:seeclickfix-901',
				'quake:usgs-nc1'
			]);
		await expect(panel(page).locator('[data-in-view-count]')).toHaveText('In view · 4');
	});

	test('clicking a 311 pin shows its detail in the panel, never a popup; Back returns to the list', async ({
		page
	}) => {
		await open(page);
		await expect.poll(() => pinAt(page, '311-reports-layer'), { timeout: 20_000 }).not.toBeNull();
		const at = (await pinAt(page, '311-reports-layer'))!;
		await page.mouse.click(at.x, at.y);
		const detail = panel(page).locator('[data-detail]');
		await expect(detail).toContainText('Deep pothole by the crosswalk');
		await expect(detail.getByRole('link', { name: /Open on Fix It Marin/ })).toHaveAttribute(
			'href',
			'https://seeclickfix.com/issues/901'
		);
		await expect(page.locator('aside.feature-inspector, aside.inspector')).toHaveCount(0);
		await page.keyboard.press('Escape');
		await expect(listed(page).first()).toBeVisible();
	});

	test('a row selects its item and flies there; hovering a row rings its pin', async ({ page }) => {
		await open(page);
		const row = panel(page).locator('[data-in-view-row="quake:usgs-nc1"]');
		await row.hover();
		await expect
			.poll(() =>
				page.evaluate(() => {
					const m = (
						window as unknown as {
							__v2ProbeMap?: {
								getSource(id: string): { serialize(): { data: { features: unknown[] } } };
							};
						}
					).__v2ProbeMap;
					return m?.getSource('v2-in-view-highlight')?.serialize().data.features.length ?? -1;
				})
			)
			.toBe(1);
		await row.click();
		await expect(panel(page).locator('[data-detail]')).toContainText('USGS');
		await expect
			.poll(
				() =>
					page.evaluate(() => {
						const c = (
							window as unknown as { __v2ProbeMap?: { getCenter(): { lng: number; lat: number } } }
						).__v2ProbeMap?.getCenter();
						return c ? Math.hypot(c.lng + 122.57, c.lat - 38.15) : 9;
					}),
				{ timeout: 5_000 }
			)
			.toBeLessThan(0.01);
	});

	test('the panel collapses to a tab and comes back', async ({ page }) => {
		await open(page);
		await panel(page).getByRole('button', { name: 'Hide' }).click();
		await expect(listed(page)).toHaveCount(0);
		await panel(page).getByRole('button', { name: 'Show in view' }).click();
		await expect(listed(page).first()).toBeVisible();
	});
});

/** /api/traffic/corridors with 511 points (MAPX2b): two located Marin events, one without a point. */
const CORRIDORS = {
	checkedAt: new Date(T0 - 60_000).toISOString(),
	upstreamCount: 3,
	unreadable: 0,
	events: [
		['t1', 'Minor', [-122.515, 37.93]],
		['t2', null, [-122.53, 38.0]],
		['t3', 'Major', null]
	].map(([id, severity, at]) => ({
		id,
		marin: true,
		corridor: null,
		trip: null,
		closed: false,
		lanes: null,
		certain: true,
		kind: 'Traffic Collision',
		road: 'US-101',
		where: 'Northbound at Lucky Dr',
		severity,
		reportedAt: new Date(T0 - 1_800_000).toISOString(),
		at
	}))
};
const layerRow = (page: Page, id: string) => page.locator(`[data-layer-row="${id}"]`);

test.describe('desktop 1440×900: layers (MAPX2b)', () => {
	test.use({ viewport: { width: 1440, height: 900 } });

	test('an ok traffic read is drawn, counted in view, and names what it could not place', async ({
		page
	}) => {
		await open(page, (p) => p.route('**/api/traffic/corridors', (r) => json(r, CORRIDORS)));
		// Settle on its own budget, then poll the probe (as map-layers-restore's airports do).
		await settled(page);
		await expect.poll(async () => (await probe(page))?.synced?.counts['traffic-events']).toBe(2);
		await page.getByRole('button', { name: 'Layers' }).click();
		await expect(layerRow(page, 'traffic').locator('[data-layer-status]')).toHaveText(
			/^511 · as of \d{1,2}:\d{2} [AP]M$/
		);
		await expect(layerRow(page, 'traffic').locator('[data-layer-note]')).toHaveText(
			'1 event without a location'
		);
		await expect(layerRow(page, 'traffic').locator('[data-layer-count]')).toHaveText(/^[12]$/);
		const at = (await pinAt(page, 'traffic-events-layer'))!;
		await page.mouse.click(at.x, at.y);
		await expect(panel(page).locator('[data-detail]')).toContainText('Traffic Collision · US-101');
	});

	test('failed reads say "unavailable", draw nothing and claim no count', async ({ page }) => {
		// open() fails /api/traffic, /api/calfire and /api/data (gas, EV, coffee).
		await open(page);
		const p = await settled(page);
		for (const source of ['traffic-events', 'fire-incidents', 'gas-stations'])
			expect(p.synced!.counts[source], source).toBe(0);
		await page.getByRole('button', { name: 'Layers' }).click();
		for (const [id, source] of [
			['traffic', '511'],
			['fire', 'CAL FIRE + NIFC'],
			['gas', 'Google Places']
		]) {
			await expect(layerRow(page, id).locator('[data-layer-status]')).toHaveText(
				`${source} unavailable`
			);
			await expect(layerRow(page, id).locator('[data-layer-count]')).toHaveCount(0);
		}
	});

	test('a layer choice persists with the section prefs (version 3)', async ({ page }) => {
		await open(page);
		await page.getByRole('button', { name: 'Layers' }).click();
		// Every layer starts on (Stuart, 2026-10-17); switching one off is the saved choice.
		const ev = layerRow(page, 'ev').getByRole('checkbox');
		await expect(ev).toBeChecked();
		await ev.uncheck();
		expect(
			JSON.parse((await page.evaluate(() => localStorage.getItem('mm_sections_v2'))) ?? '{}')
		).toMatchObject({ version: 3, layers: { ev: false } });
		await page.reload();
		await expect(page.locator('[data-layout="v2"][data-hydrated="true"]')).toBeVisible();
		await page.getByRole('button', { name: 'Layers' }).click();
		await expect(layerRow(page, 'ev').getByRole('checkbox')).not.toBeChecked();
	});
});

test.describe('desktop 1440×900: rebalance (MAPX2b)', () => {
	test.use({ viewport: { width: 1440, height: 900 } });

	test('a town circle with stories reads bright, and distinct from a 311 dot', async ({ page }) => {
		await open(page);
		await page.waitForTimeout(800); // the map's last paint after the synced revision
		const at = (lon: number, lat: number) =>
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
					return { x: Math.round(r.left + p.x), y: Math.round(r.top + p.y) };
				},
				[lon, lat]
			);
		await page.screenshot({ path: '/tmp/claude-501/mapx2-rebalance-1440-labels.png' });
		// Sample the fill, not the count label at the circle's centre.
		await page.evaluate(() =>
			(
				window as unknown as {
					__v2ProbeMap: { setLayoutProperty(id: string, p: string, v: string): void };
				}
			).__v2ProbeMap.setLayoutProperty('v2-towns-count', 'visibility', 'none')
		);
		await page.waitForTimeout(300);
		const town = await at(-122.5311, 37.9735); // San Rafael: one civic story
		const dot = await at(-122.49, 37.955);
		const shot = await page.screenshot({ path: '/tmp/claude-501/mapx2-rebalance-1440.png' });
		const rgb = (x: number, y: number) =>
			page.evaluate(
				async ([b64, px, py]) => {
					const img = new Image();
					img.src = `data:image/png;base64,${b64}`;
					await img.decode();
					const c = document.createElement('canvas');
					c.width = img.width;
					c.height = img.height;
					const g = c.getContext('2d')!;
					g.drawImage(img, 0, 0);
					return [...g.getImageData(px as number, py as number, 1, 1).data.slice(0, 3)];
				},
				[shot.toString('base64'), x, y] as const
			);
		const [tr, tg, tb] = await rgb(town.x, town.y);
		const [dr, dg, db] = await rgb(dot.x, dot.y);
		console.log(`town ${[tr, tg, tb]} · 311 ${[dr, dg, db]}`);
		// The civic fill (#93c5fd) over the dark basemap: light and blue, not the old dark #3b82f6.
		expect(tb).toBeGreaterThan(200);
		expect((tr + tg + tb) / 3).toBeGreaterThan(150);
		// The 311 dot stays orange, and the two never read as the same mark.
		expect(dr).toBeGreaterThan(db + 60);
		expect(Math.hypot(tr - dr, tg - dg, tb - db)).toBeGreaterThan(120);
	});
});
