import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { roleFontPx } from '../../src/lib/dashboard/type-roles';
import { phoneHeight, stub } from './fixtures/v2-height';

/**
 * The Lifestyle Index's display (LIFE2), on its own preview with the flag on and the engine-written
 * seed (src/lib/server/lifestyle/fixture.test.ts): Larkspur complete, Mill Valley with stale
 * lines, Ross incomplete (its wine could not be read). Every number is the seed's own.
 */
test.skip(({ baseURL }) => baseURL?.startsWith('https://') ?? false, 'seeded');

interface SeedBudget {
	town: string;
	breakEven: { gross: number } | null;
}
const seed = JSON.parse(readFileSync('tests/e2e/fixtures/lifestyle-index.json', 'utf8')) as {
	current: { budgets: SeedBudget[] };
};
const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const breakEven = (id: string) =>
	usd(seed.current.budgets.find((b) => b.town === id)!.breakEven!.gross);
const FICTION = 'fictional household · modelled spending';

/** Every other read fails fast; the Lifestyle Index is the seeded server's own. */
async function stubAllButLifestyle(page: Page) {
	await stub(page);
	await page.route('**/api/data/lifestyle', (r) => r.continue()); // later routes win
}

async function card(page: Page, phone: boolean) {
	await stubAllButLifestyle(page);
	await page.goto('/');
	await expect(page.locator('[data-layout="v2"][data-hydrated="true"]')).toBeVisible();
	if (phone) await page.locator('[data-section-toggle="cost"]').click();
	const c = page.locator('#cost [data-card="lifestyle"]');
	await expect(c.locator('[data-town]')).toHaveCount(3);
	return c;
}

for (const [label, viewport] of [
	['1440', { width: 1440, height: 900 }],
	['390', { width: 390, height: 844 }]
] as const) {
	test.describe(`at ${label}`, () => {
		test.use({ viewport });
		const phone = viewport.width < 768;

		test('the Cost card: picker, break-even, an incomplete household, the fiction label', async ({
			page
		}) => {
			const c = await card(page, phone);
			await expect(c.locator('[data-fiction]')).toHaveText(FICTION);
			// The old composite and its Marin Number are gone under the flag.
			await expect(page.locator('[data-card="composite"], [data-card="marin-number"]')).toHaveCount(
				0
			);

			await c.locator('[data-town="larkspur"]').click();
			await expect(c.locator('[data-town="larkspur"]')).toHaveAttribute('aria-pressed', 'true');
			await expect(c.locator('[data-break-even]')).toContainText(breakEven('larkspur'));
			// The break-even is the card's headline, not body text; its "/yr" stays small.
			const be = c.locator('[data-break-even]');
			await expect(be).toHaveAttribute('data-text-role', 'headline');
			await expect(be).toHaveCSS('font-size', `${roleFontPx('headline', viewport.width)}px`);
			await expect(be.locator('.per')).toHaveCSS(
				'font-size',
				`${roleFontPx('meta', viewport.width)}px`
			);
			await expect(c.locator('[data-line]').first()).toContainText('Mortgage');
			await expect(c.locator('[data-line]').first().locator('[data-classes]')).toHaveAttribute(
				'data-classes',
				'cited persona'
			);

			// No run in the seed priced every household on in-date reads: never a green dot.
			const st = c.locator('[data-card-source] [data-source-state]');
			await expect(st).not.toHaveClass(/\bok\b/);
			await expect(st).toContainText('no complete run on in-date reads yet');

			await c.locator('[data-town="mill-valley"]').click();
			await expect(c.locator('[data-break-even]')).toContainText(breakEven('millvalley'));
			await expect(c.locator('[data-card-source]')).toContainText('2 lines read stale');

			await c.locator('[data-town="ross"]').click();
			await expect(c.locator('[data-incomplete]')).toHaveText('incomplete');
			await expect(c.locator('[data-break-even]')).toHaveCount(0);
			await expect(c).toContainText('no break-even while Wine can’t be read');

			await c.locator('[data-town="larkspur"]').click();
			await c.getByRole('link', { name: 'The whole budget →' }).click();
			await expect(page).toHaveURL(/\/cost\/larkspur$/);
		});

		test('the household page: break-even, a line’s input classes and sources', async ({ page }) => {
			await page.goto('/cost/larkspur');
			await expect(page.locator('[data-fiction]')).toHaveText(FICTION);
			await expect(page.locator('h1')).toHaveText('The Larkspur strivers');
			await expect(page.locator('[data-break-even]')).toContainText(breakEven('larkspur'));
			const pi = page.locator('details[data-line="larkspur.home.pi"]');
			await expect(pi.locator('summary [data-classes]')).toHaveAttribute(
				'data-classes',
				'cited persona'
			);
			await pi.locator('summary').click();
			const price = pi.locator('[data-input="price"]');
			await expect(price).toHaveAttribute('data-class', 'cited');
			await expect(price).toContainText('2024 Larkspur SFR median · 2,501,250');
			await expect(price.getByRole('link')).toHaveAttribute(
				'href',
				/^https:\/\/redfin-public-data/
			);
			await expect(price).toContainText('checked');
			// The market tracker carries its own provenance and is never called today’s.
			const tracker = page.locator('[data-market-tracker]');
			await expect(tracker.locator('[data-classes]')).toHaveAttribute('data-classes', 'cited');
			await expect(tracker.getByRole('link')).toHaveAttribute('href', /^https:\/\//);
			await expect(tracker).toContainText('checked');
			await expect(tracker).not.toContainText('Today');
			const rate = pi.locator('[data-input="ratePct"]');
			await expect(rate).toHaveAttribute('data-class', 'persona');
			// A live input says when its source saw it.
			const gas = page.locator('details[data-line="larkspur.car.suv.fuel"]');
			await gas.locator('summary').click();
			await expect(gas.locator('[data-class="live"]').first()).toContainText('read Oct');
			// The page fits the phone: no sideways scroll.
			const overflow = await page.evaluate(
				() => document.documentElement.scrollWidth - window.innerWidth
			);
			expect(overflow).toBeLessThanOrEqual(0);
		});

		test('stale reads stale, and an incomplete budget hides its break-even', async ({ page }) => {
			await page.goto('/cost/mill-valley');
			const garbage = page.locator('details[data-line="millvalley.util.garbage"]');
			await expect(garbage).toHaveAttribute('data-availability', 'stale');
			await expect(garbage.locator('summary')).toContainText('stale');
			await garbage.locator('summary').click();
			await expect(garbage.locator('[data-input="cart"]')).toContainText('stale: past 2026-06-30');
			// No run succeeded in the seed: the whole budget says it may be out of date.
			await expect(page.locator('[data-stale-budget]')).toBeVisible();

			await page.goto('/cost/ross');
			await expect(page.locator('[data-fiction]')).toHaveText(FICTION);
			await expect(page.locator('[data-incomplete]')).toHaveText('incomplete');
			await expect(page.locator('[data-break-even]')).toHaveCount(0);
			await expect(page.locator('main')).toContainText(
				'No break-even while these can’t be read: Wine'
			);
			await expect(page.locator('details[data-line="ross.food.wine"]')).toHaveAttribute(
				'data-availability',
				'unavailable'
			);
		});
	});
}

test('a town with no household is a 404', async ({ page }) => {
	expect((await page.goto('/cost/tiburon'))?.status()).toBe(404);
});

test.describe('the TV', () => {
	test.use({ viewport: { width: 1920, height: 1080 } });
	test.setTimeout(60_000);

	test('the Cost hero is the household of the day, fiction-labelled, not the composite', async ({
		page
	}) => {
		await page.route(/\/api\/data\/(?!lifestyle)/, (r) =>
			r.fulfill({ status: 503, body: 'stubbed' })
		);
		const composite = page
			.waitForRequest('**/api/data/composite', { timeout: 5_000 })
			.catch(() => null);
		await page.goto('/tv?probe');
		await expect(page.locator('[data-screen-id]').first()).toBeVisible();
		await page.keyboard.press(' ');
		const dot = page.locator('[data-screen-id="composite"]');
		await dot.click();
		await expect(dot).toHaveAttribute('aria-current', 'true');
		const hero = page.locator('[data-tv-lifestyle]');
		await expect(hero).toBeVisible({ timeout: 20_000 });
		await expect(hero.locator('[data-fiction]')).toContainText(FICTION);
		await expect(hero.locator('[data-break-even], [data-burn]')).toBeVisible();
		// The seed has no successful run: the TV says its numbers may be out of date.
		await expect(hero.locator('[data-tv-stale]')).toContainText('may be out of date');
		expect(await composite).toBeNull();
	});
});

test.describe('phone 390×844, Cost populated', () => {
	test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

	test('[every section saved open] the populated Lifestyle card keeps §13.3’s limits (Decision 10)', async ({
		page
	}) => {
		await phoneHeight(page, 'every section saved open', {
			routes: async (p) => {
				await p.route('**/api/data/lifestyle', (r) => r.continue());
			},
			populated: async (p) => {
				const c = p.locator('#cost [data-card="lifestyle"]');
				await expect(c.locator('[data-break-even], [data-burn]')).toBeVisible();
				await expect(c.locator('[data-line]')).toHaveCount(3);
				await expect(c.locator('[data-fiction]')).toBeVisible();
				// Measured with the tallest household, not whichever the day's rotation shows.
				let tallest = { town: '', height: 0 };
				for (const b of await c.locator('[data-town]').all()) {
					await b.click();
					const height = (await c.boundingBox())!.height;
					if (height > tallest.height)
						tallest = { town: (await b.getAttribute('data-town'))!, height };
				}
				await c.locator(`[data-town="${tallest.town}"]`).click();
				console.log(
					`[lifestyle] tallest household ${tallest.town}: ${Math.round(tallest.height)} px`
				);
			}
		});
	});
});
