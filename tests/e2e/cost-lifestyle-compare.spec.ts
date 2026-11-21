import { readFileSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * /cost (COSTX1): the households side by side, on the Lifestyle Index's seeded preview. Larkspur
 * is complete, Mill Valley has stale lines, Ross is incomplete (its USDA groceries can't be read).
 * Every number is the seed's own.
 */
test.skip(({ baseURL }) => baseURL?.startsWith('https://') ?? false, 'seeded');

interface SeedBudget {
	town: string;
	complete: boolean;
	burnMonthly: number;
	breakEven: { gross: number } | null;
	sections: Record<string, number>;
	lines: { id: string; section: string; label: string }[];
}
const seed = JSON.parse(readFileSync('tests/e2e/fixtures/lifestyle-index.json', 'utf8')) as {
	current: { budgets: SeedBudget[] };
};
const budget = (id: string) => seed.current.budgets.find((b) => b.town === id)!;
const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const SLUGS = { larkspur: 'larkspur', millvalley: 'mill-valley', ross: 'ross' } as const;
const TOWNS = { larkspur: 'Larkspur', millvalley: 'Mill Valley', ross: 'Ross' } as const;
const FICTION = 'fictional household · modelled spending';

const row = (page: Page, section: string) => page.locator(`[data-compare-section="${section}"]`);
const cell = (page: Page, section: string, slug: string) =>
	row(page, section).locator(`[data-cell="${slug}"]`);
const width = async (l: Locator) => (await l.boundingBox())!.width;

test.describe('desktop', () => {
	test.use({ viewport: { width: 1440, height: 900 } });

	test('the households: name, persona, month and break-even, each linking to its page', async ({
		page
	}) => {
		const response = await page.goto('/cost');
		expect(response?.status()).toBe(200);
		expect(response?.headers()['cache-control']).toMatch(/^public, s-maxage=/);
		await expect(page.locator('[data-fiction]')).toHaveText(FICTION);
		const cards = page.locator('[data-household]');
		await expect(cards).toHaveCount(3);
		for (const [id, slug] of Object.entries(SLUGS)) {
			const b = budget(id);
			const c = page.locator(`[data-household="${slug}"]`);
			await expect(c.locator('[data-burn]')).toHaveText(
				`${usd(b.burnMonthly)}a month${b.complete ? '' : ' so far'}`
			);
			if (b.breakEven)
				await expect(c.locator('[data-break-even]')).toContainText(usd(b.breakEven.gross));
			else {
				await expect(c.locator('[data-break-even]')).toHaveCount(0);
				await expect(c.locator('[data-incomplete]')).toHaveText('incomplete');
				await expect(c).toContainText('Groceries (USDA Liberal plan) can’t be read');
			}
			await expect(c.locator('[data-town-link]')).toHaveAttribute('href', `/cost/${slug}`);
		}
		await page.locator('[data-household="mill-valley"] [data-town-link]').click();
		await expect(page).toHaveURL(/\/cost\/mill-valley$/);
	});

	test('one shared dollar scale: every track the same width, the largest amount at full width', async ({
		page
	}) => {
		await page.goto('/cost');
		const tracks = page.locator('.track');
		const widths = await tracks.evaluateAll((ts) => ts.map((t) => t.getBoundingClientRect().width));
		expect(Math.max(...widths) - Math.min(...widths)).toBeLessThan(1);
		const track = widths[0];
		const all = seed.current.budgets.flatMap((b) => Object.values(b.sections));
		const max = Math.max(...all);
		// Ross's help is the page's largest amount: the whole track.
		expect(await width(cell(page, 'help', 'ross').locator('[data-bar]'))).toBeCloseTo(track, 0);
		// Larkspur's housing, its own biggest section, is drawn against the page's largest.
		const housing = budget('larkspur').sections.housing;
		expect(await width(cell(page, 'housing', 'larkspur').locator('[data-bar]'))).toBeCloseTo(
			(track * housing) / max,
			0
		);
		await expect(cell(page, 'housing', 'larkspur').locator('[data-amount]')).toHaveText(
			usd(housing)
		);
		// Ross's business is an actual $0: said, with no bar.
		await expect(cell(page, 'business', 'ross').locator('[data-amount]')).toHaveText('$0');
		await expect(cell(page, 'business', 'ross').locator('[data-bar]')).toHaveCount(0);
	});

	test('partial reads “so far”, is drawn apart, and compares nothing; a comparable row may', async ({
		page
	}) => {
		await page.goto('/cost');
		const food = cell(page, 'food', 'ross');
		await expect(food).toHaveAttribute('data-cell-state', 'partial');
		await expect(food.locator('[data-amount]')).toHaveText(
			`${usd(budget('ross').sections.food)} so far`
		);
		await expect(food.locator('[data-bar]')).toHaveClass(/partial/);
		await expect(page.locator('[data-partial-key]')).toBeVisible();
		await expect(row(page, 'food')).toHaveAttribute('data-comparable', 'false');
		await expect(row(page, 'food').locator('[data-comparison-highlight]')).toHaveCount(0);
		// A stale line says stale, and its section compares nothing either.
		await expect(cell(page, 'utilities', 'mill-valley').locator('[data-cell-stale]')).toBeVisible();
		await expect(row(page, 'utilities').locator('[data-comparison-highlight]')).toHaveCount(0);
		// The seed has no in-date run: the page says so, and compares nothing at all (Codex). The
		// highlight's own rendering is page.test.ts's.
		await expect(page.locator('[data-stale-budget]')).toBeVisible();
		await expect(page.locator('[data-comparison-highlight]')).toHaveCount(0);
		await expect(page.locator('[data-compare-section][data-comparable="true"]')).toHaveCount(0);
		await expect(page.locator('main')).not.toContainText(/widest/i);
	});

	test('opening a section lists each household’s own lines under its own name, never paired', async ({
		page
	}) => {
		await page.goto('/cost');
		const giving = row(page, 'giving');
		await expect(giving.locator('[data-lines]')).toBeHidden();
		await giving.locator('summary').click();
		await expect(giving.locator('[data-lines]')).toBeVisible();
		for (const [id, slug] of Object.entries(SLUGS)) {
			const own = budget(id).lines.filter((l) => l.section === 'giving');
			const col = giving.locator(`[data-lines-for="${slug}"]`);
			await expect(col.locator('h3')).toHaveText(TOWNS[id as keyof typeof TOWNS]);
			await expect(col.locator('[data-line]')).toHaveCount(own.length);
			for (const l of own) {
				const a = col.locator(`[data-line="${l.id}"]`);
				await expect(a).toContainText(l.label);
				await expect(a).toHaveAttribute('href', `/cost/${slug}#line-${l.id.replaceAll('.', '-')}`);
			}
		}
		// Ross's groceries can't be read: said under Ross, in Ross's own words.
		await row(page, 'food').locator('summary').click();
		await expect(
			row(page, 'food').locator('[data-lines-for="ross"] [data-line="ross.food.groceries"]')
		).toContainText('can’t be read');
	});

	test('the keyboard opens and closes a section, its focus kept on the section', async ({
		page
	}) => {
		await page.goto('/cost');
		const summary = row(page, 'housing').locator('summary');
		await summary.focus();
		await page.keyboard.press('Enter');
		await expect(row(page, 'housing')).toHaveAttribute('open', '');
		await expect(summary).toBeFocused();
		await page.keyboard.press('Space');
		await expect(row(page, 'housing')).not.toHaveAttribute('open', '');
	});

	test('the dashboard’s Cost card links to the comparison', async ({ page }) => {
		await page.route(/\/api\/data\/(?!lifestyle)/, (r) =>
			r.fulfill({ status: 503, body: 'stubbed' })
		);
		await page.goto('/');
		// Hydrated first: a click the server's HTML takes is not the page's own link.
		await expect(page.locator('[data-layout="v2"][data-hydrated="true"]')).toBeVisible();
		const link = page.locator('#cost [data-card="lifestyle"] [data-compare-link]');
		await expect(link).toHaveAttribute('href', '/cost');
		await link.click();
		await expect(page).toHaveURL(/\/cost$/);
		await expect(page.locator('[data-household]')).toHaveCount(3);
	});
});

test.describe('@phone /cost at 390', () => {
	test.use({ viewport: { width: 390, height: 844 } });

	test('every section open: no sideways scroll, household-labelled rows, one scale, 44 px targets', async ({
		page
	}) => {
		await page.goto('/cost');
		const rows = page.locator('[data-compare-section]');
		const n = await rows.count();
		expect(n).toBe(12);
		for (let i = 0; i < n; i++) {
			const s = rows.nth(i).locator('summary');
			expect((await s.boundingBox())!.height).toBeGreaterThanOrEqual(44);
			await s.click();
		}
		const overflow = await page.evaluate(
			() => document.documentElement.scrollWidth - window.innerWidth
		);
		expect(overflow).toBeLessThanOrEqual(0);
		// Stacked: each household's row under the last, each with its town.
		const cells = row(page, 'housing').locator('[data-cell]');
		const boxes = await cells.evaluateAll((cs) => cs.map((c) => c.getBoundingClientRect().top));
		expect(boxes[1]).toBeGreaterThan(boxes[0]);
		expect(boxes[2]).toBeGreaterThan(boxes[1]);
		await expect(cells.locator('.cell-town')).toHaveText(['Larkspur', 'Mill Valley', 'Ross']);
		const widths = await page
			.locator('.track')
			.evaluateAll((ts) => ts.map((t) => t.getBoundingClientRect().width));
		expect(Math.max(...widths) - Math.min(...widths)).toBeLessThan(1);
		// The opened lines stack under each household's name, every line a 44 px link.
		const cols = row(page, 'food').locator('[data-lines-for]');
		const tops = await cols.evaluateAll((cs) => cs.map((c) => c.getBoundingClientRect().top));
		expect(tops[1]).toBeGreaterThan(tops[0]);
		for (const a of await row(page, 'food').locator('[data-line]').all())
			expect((await a.boundingBox())!.height).toBeGreaterThanOrEqual(44);
	});

	test('provenance is reachable by touch: the legend sits in the opened section, chips are named', async ({
		page
	}) => {
		await page.goto('/cost');
		await row(page, 'help').locator('summary').tap();
		const legend = row(page, 'help').locator('[data-provenance-legend]');
		await expect(legend).toBeVisible();
		await expect(legend).toContainText('live: our own read');
		await expect(legend).toContainText('cited: a published figure');
		await expect(legend).toContainText('persona: an assumption');
		const chips = row(page, 'help').locator('[data-lines-for="larkspur"] [data-classes]').first();
		await expect(chips).toHaveAttribute('role', 'img');
		await expect(chips).toHaveAttribute('aria-label', /^Inputs: (live|cited|persona)/);
		// Focus stays on the section after a keyboard toggle, at phone width too.
		const summary = row(page, 'kids').locator('summary');
		await summary.focus();
		await page.keyboard.press('Enter');
		await expect(summary).toBeFocused();
		await expect(row(page, 'kids').locator('[data-lines]')).toBeVisible();
	});
});
