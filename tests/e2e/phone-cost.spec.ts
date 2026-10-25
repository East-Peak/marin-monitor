import { expect, test, type Page } from '@playwright/test';
import { auditTap, openPhone, preparePhone } from './fixtures/phone-audit';

/** MOBILE1: every control on /cost/larkspur, on an iPhone and a Pixel. */
const PAGE = '/cost/larkspur';
const sheet = (page: Page) => page.locator('section.budget');

test.beforeEach(async ({ page }) => {
	await preparePhone(page);
	await openPhone(page, PAGE, sheet(page).locator('details'));
});

test.describe('@phone cost controls', () => {
	test('the household links change the household; the breadcrumb goes home', async ({
		page
	}, info) => {
		const failures: string[] = [];
		for (const [name, slug] of [
			['Mill Valley', 'mill-valley'],
			['Ross', 'ross'],
			['Larkspur', 'larkspur']
		]) {
			failures.push(
				...(await auditTap(page, info, {
					page: PAGE,
					state: 'default',
					control: `household: ${name}`,
					target: page.locator(`a[href="/cost/${slug}"]`).first(),
					outcome: async () => {
						await expect(page).toHaveURL(new RegExp(`/cost/${slug}$`), { timeout: 3_000 });
						await expect(page.locator('h1, h2').filter({ hasText: name }).first()).toBeVisible();
					}
				}))
			);
		}
		failures.push(
			...(await auditTap(page, info, {
				page: PAGE,
				state: 'default',
				control: 'breadcrumb: Marin Monitor',
				target: page.getByRole('link', { name: 'Marin Monitor' }),
				outcome: async () =>
					expect(page.locator('[data-layout="v2"]')).toBeVisible({ timeout: 5_000 })
			}))
		);
		expect(failures).toEqual([]);
	});

	test('every line opens to its inputs, and closes', async ({ page }, info) => {
		const failures: string[] = [];
		for (const details of await sheet(page).locator('details').all()) {
			const summary = details.locator('summary');
			const id = (await details.getAttribute('data-line'))!;
			failures.push(
				...(await auditTap(page, info, {
					page: PAGE,
					state: 'collapsed',
					control: `line ${id}`,
					target: summary,
					outcome: async () => {
						await expect(details).toHaveAttribute('open', '', { timeout: 2_000 });
						await expect(details.locator('ul.inputs li').first()).toBeVisible();
					},
					undo: async () => {
						await summary.tap();
						await expect(details).not.toHaveAttribute('open');
					}
				}))
			);
		}
		expect(failures).toEqual([]);
	});

	test('every source link opens its source', async ({ page }, info) => {
		const failures: string[] = [];
		// Open every line, then tap each distinct source once, where it first appears.
		for (const s of await sheet(page).locator('details > summary').all()) await s.tap();
		const seen = new Set<string>();
		const links = page.locator('main a[target="_blank"]');
		for (const link of await links.all()) {
			const href = (await link.getAttribute('href'))!;
			if (seen.has(href) || !(await link.isVisible())) continue;
			seen.add(href);
			let popup: Page | null = null;
			const onPopup = (p: Page) => (popup = p);
			page.on('popup', onPopup);
			failures.push(
				...(await auditTap(page, info, {
					page: PAGE,
					state: 'lines open',
					control: `source ${new URL(href).host}${new URL(href).pathname.slice(0, 24)}`,
					target: link,
					outcome: async () =>
						expect.poll(() => popup?.url(), { timeout: 3_000 }).toBe(new URL(href).href),
					undo: async () => {
						await popup!.close();
					}
				}))
			);
			page.off('popup', onPopup);
		}
		expect(seen.size).toBeGreaterThan(5);
		expect(failures).toEqual([]);
	});
});
