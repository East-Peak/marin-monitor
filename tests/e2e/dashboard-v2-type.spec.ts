import { expect, test, type Page } from '@playwright/test';
import {
	EXCEPTION_ROLES,
	MIN_LINE_HEIGHT,
	MIN_TEXT_PX,
	TEXT_ROLES,
	roleFontPx,
	type TextRole
} from '../../src/lib/dashboard/type-roles';

interface TextNode {
	text: string;
	role: string | null;
	fontPx: number;
	lineHeightPx: number;
}

/**
 * Every visible piece of text under the v2 root, with the role it is classified under (§13.4):
 * DOM text (including text inside `display: contents` wrappers), ::before/::after content, and
 * form-field placeholders and values (Codex PR 7 #2).
 */
async function audit(page: Page): Promise<TextNode[]> {
	return page.evaluate(() => {
		const root = document.querySelector('[data-layout="v2"]')!;
		const out: TextNode[] = [];
		/** `display: contents` boxes report invisible; judge the nearest box that renders. */
		const rendered = (el: Element | null): Element | null => {
			while (el && getComputedStyle(el).display === 'contents') el = el.parentElement;
			return el;
		};
		const visible = (el: Element) => {
			const box = rendered(el);
			return !!box && box.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
		};
		const push = (text: string, el: Element, cs: CSSStyleDeclaration) =>
			out.push({
				text: text.slice(0, 40),
				role: el.closest('[data-text-role]')?.getAttribute('data-text-role') ?? null,
				fontPx: parseFloat(cs.fontSize),
				lineHeightPx: cs.lineHeight === 'normal' ? NaN : parseFloat(cs.lineHeight)
			});

		const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
		for (let n = walker.nextNode(); n; n = walker.nextNode()) {
			const text = n.textContent?.trim();
			const el = n.parentElement;
			if (!text || !el || !visible(el)) continue;
			push(text, el, getComputedStyle(rendered(el) ?? el));
		}
		for (const el of root.querySelectorAll('*')) {
			if (!visible(el)) continue;
			for (const pseudo of ['::before', '::after']) {
				const cs = getComputedStyle(el, pseudo);
				const m = /^"(.*)"$/s.exec(cs.content);
				if (m && m[1].trim() && cs.display !== 'none') push(m[1].trim(), el, cs);
			}
			if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
				const text = (el.value || el.placeholder).trim();
				if (text) push(text, el, getComputedStyle(el));
			}
		}
		return out;
	});
}

async function openAll(page: Page) {
	await page.goto('/?layout=v2');
	await expect(page.locator('[data-layout="v2"][data-hydrated="true"]')).toBeVisible();
	await page.evaluate(() => document.fonts.ready);
	// Opening one changes the set, so always take the first still-closed toggle.
	const closed = page.locator('[data-section-toggle][aria-expanded="false"]');
	while ((await closed.count()) > 0) await closed.first().click();
}

/** The reused disclosures carry text too (Codex r1 #12): audit each one open. PR 8 adds the health list here. */
const DISCLOSURES: {
	name: string;
	open: (page: Page) => Promise<void>;
	close: (page: Page) => Promise<void>;
}[] = [
	{
		name: 'town picker',
		open: async (page) => {
			await page.locator('[data-layout="v2"] .picker-trigger').click();
			await expect(page.getByRole('listbox', { name: 'Marin towns' })).toBeVisible();
		},
		close: (page) => page.keyboard.press('Escape')
	},
	{
		name: 'settings menu',
		open: async (page) => {
			await page.getByRole('button', { name: 'Dashboard settings' }).click();
			await expect(page.getByRole('button', { name: 'Reset sections' })).toBeVisible();
		},
		close: (page) => page.getByRole('button', { name: 'Dashboard settings' }).click()
	},
	{
		name: 'source health',
		open: async (page) => {
			const button = page.locator('.v2-health-button');
			await expect(button).not.toHaveText('Checking sources…', { timeout: 15_000 });
			await button.click();
			await expect(page.locator('[data-health-list]')).toBeVisible();
		},
		close: (page) => page.locator('.v2-health-button').click()
	}
];

test('the audit sees pseudo-element, form-field and display:contents text (negative control; Codex PR 7 #2)', async ({
	page
}) => {
	await openAll(page);
	await page.evaluate(() => {
		const root = document.querySelector('[data-layout="v2"] main')!;
		const style = document.createElement('style');
		style.textContent = '.probe-pseudo::before { content: "probe pseudo"; }';
		document.head.append(style);
		root.insertAdjacentHTML(
			'beforeend',
			'<div class="probe-pseudo"></div>' +
				'<input placeholder="probe placeholder" />' +
				'<span style="display: contents">probe contents</span>'
		);
	});
	const unclassified = (await audit(page)).filter((n) => n.role === null).map((n) => n.text);
	expect(unclassified).toEqual(
		expect.arrayContaining(['probe pseudo', 'probe placeholder', 'probe contents'])
	);
});

for (const viewport of [
	{ width: 1440, height: 900 },
	{ width: 390, height: 844 }
]) {
	test.describe(`${viewport.width}px at 100% UI scale`, () => {
		test.use({ viewport });

		test('every visible text node is classified and sized by its role token, disclosures included', async ({
			page
		}) => {
			await openAll(page);
			const nodes = await audit(page);
			for (const d of DISCLOSURES) {
				await d.open(page);
				nodes.push(...(await audit(page)).map((n) => ({ ...n, text: `[${d.name}] ${n.text}` })));
				await d.close(page);
			}
			expect(nodes.length).toBeGreaterThan(10);
			expect(
				nodes.filter((n) => n.role === null).map((n) => n.text),
				'unclassified text'
			).toEqual([]);
			const known = new Set<string>([...Object.keys(TEXT_ROLES), ...EXCEPTION_ROLES]);
			expect(nodes.filter((n) => !known.has(n.role!)).map((n) => `${n.role}: ${n.text}`)).toEqual(
				[]
			);
			for (const n of nodes) {
				if (n.role === 'control') {
					expect(n.fontPx, `control "${n.text}"`).toBeGreaterThanOrEqual(MIN_TEXT_PX);
					continue;
				}
				expect(n.fontPx, `${n.role} "${n.text}"`).toBe(
					roleFontPx(n.role as TextRole, viewport.width)
				);
				expect(n.lineHeightPx / n.fontPx, `line-height "${n.text}"`).toBeGreaterThanOrEqual(
					MIN_LINE_HEIGHT
				);
			}
		});

		for (const zoom of ['50%', '150%']) {
			test(`at ${zoom} UI scale nothing overflows the page horizontally`, async ({ page }) => {
				await openAll(page);
				await page.evaluate((z) => (document.documentElement.style.zoom = z), zoom);
				const overflow = await page.evaluate(
					() => document.documentElement.scrollWidth - window.innerWidth
				);
				expect(overflow).toBeLessThanOrEqual(1);
				for (const t of await page.locator('[data-section-toggle]').all()) {
					await expect(t).toBeVisible();
				}
				// The disclosures open at this scale too, and stay inside the page (Codex PR 7 #3).
				for (const d of DISCLOSURES) {
					await d.open(page);
					const open = await page.evaluate(
						() => document.documentElement.scrollWidth - window.innerWidth
					);
					expect(open, `${d.name} open at ${zoom}`).toBeLessThanOrEqual(1);
					await d.close(page);
				}
			});
		}
	});
}
