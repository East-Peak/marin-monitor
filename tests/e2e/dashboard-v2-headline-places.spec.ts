import { expect, test, type Page } from '@playwright/test';
import {
	MILL_VALLEY,
	SOURCES,
	reportingSnapshot,
	type ReportingStory
} from './fixtures/v2-reporting';
import { pinAt, settled, sourceCount } from './fixtures/v2-probe';

/**
 * NEWSPIN2: a story is placed at the one reviewed place its headline names, only as precisely as
 * that place: Tomales Bay is an area, drawn as a halo labelled "(area)", never a dot. A town-only
 * story stays a count on its town.
 */
test.skip(({ baseURL }) => baseURL?.startsWith('https://') ?? false, 'stubbed');

const T0 = Math.floor(Date.now() / 1000) * 1000;
/** Today's real headline (2026-10-19); the producer matched the town Tomales in it. */
const BAY = 'Woman from Los Angeles dies after kayak capsizes in Tomales Bay';
const STORIES = [
	{
		slug: 'kayak',
		title: BAY,
		source: SOURCES.ij,
		hoursAgo: 2,
		town: { name: 'Tomales', slug: 'tomales' }
	},
	{
		slug: 'forum',
		title: 'Mill Valley forum highlights fire alert concerns',
		source: SOURCES.ij,
		hoursAgo: 3,
		town: MILL_VALLEY
	}
];
const BAY_ROW = `news:${SOURCES.ij.id}:kayak`;
/** Only the stories: the data layers have their own specs. */
const NO_DATA_LAYERS = {
	traffic: false,
	fire: false,
	gas: false,
	ev: false,
	coffee: false,
	fitness: false,
	airport: false,
	cams: false,
	shows: false,
	blotter: false,
	roads: false
};

/**
 * One fresh story per placement path, and two stale ones that would each be placed. The feed's
 * point goes to news-pins; a named place to story-places; a town alone to the town's count.
 */
const STALE_HOURS = 8 * 24;
const PATHS = [
	{
		slug: 'at-point',
		title: 'Crews repair a culvert',
		source: SOURCES.ij,
		hoursAgo: 1,
		point: { lat: 37.97, lon: -122.53 }
	},
	...STORIES,
	{
		slug: 'stale-place',
		title: 'Boaters rescued on Tomales Bay',
		source: SOURCES.ij,
		hoursAgo: STALE_HOURS,
		town: { name: 'Tomales', slug: 'tomales' }
	},
	{
		slug: 'stale-point',
		title: 'Crews finish an old culvert',
		source: SOURCES.ij,
		hoursAgo: STALE_HOURS,
		point: { lat: 38.1, lon: -122.57 }
	},
	{
		slug: 'stale-town',
		title: 'Mill Valley parade recap',
		source: SOURCES.ij,
		hoursAgo: STALE_HOURS,
		town: MILL_VALLEY
	}
];

async function stub(page: Page, stories: ReportingStory[] = STORIES) {
	await page.addInitScript((layers) => {
		localStorage.setItem('mm_sections_v2', JSON.stringify({ version: 3, open: {}, layers }));
	}, NO_DATA_LAYERS);
	await page.route(
		/\/api\/(data|nps|transit|health|feeds|article|geocode|calfire|traffic|airport-status|cams)\b|earthquake\.usgs\.gov|api\.weather\.gov|tidesandcurrents|data\.marincounty\.gov/,
		(r) => r.fulfill({ status: 503, body: 'stubbed' })
	);
	await page.route('**/api/news/snapshot', (r) =>
		r.fulfill({
			status: 200,
			contentType: 'application/json',
			body: reportingSnapshot(T0, stories)
		})
	);
}

/** The drawn story places, by layer, with their labels; and Tomales's town count. */
const drawn = (page: Page) =>
	page.evaluate(() => {
		type Rendered = { properties: Record<string, unknown> };
		const m = (
			window as unknown as {
				__v2ProbeMap?: {
					queryRenderedFeatures(o: { layers: string[] }): Rendered[];
					getSource(id: string): {
						serialize(): { data: { features: { properties: Record<string, unknown> }[] } };
					};
				};
			}
		).__v2ProbeMap;
		if (!m) return null;
		const labels = (layer: string) =>
			m.queryRenderedFeatures({ layers: [layer] }).map((f) => String(f.properties.label));
		const tomales = m
			.getSource('towns')
			.serialize()
			.data.features.find((f) => f.properties.slug === 'tomales');
		return {
			halo: labels('story-places-halo'),
			label: labels('story-places-label'),
			dot: labels('story-places-dot'),
			tomales: Number(tomales?.properties.total ?? 0)
		};
	});
const rows = (scope: ReturnType<Page['locator']>) =>
	scope
		.locator('[data-in-view-row]')
		.evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.inViewRow));

test.beforeEach(async ({ page }) => {
	await page.clock.install({ time: T0 });
});

test.describe('desktop 1440×900', () => {
	test.use({ viewport: { width: 1440, height: 900 } });

	test('a Tomales Bay story draws a halo labelled "(area)", never a dot, and leaves the town count', async ({
		page
	}) => {
		await stub(page);
		await page.goto('/?probe');
		await expect(page.locator('[data-layout="v2"][data-hydrated="true"]')).toBeVisible();
		await settled(page);
		expect(await sourceCount(page, 'story-places')).toBe(1);
		await expect
			.poll(() => drawn(page))
			.toEqual({
				halo: ['Tomales Bay (area)'],
				label: ['Tomales Bay (area)'],
				dot: [],
				tomales: 0
			});
		const panel = page.getByRole('complementary', { name: 'In view' });
		await expect.poll(() => rows(panel)).toContain(BAY_ROW);
		await panel.locator(`[data-in-view-row="${BAY_ROW}"]`).click();
		await expect(panel.locator('[data-detail]')).toContainText(
			'Tomales Bay (area) · matched in the headline'
		);
		await page.getByRole('button', { name: 'Layers' }).click();
		await expect(page.locator('[data-layer-panel] [data-stories-note]')).toHaveText(
			'1 placed by its headline · 1 counted on its town'
		);
	});
});

/** A click on the halo's soft edge, away from the centre's hit circle (Codex NEWSPIN2 #3). */
async function clickHaloEdge(page: Page) {
	await expect.poll(() => pinAt(page, 'story-places-halo')).not.toBeNull();
	const at = (await pinAt(page, 'story-places-halo'))!;
	await page.mouse.click(at.x + 20, at.y - 6);
}

test.describe('desktop /map 1440×900', () => {
	test.use({ viewport: { width: 1440, height: 900 } });

	test('each path places exactly its fresh story, and a stale story shows on none', async ({
		page
	}) => {
		await stub(page, PATHS);
		await page.goto('/map?probe');
		await expect(page.locator('[data-layout="explore"][data-hydrated="true"]')).toBeVisible();
		await settled(page);
		expect(await sourceCount(page, 'news-pins')).toBe(1);
		expect(await sourceCount(page, 'story-places')).toBe(1);
		const towns = await page.evaluate(() => {
			type Town = { properties: { slug: string; total: number } };
			const m = (
				window as unknown as {
					__v2ProbeMap?: {
						getSource(id: string): { serialize(): { data: { features: Town[] } } };
					};
				}
			).__v2ProbeMap;
			return m
				?.getSource('towns')
				.serialize()
				.data.features.filter((f) => Number(f.properties.total) > 0)
				.map((f) => [f.properties.slug, f.properties.total]);
		});
		expect(towns).toEqual([['mill-valley', 1]]);
		const panel = page.getByRole('complementary', { name: 'In view' });
		await expect
			.poll(async () => (await rows(panel)).filter((id) => id?.startsWith('news:')).sort())
			.toEqual(
				['at-point', 'forum', 'kayak'].map((slug) => `news:${SOURCES.ij.id}:${slug}`).sort()
			);
	});

	test('a click on the halo’s edge opens the story with its place', async ({ page }) => {
		await stub(page);
		await page.goto('/map?probe#11/38.16/-122.95');
		await expect(page.locator('[data-layout="explore"][data-hydrated="true"]')).toBeVisible();
		await settled(page);
		await clickHaloEdge(page);
		const panel = page.getByRole('complementary', { name: 'In view' });
		await expect(panel.locator('[data-detail]')).toContainText(
			'Tomales Bay (area) · matched in the headline'
		);
	});
});

test.describe('tablet 900×1100', () => {
	test.use({ viewport: { width: 900, height: 1100 }, hasTouch: true });

	test('a tap on the halo opens its place, not a town-level story', async ({ page }) => {
		await stub(page);
		await page.goto('/?probe');
		await expect(page.locator('[data-layout="v2"][data-hydrated="true"]')).toBeVisible();
		await settled(page);
		await expect.poll(() => pinAt(page, 'story-places-halo')).not.toBeNull();
		const at = (await pinAt(page, 'story-places-halo'))!;
		await page.mouse.click(at.x, at.y);
		const inspector = page.getByRole('complementary', { name: 'Map feature inspector' });
		await expect(inspector).toContainText('Tomales Bay (area) · matched in the headline');
		await expect(inspector).not.toContainText('TOWN');
	});
});

test.describe('phone 390×844', () => {
	test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

	test('/map: the same halo, never a dot; its row says where the place came from', async ({
		page
	}) => {
		await stub(page);
		await page.goto('/map?probe#10/38.05/-122.75');
		await expect(page.locator('[data-layout="explore"][data-hydrated="true"]')).toBeVisible();
		await settled(page);
		await expect
			.poll(() => drawn(page))
			.toMatchObject({ halo: ['Tomales Bay (area)'], label: ['Tomales Bay (area)'], dot: [] });
		await clickHaloEdge(page);
		await expect(page.getByRole('dialog')).toContainText(
			'Tomales Bay (area) · matched in the headline'
		);
		await page.keyboard.press('Escape');
		const sheet = page.getByRole('region', { name: 'In view' });
		const handle = sheet.locator('[data-sheet-handle]');
		await handle.focus();
		await page.keyboard.press('ArrowUp');
		await expect(handle).toHaveAttribute('aria-expanded', 'true');
		await sheet.locator(`[data-in-view-row="${BAY_ROW}"]`).click();
		await expect(page.getByRole('dialog')).toContainText(
			'Tomales Bay (area) · matched in the headline'
		);
	});
});
