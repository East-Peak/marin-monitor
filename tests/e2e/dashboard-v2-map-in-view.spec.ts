import { expect, test, type Page, type Route } from '@playwright/test';
import { MILL_VALLEY, SAN_RAFAEL, SOURCES, reportingSnapshot } from './fixtures/v2-reporting';
import { pinAt, settled } from './fixtures/v2-probe';

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
			lat: 37.9735,
			lng: -122.5311,
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

async function open(page: Page) {
	await page.route(
		/\/api\/(data|nps|transit|health|feeds|article|geocode|calfire|traffic)\b|earthquake\.usgs\.gov|api\.weather\.gov|tidesandcurrents/,
		(r) => r.fulfill({ status: 503, body: 'stubbed' })
	);
	await page.route('**/api/data/311', (r) => json(r, FIX_IT));
	await page.route(/earthquake\.usgs\.gov/, (r) => json(r, QUAKES));
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
