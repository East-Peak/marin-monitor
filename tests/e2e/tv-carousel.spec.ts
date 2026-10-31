import { readFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';

/**
 * TV Mode E2E Tests
 *
 * Navigation is by state, never by time: the TV is paused once its pager has
 * mounted, each test goes to its screen by the pager dot's stable
 * data-screen-id and waits for that dot to be current, then waits for the
 * screen's own content.
 *
 * Key design decisions:
 * - Assert on H2 headings (via getByRole) to avoid false matches
 *   in the always-visible chyron ticker at the bottom.
 * - Use .first() on all assertion locators to prevent strict mode errors
 *   when multiple elements match (e.g., temperature appears in header + sidebar).
 * - Generous timeouts since data loads asynchronously from multiple APIs.
 *
 * Run: npx playwright test tests/e2e/tv-carousel.spec.ts
 * Requires: npm run build && npm run preview (or dev server)
 */

const TV_VIEWPORT = { width: 1920, height: 1080 };

// Chyron is fixed at the bottom — content must not render behind it
const CHYRON_HEIGHT = 45;
const USABLE_CONTENT_BOTTOM = TV_VIEWPORT.height - CHYRON_HEIGHT;

/**
 * Open the TV and pause it. The page is client-only (ssr = false), so the pager
 * exists once the wallboard has mounted; paused, the 12–22 s rotation can't move
 * a test off its screen while data loads under load.
 */
/** The Cost screens render once all eight index reads land, together (loadIndexData). */
const INDEX_READS = [
	'composite',
	'cappuccino',
	'grocery-basket',
	'wine-index',
	'fitness',
	'school-tuition',
	'driveway',
	'gas-prices'
].map((name) => `/api/data/${name}`);
/** Structural's housing is read after them. */
const HOUSING_READ = '/api/data/housing';
/** This test's first answer to each read, watched from before the TV loads. */
let reads = new Map<string, Promise<unknown>>();

async function openTv(page: Page) {
	reads = new Map(
		[...INDEX_READS, HOUSING_READ].map((path) => [
			path,
			// A test that never asks for a read must not fail when its page closes.
			page.waitForResponse((r) => new URL(r.url()).pathname === path).catch(() => null)
		])
	);
	await page.goto('/tv?probe'); // ?probe exposes the map as window.__tvProbeMap
	await expect(page.locator('[data-screen-id]').first()).toBeVisible();
	await page.keyboard.press(' ');
	await expect(page.getByText('PAUSED', { exact: true })).toBeVisible();
}

const currentScreen = (page: Page) =>
	page.locator('[data-screen-id][aria-current="true"]').getAttribute('data-screen-id');

/** Go to a screen by its pager dot, wait until it is current, then for the reads it draws. */
async function showScreen(page: Page, id: string, needs: readonly string[] = []) {
	const dot = page.locator(`[data-screen-id="${id}"]`);
	await dot.click();
	await expect(dot).toHaveAttribute('aria-current', 'true');
	await Promise.all(needs.map((path) => reads.get(path)));
}

/** Check that no .tv-screen content overflows below the chyron */
async function assertFitsViewport(page: Page) {
	const content = page.locator('.tv-screen');
	if ((await content.count()) > 0) {
		// A screen slides in 8 px over 0.5 s; measure where it comes to rest.
		await content.first().evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
		const box = await content.first().boundingBox();
		if (box) {
			expect(box.y + box.height).toBeLessThanOrEqual(USABLE_CONTENT_BOTTOM + 2);
		}
	}
}

// ─── Basic Carousel Tests ──────────────────────────────────────────────

test.describe('TV Carousel', () => {
	test.use({ viewport: TV_VIEWPORT });
	test.setTimeout(60_000);

	test.beforeEach(async ({ page }) => {
		await openTv(page);
	});

	test('loads and shows header with temperature and clock', async ({ page }) => {
		await expect(page.locator('text=MARIN MONITOR')).toBeVisible();
		// Temperature may appear in multiple places — use .first()
		await expect(page.locator('text=/\\d+°F/').first()).toBeVisible({ timeout: 15000 });
	});

	test('chyron ticker is visible at bottom', async ({ page }) => {
		const chyron = page.locator('.chyron-track, [class*="chyron"]').first();
		await expect(chyron).toBeVisible({ timeout: 10000 });
	});

	test('can navigate screens with arrow keys', async ({ page }) => {
		// First screen: county map with sidebar heading "Marin County"
		await expect(page.getByRole('heading', { name: 'Marin County' })).toBeVisible({
			timeout: 10000
		});

		await page.keyboard.press('ArrowRight');
		await expect.poll(() => currentScreen(page)).toBe('map-south');
	});

	test('map screens render with sidebar', async ({ page }) => {
		await expect(page.getByRole('heading', { name: 'Marin County' })).toBeVisible({
			timeout: 10000
		});
		await expect(page.locator('text=/\\d+°F/').first()).toBeVisible({ timeout: 10000 });
	});
});

// ─── Screen Content Tests ──────────────────────────────────────────────

test.describe('TV Screen Content', () => {
	test.use({ viewport: TV_VIEWPORT });
	test.setTimeout(90_000);

	test.beforeEach(async ({ page }) => {
		await openTv(page);
	});

	test('Cost of Being Marin hero fits viewport', async ({ page }) => {
		await showScreen(page, 'composite', INDEX_READS);
		await expect(page.getByRole('heading', { name: 'Cost of Being Marin' })).toBeVisible({
			timeout: 10000
		});
		await page.screenshot({ path: 'tests/e2e/screenshots/tv-composite.png' });

		// The Marin Number dollar amount (e.g., $22,155)
		await expect(page.locator('text=/\\$\\d{2},\\d{3}/').first()).toBeVisible({ timeout: 10000 });

		await assertFitsViewport(page);
	});

	test('Daily Life card shows real data', async ({ page }) => {
		await showScreen(page, 'daily-life', INDEX_READS);
		await expect(page.getByRole('heading', { name: 'Daily Life' })).toBeVisible({ timeout: 10000 });
		await page.screenshot({ path: 'tests/e2e/screenshots/tv-daily-life.png' });

		// Section headers — source HTML is mixed case, CSS renders uppercase
		// text= does case-insensitive substring matching
		await expect(page.locator('text=Cappuccino').first()).toBeVisible({ timeout: 10000 });
		await expect(page.locator('text=Grocery Basket').first()).toBeVisible({ timeout: 10000 });

		// Should show actual prices
		await expect(page.locator('text=/\\$\\d+\\.\\d{2}/').first()).toBeVisible();
	});

	test('Lifestyle card shows wine and fitness data', async ({ page }) => {
		await showScreen(page, 'lifestyle', INDEX_READS);
		await expect(page.getByRole('heading', { name: 'Lifestyle' })).toBeVisible({ timeout: 10000 });
		await page.screenshot({ path: 'tests/e2e/screenshots/tv-lifestyle.png' });

		await expect(page.locator('text=Wine Index').first()).toBeVisible({ timeout: 10000 });
		await expect(page.locator('text=Fitness Drop-In').first()).toBeVisible({ timeout: 10000 });
	});

	test('Structural Marin card shows tuition and housing', async ({ page }) => {
		await showScreen(page, 'structural', [...INDEX_READS, HOUSING_READ]);
		await expect(page.getByRole('heading', { name: 'Structural Marin' })).toBeVisible({
			timeout: 10000
		});
		await page.screenshot({ path: 'tests/e2e/screenshots/tv-structural.png' });

		await expect(page.locator('text=Private School Tuition').first()).toBeVisible({
			timeout: 10000
		});
		await expect(page.locator('text=Housing Market').first()).toBeVisible({ timeout: 10000 });

		// Housing should show real data: median price like $1.36M
		await expect(page.locator('text=/\\$\\d+\\.\\d+M/').first()).toBeVisible({ timeout: 10000 });
	});

	test('Driveway card shows vehicle data', async ({ page }) => {
		// The heading only renders once the data loads, so wait for it on the screen itself.
		await showScreen(page, 'driveway', INDEX_READS);
		await expect(page.getByRole('heading', { name: 'The Marin Driveway' })).toBeVisible({
			timeout: 10000
		});
		await page.screenshot({ path: 'tests/e2e/screenshots/tv-driveway.png' });

		await expect(page.locator('text=Registration Stats').first()).toBeVisible({ timeout: 10000 });
		// Should show total vehicle count like 210,586
		await expect(page.locator('text=/\\d{3},\\d{3}/').first()).toBeVisible({ timeout: 10000 });
	});

	test('Conditions card shows weather, AQI, and tides', async ({ page }) => {
		await showScreen(page, 'conditions');
		await expect(page.getByRole('heading', { name: 'Conditions' })).toBeVisible({ timeout: 10000 });
		await page.screenshot({ path: 'tests/e2e/screenshots/tv-conditions.png' });

		// Air Quality subsection should be visible
		await expect(page.locator('text=Air Quality').first()).toBeVisible({ timeout: 10000 });

		// Should show actual temperature, not dashes
		await expect(page.locator('text=/\\d+°/').first()).toBeVisible({ timeout: 10000 });
	});

	test('Outdoors card shows dirt tracker and streams', async ({ page }) => {
		await showScreen(page, 'outdoors');
		await expect(page.getByRole('heading', { name: 'Outdoors', exact: true })).toBeVisible({
			timeout: 10000
		});
		await page.screenshot({ path: 'tests/e2e/screenshots/tv-outdoors.png' });

		await expect(page.locator('text=Hero Dirt Tracker').first()).toBeVisible({ timeout: 10000 });
		// "Stream Gauges" appears in both the map sidebar context and outdoors card
		// Use the outdoors-specific heading which uses uppercase CSS class
		await expect(page.getByText('Stream Gauges', { exact: true }).first()).toBeVisible({
			timeout: 10000
		});
	});

	test('Camera cluster screens show images', async ({ page }) => {
		await showScreen(page, 'cameras-tam-coast');
		// Should have camera images with cache-busting timestamps
		await expect(page.locator('img[src*="?t="]').first()).toBeAttached({ timeout: 10000 });
		await page.screenshot({ path: 'tests/e2e/screenshots/tv-cameras.png' });
	});
});

// ─── 311 Photo Wall ─────────────────────────────────────────────────────

/** One open Fix It issue in San Rafael from an hour ago, with or without a photo. */
const A_REAL_JPEG = readFileSync('src/lib/dashboard/__fixtures__/caltrans-frame.jpg');

async function fixIt311(page: Page, withPhoto: boolean, photo: 'loads' | 'broken' = 'loads') {
	const at = new Date(Date.now() - 3_600_000).toISOString();
	const issue = {
		id: 901,
		status: 'Open',
		summary: 'Pothole',
		description: 'Deep pothole',
		lat: 37.9735,
		lng: -122.5311,
		address: '1400 Fifth Ave, San Rafael, CA',
		created_at: at,
		updated_at: at,
		html_url: 'https://seeclickfix.com/issues/901',
		...(withPhoto && {
			media: { image_full: 'https://example.com/901.jpg', image_square_100x100: null }
		})
	};
	await page.route('**/api/data/311', (route) =>
		route.fulfill({ json: { lastUpdated: at, count: 1, issues: [issue] } })
	);
	await page.route('**/api/data/311-image?**', (route) =>
		photo === 'broken'
			? route.fulfill({ status: 404 })
			: route.fulfill({ contentType: 'image/jpeg', body: A_REAL_JPEG })
	);
}

test.describe('TV 311 Photo Wall', () => {
	test.use({ viewport: TV_VIEWPORT });

	const openWall = async (page: Page) => {
		await openTv(page);
		// The county slide counts the read once it has landed; the dot only skips before that.
		await expect(page.getByText('1 this week')).toBeVisible();
		await showScreen(page, '311-photos');
		await expect(page.locator('text=Fix It Marin').first()).toBeVisible();
	};

	test('with a photo, its dot opens the wall and the photo is decoded and visible', async ({
		page
	}) => {
		await fixIt311(page, true);
		await openWall(page);
		const photo = page.locator('.tv-screen img[src*="311-image"]');
		await expect(photo).toBeVisible();
		await expect
			.poll(() => photo.evaluate((i) => (i as HTMLImageElement).naturalWidth))
			.toBeGreaterThan(0);
		await page.screenshot({ path: 'tests/e2e/screenshots/tv-311-photos.png' });
	});

	test('a photo that fails to load falls back to its category card', async ({ page }) => {
		await fixIt311(page, true, 'broken');
		await openWall(page);
		await expect(page.locator('.tv-screen img[src*="311-image"]')).toHaveCount(0);
		await expect(page.locator('.tv-screen').getByText('Pothole').first()).toBeVisible();
	});

	test('with no photo, its dot skips to the next screen', async ({ page }) => {
		await fixIt311(page, false);
		await openTv(page);
		await expect(page.getByText('1 this week')).toBeVisible();
		await page.locator('[data-screen-id="311-photos"]').click();
		await expect(page.locator('[data-screen-id="community"]')).toHaveAttribute(
			'aria-current',
			'true'
		);
	});
});

// ─── Content Density Tests ──────────────────────────────────────────────

test.describe('TV Screen Content Density', () => {
	test.use({ viewport: TV_VIEWPORT });
	test.setTimeout(90_000);

	test.beforeEach(async ({ page }) => {
		await openTv(page);
	});

	test('Daily Life shows individual shop/station data', async ({ page }) => {
		await showScreen(page, 'daily-life', INDEX_READS);
		await expect(page.getByRole('heading', { name: 'Daily Life' })).toBeVisible({ timeout: 10000 });

		// At least one density indicator: individual shop names, or the gas CHEAPEST section
		await expect(
			page.locator('text=/Coffee Roasters|Equator|Philz/').or(page.locator('text=CHEAPEST')).first()
		).toBeVisible({ timeout: 10000 });
	});

	test('Structural shows individual schools and housing metrics', async ({ page }) => {
		await showScreen(page, 'structural', [...INDEX_READS, HOUSING_READ]);
		await expect(page.getByRole('heading', { name: 'Structural Marin' })).toBeVisible({
			timeout: 10000
		});

		// Should show actual school names
		const schoolNames = page.locator('text=/San Domenico|Marin Academy|Branson/');
		await expect(schoolNames.first()).toBeVisible({ timeout: 10000 });

		// Housing metrics: $/sq ft, Active Listings, Days on Market, Homes Sold
		const housingMetrics = page.locator('text=/sq ft|Active Listings|Days on Market|Homes Sold/i');
		await expect(housingMetrics.first()).toBeAttached({ timeout: 10000 });
	});
});
