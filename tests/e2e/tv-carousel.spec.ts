import { test, expect, type Page, type Locator } from '@playwright/test';

/**
 * TV Mode E2E Tests
 *
 * Uses content-based navigation: instead of counting screen indices
 * (which break when screens are skipped), we advance through screens
 * until we find a unique content marker for the target screen.
 *
 * Key design decisions:
 * - Navigate using H2 headings (via getByRole) to avoid false matches
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
 * Navigate to a screen by advancing until a locator is visible.
 * Use precise locators (getByRole, getByTestId) to avoid matching
 * text in the chyron ticker which is always visible on every screen.
 */
async function navigateToScreen(page: Page, locator: Locator, maxAttempts = 30): Promise<boolean> {
	for (let i = 0; i < maxAttempts; i++) {
		const found = await locator.isVisible().catch(() => false);
		if (found) return true;
		await page.keyboard.press('ArrowRight');
		await page.waitForTimeout(700);
	}
	return false;
}

/** Check that no .tv-screen content overflows below the chyron */
async function assertFitsViewport(page: Page) {
	const content = page.locator('.tv-screen');
	if (await content.count() > 0) {
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
		await page.goto('/tv');
		await page.waitForTimeout(6000);
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
		await expect(page.getByRole('heading', { name: 'Marin County' })).toBeVisible({ timeout: 10000 });

		await page.keyboard.press('ArrowRight');
		await page.waitForTimeout(700);

		await page.screenshot({ path: 'tests/e2e/screenshots/tv-navigate.png' });
	});

	test('map screens render with sidebar', async ({ page }) => {
		await expect(page.getByRole('heading', { name: 'Marin County' })).toBeVisible({ timeout: 10000 });
		await expect(page.locator('text=/\\d+°F/').first()).toBeVisible({ timeout: 10000 });
	});
});

// ─── Screen Content Tests ──────────────────────────────────────────────

test.describe('TV Screen Content', () => {
	test.use({ viewport: TV_VIEWPORT });
	test.setTimeout(90_000);

	test.beforeEach(async ({ page }) => {
		await page.goto('/tv');
		await page.waitForTimeout(6000);
	});

	test('Cost of Being Marin hero fits viewport', async ({ page }) => {
		const marker = page.getByRole('heading', { name: 'Cost of Being Marin' });
		const found = await navigateToScreen(page, marker);
		expect(found).toBe(true);

		await page.waitForTimeout(1000);
		await page.screenshot({ path: 'tests/e2e/screenshots/tv-composite.png' });

		// The Marin Number dollar amount (e.g., $22,155)
		await expect(page.locator('text=/\\$\\d{2},\\d{3}/').first()).toBeVisible({ timeout: 10000 });

		await assertFitsViewport(page);
	});

	test('Daily Life card shows real data', async ({ page }) => {
		const marker = page.getByRole('heading', { name: 'Daily Life' });
		const found = await navigateToScreen(page, marker);
		expect(found).toBe(true);

		await page.waitForTimeout(1000);
		await page.screenshot({ path: 'tests/e2e/screenshots/tv-daily-life.png' });

		// Section headers — source HTML is mixed case, CSS renders uppercase
		// text= does case-insensitive substring matching
		await expect(page.locator('text=Cappuccino').first()).toBeVisible({ timeout: 10000 });
		await expect(page.locator('text=Grocery Basket').first()).toBeVisible({ timeout: 10000 });

		// Should show actual prices
		await expect(page.locator('text=/\\$\\d+\\.\\d{2}/').first()).toBeVisible();
	});

	test('Lifestyle card shows wine and fitness data', async ({ page }) => {
		const marker = page.getByRole('heading', { name: 'Lifestyle' });
		const found = await navigateToScreen(page, marker);
		expect(found).toBe(true);

		await page.waitForTimeout(1000);
		await page.screenshot({ path: 'tests/e2e/screenshots/tv-lifestyle.png' });

		await expect(page.locator('text=Wine Index').first()).toBeVisible({ timeout: 10000 });
		await expect(page.locator('text=Fitness Drop-In').first()).toBeVisible({ timeout: 10000 });
	});

	test('Structural Marin card shows tuition and housing', async ({ page }) => {
		const marker = page.getByRole('heading', { name: 'Structural Marin' });
		const found = await navigateToScreen(page, marker);
		expect(found).toBe(true);

		await page.waitForTimeout(1000);
		await page.screenshot({ path: 'tests/e2e/screenshots/tv-structural.png' });

		await expect(page.locator('text=Private School Tuition').first()).toBeVisible({ timeout: 10000 });
		await expect(page.locator('text=Housing Market').first()).toBeVisible({ timeout: 10000 });

		// Housing should show real data: median price like $1.36M
		await expect(page.locator('text=/\\$\\d+\\.\\d+M/').first()).toBeVisible({ timeout: 10000 });
	});

	test('Driveway card shows vehicle data', async ({ page }) => {
		const marker = page.getByRole('heading', { name: 'The Marin Driveway' });
		const found = await navigateToScreen(page, marker);
		expect(found).toBe(true);

		await page.waitForTimeout(1000);
		await page.screenshot({ path: 'tests/e2e/screenshots/tv-driveway.png' });

		await expect(page.locator('text=Registration Stats').first()).toBeVisible({ timeout: 10000 });
		// Should show total vehicle count like 210,586
		await expect(page.locator('text=/\\d{3},\\d{3}/').first()).toBeVisible({ timeout: 10000 });
	});

	test('311 Photo Wall shows photos or is skipped', async ({ page }) => {
		// 311 screen may be skipped if no photos available
		const marker = page.locator('text=Fix It Marin').first();
		const found = await navigateToScreen(page, marker);

		if (found) {
			await page.waitForTimeout(1000);
			await page.screenshot({ path: 'tests/e2e/screenshots/tv-311-photos.png' });
			await expect(page.locator('text=Fix It Marin').first()).toBeVisible({ timeout: 5000 });
		}
		// If not found, screen was skipped (no 311 photos available) — that's OK
	});

	test('Conditions card shows weather, AQI, and tides', async ({ page }) => {
		const marker = page.getByRole('heading', { name: 'Conditions' });
		const found = await navigateToScreen(page, marker);
		expect(found).toBe(true);

		await page.waitForTimeout(1000);
		await page.screenshot({ path: 'tests/e2e/screenshots/tv-conditions.png' });

		// Air Quality subsection should be visible
		await expect(page.locator('text=Air Quality').first()).toBeVisible({ timeout: 10000 });

		// Should show actual temperature, not dashes
		await expect(page.locator('text=/\\d+°/').first()).toBeVisible({ timeout: 10000 });
	});

	test('Outdoors card shows dirt tracker and streams', async ({ page }) => {
		const marker = page.getByRole('heading', { name: 'Outdoors', exact: true });
		const found = await navigateToScreen(page, marker);
		expect(found).toBe(true);

		await page.waitForTimeout(1000);
		await page.screenshot({ path: 'tests/e2e/screenshots/tv-outdoors.png' });

		await expect(page.locator('text=Hero Dirt Tracker').first()).toBeVisible({ timeout: 10000 });
		// "Stream Gauges" appears in both the map sidebar context and outdoors card
		// Use the outdoors-specific heading which uses uppercase CSS class
		await expect(page.getByText('Stream Gauges', { exact: true }).first()).toBeVisible({ timeout: 10000 });
	});

	test('Camera cluster screens show images', async ({ page }) => {
		// Camera screens have cluster labels as headings in the sidebar
		const marker = page.locator('text=/Tam & Coast|Central & 101|West & North/').first();
		const found = await navigateToScreen(page, marker);
		expect(found).toBe(true);

		await page.waitForTimeout(1500);
		await page.screenshot({ path: 'tests/e2e/screenshots/tv-cameras.png' });

		// Should have camera images with cache-busting timestamps
		const images = page.locator('img[src*="?t="]');
		const count = await images.count();
		expect(count).toBeGreaterThan(0);
	});
});

// ─── Content Density Tests ──────────────────────────────────────────────

test.describe('TV Screen Content Density', () => {
	test.use({ viewport: TV_VIEWPORT });
	test.setTimeout(90_000);

	test.beforeEach(async ({ page }) => {
		await page.goto('/tv');
		await page.waitForTimeout(6000);
	});

	test('Daily Life shows individual shop/station data', async ({ page }) => {
		const marker = page.getByRole('heading', { name: 'Daily Life' });
		const found = await navigateToScreen(page, marker);
		expect(found).toBe(true);

		await page.waitForTimeout(1000);

		// Should show individual shop names
		const shopNames = page.locator('text=/Coffee Roasters|Equator|Philz/');
		const hasShops = await shopNames.count() > 0;

		// Should show CHEAPEST / PRICIEST sections for gas
		const cheapest = page.locator('text=CHEAPEST');
		const hasCheapest = await cheapest.first().isVisible().catch(() => false);

		// At least one of these density indicators should be present
		expect(hasShops || hasCheapest).toBe(true);
	});

	test('Structural shows individual schools and housing metrics', async ({ page }) => {
		const marker = page.getByRole('heading', { name: 'Structural Marin' });
		const found = await navigateToScreen(page, marker);
		expect(found).toBe(true);

		await page.waitForTimeout(1000);

		// Should show actual school names
		const schoolNames = page.locator('text=/San Domenico|Marin Academy|Branson/');
		await expect(schoolNames.first()).toBeVisible({ timeout: 10000 });

		// Housing metrics: $/sq ft, Active Listings, Days on Market, Homes Sold
		const housingMetrics = page.locator('text=/sq ft|Active Listings|Days on Market|Homes Sold/i');
		const hasMetrics = await housingMetrics.count() > 0;
		expect(hasMetrics).toBe(true);
	});
});
