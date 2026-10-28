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
 * Every visible piece of text under the v2 root and any open dialog (portalled to the body, rule
 * 6), whole (TEXT1: no 40-character cut), with the role it is classified under (§13.4): DOM text
 * (including text inside `display: contents` wrappers), ::before/::after content, and form-field
 * placeholders and values (Codex PR 7 #2).
 */
async function audit(page: Page): Promise<TextNode[]> {
	return page.evaluate(() => {
		const roots = [
			document.querySelector('[data-layout="v2"]')!,
			...document.querySelectorAll('[data-dialog-layer]')
		];
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
				text,
				role: el.closest('[data-text-role]')?.getAttribute('data-text-role') ?? null,
				fontPx: parseFloat(cs.fontSize),
				lineHeightPx: cs.lineHeight === 'normal' ? NaN : parseFloat(cs.lineHeight)
			});

		for (const root of roots) {
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
		}
		return out;
	});
}

async function openAll(page: Page) {
	await page.goto('/?layout=v2&probe');
	await expect(page.locator('[data-layout="v2"][data-hydrated="true"]')).toBeVisible();
	await page.evaluate(() => document.fonts.ready);
	// The map's own DOM text (layer controls, attribution) is part of the page (PR 9).
	await expect(page.locator('.v2-map .maplibregl-canvas')).toBeVisible({ timeout: 20_000 });
	// Audit the settled page, not its loading state (Codex 9b #6): every part settled and the
	// map drew the latest data revision; Latest reporting shows rows or a terminal status.
	await page.waitForFunction(
		() => {
			const p = (
				window as unknown as {
					__v2Probe?: {
						loading: string[];
						dataRevision: number;
						synced: { revision: number } | null;
					};
				}
			).__v2Probe;
			return Boolean(p && p.loading.length === 0 && p.synced?.revision === p.dataRevision);
		},
		undefined,
		{ timeout: 45_000 }
	);
	await expect(page.locator('[data-slot="latest-reporting"]')).not.toContainText('Loading…');
	// Opening one changes the set, so always take the first still-closed toggle.
	const closed = page.locator('[data-section-toggle][aria-expanded="false"]');
	while ((await closed.count()) > 0) await closed.first().click();
	await expect(page.locator('section#getting-around')).not.toContainText(/Loading/, {
		timeout: 30_000
	}); // its details load on open (Codex r1 #9)
}

/**
 * The reused disclosures carry text too (Codex r1 #12): audit each one open, and every dialog in
 * TEXT0's inventory (TEXT1): source health, Coverage details and Getting Around's panels. A
 * dialog's control only exists when its content does (a failing source, a 511 alert), so those
 * open where they show.
 */
const dialog = (page: Page) => page.getByRole('dialog');
const closeDialog = async (page: Page) => {
	await page.keyboard.press('Escape');
	await expect(dialog(page)).toHaveCount(0);
};
const DISCLOSURES: {
	name: string;
	open: (page: Page) => Promise<boolean | void>;
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
			await expect(dialog(page)).toBeVisible();
		},
		close: closeDialog
	},
	{
		name: 'coverage details',
		open: async (page) => {
			const button = page.locator('[data-coverage-details]:visible').first();
			if (!(await button.count())) return false;
			await button.click();
			await expect(dialog(page).locator('[data-source-list]')).toBeVisible();
		},
		close: closeDialog
	},
	{
		name: 'Getting Around panel',
		open: async (page) => {
			const button = page.locator('#getting-around button[data-kind="detail"]:visible').first();
			if (!(await button.count())) return false;
			await button.click();
			await expect(dialog(page).locator('[data-status-detail]')).toBeVisible();
		},
		close: closeDialog
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
			const nodes: TextNode[] = [];
			// Both themes (TEXT1): the roles and sizes hold in each.
			for (const theme of ['dark', 'light']) {
				await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
				nodes.push(...(await audit(page)).map((n) => ({ ...n, text: `${theme}: ${n.text}` })));
				for (const d of DISCLOSURES) {
					if ((await d.open(page)) === false) continue;
					nodes.push(
						...(await audit(page)).map((n) => ({ ...n, text: `${theme} [${d.name}] ${n.text}` }))
					);
					await d.close(page);
				}
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
					// TEXT1: a control's lines aren't crammed either.
					expect(
						n.lineHeightPx / n.fontPx,
						`control line-height "${n.text}"`
					).toBeGreaterThanOrEqual(MIN_LINE_HEIGHT);
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
					if ((await d.open(page)) === false) continue;
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
