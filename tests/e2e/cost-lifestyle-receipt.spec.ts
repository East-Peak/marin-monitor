import { expect, test, type Locator, type Page } from '@playwright/test';
import { stub } from './fixtures/v2-height';

/**
 * COST1: the card's receipt and its landing on /cost/<town>, on the seeded server (see
 * cost-lifestyle.spec.ts). Each flow runs at 1440 here and, tagged `@phone`, on an iPhone 13
 * (WebKit) and a Pixel 7 (Chromium). The seed: Larkspur complete, Mill Valley's clean extras
 * stale, Ross incomplete (wine, not a signature line).
 */
test.skip(({ baseURL }) => baseURL?.startsWith('https://') ?? false, 'seeded');

const LINE = 'larkspur.kids.math';
const ANCHOR = '#line-larkspur-kids-math';

async function openCard(page: Page, phone: boolean, town = 'larkspur') {
	await stub(page);
	await page.route('**/api/data/lifestyle', (r) => r.continue());
	await page.goto('/?probe');
	await expect(page.locator('[data-layout="v2"][data-hydrated="true"]')).toBeVisible();
	if (phone) await page.locator('[data-section-toggle="cost"]').click();
	const c = page.locator('#cost [data-card="lifestyle"]');
	await expect(c.locator('[data-town]')).toHaveCount(3);
	await c.locator(`[data-town="${town}"]`).click();
	await expect(c).toHaveAttribute('data-household', town);
	return c;
}

/** Open, fully on screen, and focused on its summary. */
async function landed(page: Page, anchor: string) {
	const line = page.locator(
		`details[id="${await page.evaluate((a) => CSS.escape(a), anchor.slice(1))}"]`
	);
	await expect(line).toHaveAttribute('open', '');
	await expect(line.locator('summary')).toBeFocused();
	await expect
		.poll(() =>
			line.evaluate((el) => {
				const r = el.getBoundingClientRect();
				const hit = document.elementFromPoint(r.left + r.width / 2, r.top + 8);
				return r.top >= 0 && r.bottom <= window.innerHeight && !!hit && el.contains(hit);
			})
		)
		.toBe(true);
	await expect(line).toHaveClass(/arrived/);
}

const flows: [string, (page: Page, phone: boolean) => Promise<void>][] = [
	[
		'hero, break-even, highlight and the way in',
		async (page, phone) => {
			const c = await openCard(page, phone);
			await expect(c.locator('[data-burn]')).toHaveText(/^\$[\d,]+ a month$/);
			await expect(c.locator('[data-break-even]')).toHaveText(
				/^To break even: \$[\d,]+ a year before tax$/
			);
			await expect(c.locator('[data-card-highlight]')).toBeVisible();
			await expect(c.locator('[data-section-stack]')).toBeVisible({ visible: !phone });
			await expect(c.locator('[data-colour-exception="rank"]')).toHaveCount(0);
			await expect(page.locator('[data-colour-exception="rank"]')).toHaveCount(0);
			const all = c.locator('[data-see-all]');
			await expect(all).toHaveText('See all 40 lines →');
			await all.click();
			await expect(page).toHaveURL(/\/cost\/larkspur$/);
		}
	],
	[
		'a receipt row lands on its line, in the same tab, by click',
		async (page, phone) => {
			const c = await openCard(page, phone);
			await c.locator(`a[data-line="${LINE}"]`).click();
			await expect(page).toHaveURL(new RegExp(`/cost/larkspur${ANCHOR}$`));
			await landed(page, ANCHOR);
			expect(page.context().pages()).toHaveLength(1);
		}
	],
	[
		'by keyboard, back and forward, and the same fragment twice',
		async (page, phone) => {
			const c = await openCard(page, phone);
			const row = c.locator(`a[data-line="${LINE}"]`);
			await row.focus();
			await page.keyboard.press('Enter');
			await landed(page, ANCHOR);
			await page.goBack();
			await expect(page.locator('[data-layout="v2"]')).toBeVisible();
			await page.goForward();
			await landed(page, ANCHOR);
			// Closed and scrolled away, then the same fragment again from the card.
			await page.locator(`${ANCHOR} summary`).click();
			await page.goBack();
			await expect(page.locator('[data-layout="v2"]')).toBeVisible();
			if (
				phone &&
				(await page.locator('[data-section-toggle="cost"]').getAttribute('aria-expanded')) ===
					'false'
			)
				await page.locator('[data-section-toggle="cost"]').click();
			const card = page.locator('#cost [data-card="lifestyle"]');
			await card.locator('[data-town="larkspur"]').click();
			await card.locator(`a[data-line="${LINE}"]`).click();
			await landed(page, ANCHOR);
		}
	],
	[
		'a direct URL lands, a hash change on the page lands, and an unknown fragment does nothing',
		async (page) => {
			await page.goto(`/cost/larkspur${ANCHOR}`);
			await landed(page, ANCHOR);
			await page.evaluate(() => (location.hash = '#line-larkspur-biz'));
			await landed(page, '#line-larkspur-biz');
			// From one line straight to another, focus still on the first: the old summary's blur
			// must not clear the new line's outline.
			await page.evaluate(() => {
				const link = document.createElement('a');
				link.href = '#line-larkspur-help-nanny';
				document.body.append(link);
				link.click();
				link.remove();
			});
			await landed(page, '#line-larkspur-help-nanny');
			await page.goto('about:blank');
			await page.goto('/cost/larkspur#line-nope');
			await expect(page.locator('section.budget details[open]')).toHaveCount(0);
			await expect(page.locator('h1')).toBeVisible();
		}
	],
	[
		'the receipt: stale, $0 with its note, and an incomplete household',
		async (page, phone) => {
			const c = await openCard(page, phone, 'mill-valley');
			await expect(c.locator('a[data-line="millvalley.food.clean"]')).toContainText('stale');
			await expect(c.locator('[data-see-all]')).toHaveText('See all 42 lines →');
			await c.locator('[data-town="ross"]').click();
			const mortgage = c.locator('a[data-line="ross.home.pi"]');
			await expect(mortgage).toContainText('$0');
			await expect(mortgage).toContainText('Bought 1998, paid off.');
			await expect(c.locator('[data-incomplete]')).toHaveText('incomplete');
			await expect(c.locator('[data-break-even]')).toHaveCount(0);
			await expect(c.locator('[data-burn]')).toContainText('so far');
			await expect(c.locator('[data-receipt-total]')).toContainText('39 of 40 lines priced');
		}
	]
];

for (const [name, run] of flows) {
	test(`the receipt at 1440: ${name}`, async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await run(page, false);
	});
	test(`@phone the receipt: ${name}`, async ({ page }) => {
		await run(page, true);
	});
}

/** "See all" keeps its 44 px, inside the card's box, and the card never scrolls inside. */
async function buttonHolds(c: Locator) {
	const g = await c.evaluate((card) => {
		const b = card.querySelector('[data-see-all]')!.getBoundingClientRect();
		const r = card.getBoundingClientRect();
		return {
			height: b.height,
			inside: b.left >= r.left && b.right <= r.right && b.top >= r.top && b.bottom <= r.bottom,
			scrolls: card.scrollHeight > card.clientHeight + 1 || card.scrollWidth > card.clientWidth + 1,
			last: card.lastElementChild!.contains(card.querySelector('[data-see-all]'))
		};
	});
	expect(g.height).toBeGreaterThanOrEqual(44);
	expect(g).toMatchObject({ inside: true, scrolls: false, last: true });
}

const LONG =
	'A very long signature label that goes on, and on, about a fairly ordinary thing a household buys every single month of the year';

for (const [label, width, phone] of [
	['1440', 1440, false],
	['768', 768, false],
	['390', 390, true]
] as const) {
	test(`See all stays in the card at ${label}, with long labels and 200% text`, async ({
		page
	}) => {
		await page.setViewportSize({ width, height: 900 });
		await stub(page);
		await page.route('**/api/data/lifestyle', async (r) => {
			const res = await r.fetch();
			const body = await res.json();
			for (const h of body.households) for (const l of h.receipt) l.label = `${LONG} ${l.label}`;
			await r.fulfill({ response: res, json: body });
		});
		await page.goto('/?probe');
		await expect(page.locator('[data-layout="v2"][data-hydrated="true"]')).toBeVisible();
		if (phone) await page.locator('[data-section-toggle="cost"]').click();
		const c = page.locator('#cost [data-card="lifestyle"]');
		await expect(c.locator('[data-town]')).toHaveCount(3);
		for (const town of ['larkspur', 'mill-valley', 'ross']) {
			await c.locator(`[data-town="${town}"]`).click();
			await buttonHolds(c);
		}
		await page.addStyleTag({ content: 'html { font-size: 200%; } .dash-v2 { zoom: 1; }' });
		await page.evaluate(() =>
			document.documentElement.style.setProperty('-webkit-text-size-adjust', '200%')
		);
		await buttonHolds(c);
	});
}

test('@phone See all and the rows are 44 px targets', async ({ page }) => {
	const c = await openCard(page, true);
	for (const t of await c.locator('a[data-line], [data-see-all]').all())
		expect((await t.boundingBox())!.height).toBeGreaterThanOrEqual(44);
	await buttonHolds(c);
});
