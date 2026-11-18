import { expect, test, type Page } from '@playwright/test';
import { SOURCES, reportingSnapshot } from './fixtures/v2-reporting';
import { stubRest } from './fixtures/v2-populated';
import { stubCams } from './fixtures/cams';

/**
 * The phone trims News & Civic (under 640 px): the wire shows its first 5 rows and Marin Lately
 * its first 3, each followed by a button for the rest. Tablet and desktop keep every row. The
 * choice is remembered with the section prefs (mm_sections_v2).
 */
const WIRE_ROWS = 12; // the wire's own cap (news-civic.ts)
const LATELY_ROWS = 6;

async function stub(page: Page) {
	await stubRest(page);
	const now = Date.now();
	const stories = Array.from({ length: 20 }, (_, i) => ({
		slug: `w${i}`,
		title: `Marin story number ${i + 1} on the county wire`,
		source: i % 2 ? SOURCES.ij : SOURCES.ptReyes,
		hoursAgo: i + 1
	}));
	const lately = Array.from({ length: LATELY_ROWS }, (_, i) => ({
		slug: `l${i}`,
		title: `Satire piece number ${i + 1}`,
		source: SOURCES.lately,
		hoursAgo: 24 * (i + 1)
	}));
	await page.route('**/api/news/snapshot', (r) =>
		r.fulfill({
			status: 200,
			contentType: 'application/json',
			body: reportingSnapshot(now, [...stories, ...lately])
		})
	);
	await stubCams(page);
}

async function open(page: Page) {
	await stub(page);
	await page.goto('/');
	await expect(page.locator('[data-layout="v2"][data-hydrated="true"]')).toBeVisible();
}
const wireRows = (page: Page) => page.locator('#news [data-wire-row]');
const latelyRows = (page: Page) => page.locator('[data-slot="lately"] li');
const wireMore = (page: Page) => page.locator('#news [data-more="wire"]');
const latelyMore = (page: Page) => page.locator('[data-slot="lately"] [data-more="lately"]');
const shown = (rows: ReturnType<typeof wireRows>) =>
	rows.evaluateAll((els) => els.filter((e) => e.getClientRects().length > 0).length);

test.describe('phone 390×844', () => {
	test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

	test('the wire shows 5 rows and a button naming the rest; the button opens them in place', async ({
		page
	}) => {
		await open(page);
		await page.locator('[data-section-toggle="news"]').click();
		await expect(wireRows(page)).toHaveCount(WIRE_ROWS);
		await expect.poll(() => shown(wireRows(page))).toBe(5);

		const button = wireMore(page);
		await expect(button).toBeVisible();
		await expect(button).toHaveText(`Show ${WIRE_ROWS - 5} more from the wire`);
		await expect(button).toHaveAttribute('aria-expanded', 'false');
		expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);

		// Hidden rows are truly hidden: not focusable and not read.
		const hiddenLink = wireRows(page).nth(5).locator('a');
		await expect(hiddenLink).toBeHidden();
		await expect(page.locator('#news').getByRole('link', { name: /number 12\b/ })).toHaveCount(0);

		await button.click();
		await expect(button).toHaveAttribute('aria-expanded', 'true');
		await expect.poll(() => shown(wireRows(page))).toBe(WIRE_ROWS);
		await expect(page.locator('#news').getByRole('link', { name: /number 12\b/ })).toHaveCount(1);
	});

	test('Marin Lately shows 3 items and a "Show 3 more" button', async ({ page }) => {
		await open(page);
		await page.locator('[data-section-toggle="news"]').click();
		await expect(latelyRows(page)).toHaveCount(LATELY_ROWS);
		await expect.poll(() => shown(latelyRows(page))).toBe(3);
		const button = latelyMore(page);
		await expect(button).toHaveText('Show 3 more');
		await expect(button).toHaveAttribute('aria-expanded', 'false');
		expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
		await expect(latelyRows(page).nth(3).locator('a')).toBeHidden();
		await button.click();
		await expect(button).toHaveAttribute('aria-expanded', 'true');
		await expect.poll(() => shown(latelyRows(page))).toBe(LATELY_ROWS);
	});

	test('trimming takes the phone page well under its all-open height', async ({ page }) => {
		await open(page);
		await page.locator('[data-section-toggle="news"]').click();
		await expect(wireMore(page)).toBeVisible();
		const height = () => page.evaluate(() => document.documentElement.scrollHeight);
		const trimmed = await height();
		await wireMore(page).click();
		await latelyMore(page).click();
		const everyRow = await height();
		console.log(`News open on 390×844: trimmed ${trimmed} px, every row ${everyRow} px`);
		// Seven wire rows and three Lately pieces, less the buttons: the mockup's ~770 px saving.
		expect(everyRow - trimmed).toBeGreaterThan(400);
	});

	test('the choice survives a reload, like a section opening', async ({ page }) => {
		await open(page);
		await page.locator('[data-section-toggle="news"]').click();
		await wireMore(page).click();
		await latelyMore(page).click();
		const saved = JSON.parse(
			(await page.evaluate(() => localStorage.getItem('mm_sections_v2'))) ?? '{}'
		);
		expect(saved.version).toBe(3);
		expect(saved.more).toEqual({ wire: true, lately: true });

		await page.reload();
		await expect(page.locator('[data-layout="v2"][data-hydrated="true"]')).toBeVisible();
		await expect(wireMore(page)).toHaveAttribute('aria-expanded', 'true');
		await expect.poll(() => shown(wireRows(page))).toBe(WIRE_ROWS);
		await expect.poll(() => shown(latelyRows(page))).toBe(LATELY_ROWS);
	});

	test('an older saved store (no "more") loads and starts trimmed', async ({ page }) => {
		await page.addInitScript(() =>
			localStorage.setItem(
				'mm_sections_v2',
				JSON.stringify({ version: 3, open: { news: true }, layers: {} })
			)
		);
		await open(page);
		await expect(wireMore(page)).toHaveAttribute('aria-expanded', 'false');
		await expect.poll(() => shown(wireRows(page))).toBe(5);
	});

	test('a short wire has no button', async ({ page }) => {
		await stubRest(page);
		const now = Date.now();
		await page.route('**/api/news/snapshot', (r) =>
			r.fulfill({
				status: 200,
				contentType: 'application/json',
				// Five headlines lead; the wire is what follows them: 5 more is exactly the limit.
				body: reportingSnapshot(
					now,
					Array.from({ length: 10 }, (_, i) => ({
						slug: `s${i}`,
						title: `Marin story number ${i + 1} on the county wire`,
						source: i % 2 ? SOURCES.ij : SOURCES.ptReyes,
						hoursAgo: i + 1
					}))
				)
			})
		);
		await stubCams(page);
		await page.goto('/');
		await expect(page.locator('[data-layout="v2"][data-hydrated="true"]')).toBeVisible();
		await page.locator('[data-section-toggle="news"]').click();
		await expect(wireRows(page)).toHaveCount(5);
		await expect(wireMore(page)).toHaveCount(0);
	});
});

for (const [name, width, height] of [
	['tablet 700', 700, 900],
	['desktop 1440', 1440, 1000]
] as const) {
	test(`${name}: every row shows and there is no button`, async ({ page }) => {
		await page.setViewportSize({ width, height });
		await open(page);
		if (width < 1024) await page.locator('[data-section-toggle="news"]').click();
		await expect(wireRows(page)).toHaveCount(WIRE_ROWS);
		await expect.poll(() => shown(wireRows(page))).toBe(WIRE_ROWS);
		await expect.poll(() => shown(latelyRows(page))).toBe(LATELY_ROWS);
		await expect(wireMore(page)).toBeHidden();
		await expect(latelyMore(page)).toBeHidden();
	});
}
