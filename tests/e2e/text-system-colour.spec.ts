import { expect, test, type Page } from '@playwright/test';
import { stubCams } from './fixtures/cams';
import { stubBrief, stubCivic, stubCost, stubRest } from './fixtures/v2-populated';

/**
 * TEXT1 1d, rule 1 on the whole of `/`: the status colours mark status only, the accent marks
 * links, and the exceptions are named in code (`data-colour-exception`: signed changes, chart
 * series). The Cost card's redesign (COST1) removed the ranking cue. Provenance is meta.
 */
test.skip(({ baseURL }) => baseURL?.startsWith('https://') ?? false, 'stubbed');

/** The exceptions rule 1 names. */
const EXCEPTIONS = ['signed', 'series'];
/** What may wear a status colour: a status, or a named exception. */
const STATUS =
	'[data-attention], .sr-attention, [data-section-status], [data-state="unavailable"], [data-state="stale"], [data-state="unknown"], [data-colour-exception], .attention';

async function open(page: Page, width: number) {
	await page.setViewportSize({ width, height: 900 });
	await stubRest(page);
	await stubBrief(page);
	await stubCost(page);
	await stubCivic(page);
	await stubCams(page);
	await page.goto('/?layout=v2&probe');
	await expect(page.locator('[data-layout="v2"][data-hydrated="true"]')).toBeVisible();
	const closed = page.locator('[data-section-toggle][aria-expanded="false"]');
	while ((await closed.count()) > 0) await closed.first().click();
	await expect(page.locator('#getting-around [data-ga="roads"]')).not.toContainText('Loading', {
		timeout: 20_000
	});
}

const offenders = (page: Page) =>
	page.evaluate(
		({ status, exceptions }) => {
			const root = document.querySelector('[data-layout="v2"]')!;
			const swatch = (v: string) => {
				const el = document.createElement('span');
				el.style.color = `var(${v})`;
				root.append(el);
				const c = getComputedStyle(el).color;
				el.remove();
				return c;
			};
			const statusColours = new Set(['--warning', '--danger', '--success'].map(swatch));
			const accent = swatch('--accent');
			const out: string[] = [];
			const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
			for (let n = walker.nextNode(); n; n = walker.nextNode()) {
				const el = n.parentElement!;
				const text = n.textContent!.trim();
				if (!text || !el.getClientRects().length) continue;
				const c = getComputedStyle(el).color;
				if (statusColours.has(c) && !el.closest(status)) out.push(`status colour: ${text}`);
				if (c === accent && !el.closest('a, button')) out.push(`accent off a control: ${text}`);
			}
			// A current source wears no colour, dot included (Stuart, 2026-10-28; Codex 1d #1).
			for (const el of root.querySelectorAll('[data-card-source] .st:not(.attention)')) {
				const dot = getComputedStyle(el, '::before');
				if (dot.content !== 'none' && dot.content !== 'normal')
					out.push(`provenance dot on a current source: ${el.textContent!.trim().slice(0, 40)}`);
			}
			for (const el of root.querySelectorAll('[data-colour-exception]'))
				if (!exceptions.includes(el.getAttribute('data-colour-exception')!))
					out.push(`unnamed exception: ${el.getAttribute('data-colour-exception')}`);
			for (const el of root.querySelectorAll('[data-card-source], .sr-meta, [data-ga-foot]'))
				if (el.closest('[data-text-role]')?.getAttribute('data-text-role') !== 'meta')
					out.push(`provenance not meta: ${el.textContent!.trim().slice(0, 60)}`);
			return out;
		},
		{ status: STATUS, exceptions: EXCEPTIONS }
	);

for (const width of [1440, 390]) {
	test(`at ${width}, both themes: status colours only for status, accent only on controls (rule 1)`, async ({
		page
	}) => {
		test.setTimeout(90_000);
		await open(page, width);
		for (const theme of ['dark', 'light']) {
			await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
			expect(await offenders(page), theme).toEqual([]);
		}
		// Negative control: a status colour on plain text is caught.
		await page.evaluate(() =>
			document
				.querySelector('[data-layout="v2"] main')!
				.insertAdjacentHTML('beforeend', '<p style="color: var(--warning)">probe colour</p>')
		);
		expect(await offenders(page)).toContain('status colour: probe colour');
		// … and so is the old always-green dot, put back.
		await page.addStyleTag({
			content: '[data-card-source] .st::before { content: ""; background: var(--success); }'
		});
		expect((await offenders(page)).some((o) => o.startsWith('provenance dot'))).toBe(true);
	});
}
