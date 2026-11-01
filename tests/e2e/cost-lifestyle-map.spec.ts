import { expect, test, type Locator, type Page } from '@playwright/test';
import { auditTap, openPhone, preparePhone } from './fixtures/phone-audit';
import { stub } from './fixtures/v2-height';

/**
 * COST2: the month as a treemap, on the seeded server (see cost-lifestyle.spec.ts): the card at
 * desktop widths, the page at every width. The seed: Larkspur complete; Ross incomplete, its wine
 * unread, Business at $0 with its lines read. The TEXT1 visuals check inventories only SVG, canvas
 * and images, so the map and the bars it leaves alone are asserted here, directly.
 */
test.skip(({ baseURL }) => baseURL?.startsWith('https://') ?? false, 'seeded');

const tiles = (scope: Page | Locator) => scope.locator('a[data-tile]');

async function openCard(page: Page, town = 'larkspur') {
	await stub(page);
	await page.route('**/api/data/lifestyle', (r) => r.continue());
	await page.goto('/?probe');
	await expect(page.locator('[data-layout="v2"][data-hydrated="true"]')).toBeVisible();
	const c = page.locator('#cost [data-card="lifestyle"]');
	await expect(c.locator('[data-town]')).toHaveCount(3);
	await c.locator(`[data-town="${town}"]`).click();
	await expect(c).toHaveAttribute('data-household', town);
	return c;
}

/** On screen, unobscured, focused and marked. */
async function landed(page: Page, section: string) {
	const heading = page.locator(`h2[id="section-${section}"]`);
	await expect(heading).toBeFocused();
	await expect(heading).toHaveClass(/arrived/);
	await expect
		.poll(() =>
			heading.evaluate((el) => {
				const r = el.getBoundingClientRect();
				const hit = document.elementFromPoint(r.left + 40, r.top + r.height / 2);
				return r.top >= 0 && r.bottom <= window.innerHeight && !!hit && el.contains(hit);
			})
		)
		.toBe(true);
}

/** Tiles whose label doesn't fit their box: there must be none. */
const clipped = (scope: Locator) =>
	scope.evaluateAll((els) =>
		els
			.filter((a) => a.childElementCount > 0)
			.filter((a) => a.scrollWidth > a.clientWidth + 1 || a.scrollHeight > a.clientHeight + 1)
			.map((a) => a.getAttribute('data-tile'))
	);

for (const width of [1440, 1024]) {
	test.describe(`the card at ${width}`, () => {
		test.use({ viewport: { width, height: 900 } });

		test('the map replaces the bar and ends with the receipt', async ({ page }) => {
			for (const town of ['larkspur', 'mill-valley', 'ross']) {
				const c = await openCard(page, town);
				await expect(c.locator('[data-section-stack]')).toBeHidden();
				const map = c.locator('[data-month-map]');
				await expect(map).toBeVisible();
				await expect(tiles(c).first()).toHaveAttribute('data-label', /.*/);
				// The month and the map share the left column; the receipt has the right to itself.
				const [hero, map1, side] = await Promise.all(
					[c.locator('[data-burn]'), map, c.locator('.receipt-side')].map((l) => l.boundingBox())
				);
				expect(Math.abs(hero!.x - map1!.x)).toBeLessThan(2);
				expect(side!.x).toBeGreaterThan(map1!.x + map1!.width);
				expect(side!.y).toBeLessThanOrEqual(hero!.y + 40);
				const [mapBox, receipt] = [
					await map.boundingBox(),
					await c.locator('[data-receipt-total]').boundingBox()
				];
				expect(Math.abs(mapBox!.y + mapBox!.height - (receipt!.y + receipt!.height))).toBeLessThan(
					8
				);
			}
		});

		test('every tile is a link with its words, clears 24×24, and nothing is cut', async ({
			page
		}) => {
			const c = await openCard(page);
			const all = await tiles(c).all();
			expect(all.length).toBeGreaterThan(5);
			for (const t of all) {
				const box = (await t.boundingBox())!;
				expect(box.width).toBeGreaterThanOrEqual(24);
				expect(box.height).toBeGreaterThanOrEqual(24);
				await expect(t).toHaveAttribute('href', /^\/cost\/larkspur#section-[a-z]+$/);
				await expect(t).toHaveAttribute(
					'aria-label',
					/^(?:[A-Z][a-z]+|The rest) · \$[\d,]+ a month · (?:<1|\d+)% of spending/
				);
			}
			expect(await clipped(tiles(c))).toEqual([]);
		});

		test('Tab goes by size; focus and hover show the readout', async ({ page }) => {
			const c = await openCard(page);
			const all = tiles(c);
			const amount = async (t: Locator) =>
				Number(/\$([\d,]+)/.exec((await t.getAttribute('aria-label'))!)![1].replaceAll(',', ''));
			const first = all.first();
			await first.focus();
			const readout = c.locator('[data-map-readout]');
			await expect(readout).toHaveText(/^Housing · \$[\d,]+ a month · \d+% of spending\s*$/);
			await page.keyboard.press('Tab');
			await expect(all.nth(1)).toBeFocused();
			expect(await amount(all.nth(1))).toBeLessThan(await amount(first));
			await page.keyboard.press('Shift+Tab');
			await first.blur();
			await expect(readout).toHaveCount(0);
			await all.nth(2).hover();
			await expect(readout).toBeVisible();
			await expect(readout).toContainText('of spending');
			const [r, card] = [await readout.boundingBox(), await c.boundingBox()];
			expect(r!.x).toBeGreaterThanOrEqual(card!.x);
			expect(r!.x + r!.width).toBeLessThanOrEqual(card!.x + card!.width);
		});

		test('the readout follows the keyboard past a parked pointer', async ({ page }) => {
			const c = await openCard(page);
			const all = tiles(c);
			await all.nth(2).hover();
			await all.first().focus();
			await page.keyboard.press('Tab');
			await expect(all.nth(1)).toBeFocused();
			const name = (await all.nth(1).getAttribute('aria-label'))!.split(' · ')[0];
			await expect(c.locator('[data-map-readout]')).toContainText(name);
		});

		test('click and Enter land, by client nav, back, forward and direct URL', async ({ page }) => {
			const c = await openCard(page);
			await tiles(c).first().click();
			await expect(page).toHaveURL(/\/cost\/larkspur#section-housing$/);
			await landed(page, 'housing');
			await page.goBack();
			await expect(page.locator('[data-layout="v2"]')).toBeVisible();
			await page.goForward();
			await landed(page, 'housing');
			await page.goBack();
			const again = page.locator('#cost [data-card="lifestyle"]');
			await again.locator('[data-town="larkspur"]').click();
			await tiles(again).nth(1).focus();
			await page.keyboard.press('Enter');
			await expect(page).toHaveURL(/#section-business$/);
			await landed(page, 'business');
			await page.goto('about:blank');
			await page.goto('/cost/larkspur#section-kids');
			await landed(page, 'kids');
			await page.goto('about:blank');
			await page.goto('/cost/larkspur#section-nope');
			await expect(page.locator('h1')).toBeVisible();
			await expect(page.locator('h2.arrived')).toHaveCount(0);
		});

		test('so far: the partial section and the caption say it', async ({ page }) => {
			const c = await openCard(page, 'ross');
			await expect(c.locator('[data-map-caption]')).toHaveText('Spending so far.');
			await expect(c.locator('a[data-tile="food"]')).toHaveAttribute('aria-label', /so far/);
			await expect(c.locator('a[data-tile="business"]')).toHaveCount(0);
		});
	});
}

test.describe('the page', () => {
	test.use({ viewport: { width: 1440, height: 900 } });

	test('the map heads the budget; a tile lands, and lands again', async ({ page }) => {
		await page.goto('/cost/larkspur');
		const budget = page.locator('section.budget');
		await expect(budget.locator('> :first-child [data-month-map]')).toBeVisible();
		await expect(tiles(budget).first()).toHaveAttribute('data-label', /.+/);
		for (const box of await tiles(budget).evaluateAll((els) =>
			els.map((a) => a.getBoundingClientRect().toJSON())
		)) {
			expect(box.width).toBeGreaterThanOrEqual(44);
			expect(box.height).toBeGreaterThanOrEqual(44);
		}
		const kids = budget.locator('a[data-tile="kids"]');
		await kids.click();
		await landed(page, 'kids');
		// The same fragment again is no navigation, and still lands.
		await page.evaluate(() => window.scrollTo(0, 0));
		await kids.click();
		await landed(page, 'kids');
	});

	test('a label’s ink reads on its tile, in both themes', async ({ page }) => {
		await page.goto('/cost/larkspur');
		await expect(tiles(page).first()).toHaveAttribute('data-label', /.+/);
		for (const theme of ['dark', 'light']) {
			await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
			const low = await tiles(page).evaluateAll((els) => {
				const rgb = (c: string) =>
					c
						.match(/[\d.]+/g)!
						.slice(0, 3)
						.map(Number);
				const lum = (c: number[]) => {
					const [r, g, b] = c
						.map((v) => v / 255)
						.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
					return 0.2126 * r + 0.7152 * g + 0.0722 * b;
				};
				const pageBg = rgb(
					getComputedStyle(document.querySelector('[data-layout="cost"]')!).backgroundColor
				);
				return els.flatMap((a) => {
					const s = getComputedStyle(a);
					const bg = s.backgroundImage !== 'none' ? pageBg : rgb(s.backgroundColor);
					const [hi, lo] = [lum(rgb(s.color)), lum(bg)].sort((x, z) => z - x);
					const ratio = (hi + 0.05) / (lo + 0.05);
					return ratio < 4.5 ? [`${a.getAttribute('data-tile')}: ${ratio.toFixed(2)}`] : [];
				});
			});
			expect(low, theme).toEqual([]);
		}
	});

	test('so far on the page; a section at $0 has no tile', async ({ page }) => {
		await page.goto('/cost/ross');
		await expect(page.locator('a[data-tile="business"]')).toHaveCount(0);
		await expect(page.locator('[data-map-caption]')).toHaveText('Spending so far.');
	});
});

test.describe('the bars COST2 leaves alone', () => {
	test.use({ viewport: { width: 900, height: 900 } });

	test('the tablet card keeps its bar and has no map', async ({ page }) => {
		const c = await openCard(page);
		await expect(c.locator('[data-section-stack]')).toBeVisible();
		await expect(c.locator('[data-month-map]')).toBeHidden();
	});
});

test.describe('@phone the month map', () => {
	test('the card has no map; the page has one; a tap follows its link', async ({ page }, info) => {
		await preparePhone(page);
		await stub(page);
		await page.route('**/api/data/lifestyle', (r) => r.continue());
		await page.goto('/?probe');
		await expect(page.locator('[data-layout="v2"][data-hydrated="true"]')).toBeVisible();
		await page.locator('[data-section-toggle="cost"]').click();
		const c = page.locator('#cost [data-card="lifestyle"]');
		await expect(c.locator('[data-burn]')).toBeVisible();
		await expect(c.locator('[data-month-map]')).toBeHidden();

		await openPhone(page, '/cost/larkspur', page.locator('section.budget details'));
		const map = page.locator('section.budget [data-month-map]');
		await expect(map).toBeVisible();
		await expect(tiles(map).first()).toHaveAttribute('data-label', /.+/);
		expect(await clipped(tiles(map))).toEqual([]);
		const failures = await auditTap(page, info, {
			page: '/cost/larkspur',
			state: 'default',
			control: 'map tile: kids',
			target: map.locator('a[data-tile="kids"]'),
			outcome: async () => {
				await expect(page).toHaveURL(/#section-kids$/, { timeout: 3_000 });
				await landed(page, 'kids');
			}
		});
		expect(failures).toEqual([]);
	});
});
