import { expect, test, type Locator } from '@playwright/test';

test.skip(
	({ baseURL }) => !baseURL?.startsWith('https://') && !process.env.PROD_SPEC_LOCAL,
	'production only'
);

/** An all-clear may only stand on an ok line or an ok part (Codex r1 #7, r2 #5: per row and per part note). */
const ALL_CLEAR = /No delays reported|511 lists no alerts|No incidents listed|on time/i;
async function noUnbackedAllClear(section: Locator) {
	for (const line of await section.locator('[data-line]').all()) {
		const [state, text] = [await line.getAttribute('data-state'), await line.innerText()];
		if (state !== 'ok') expect(text, `a ${state} line`).not.toMatch(ALL_CLEAR);
	}
	for (const p of await section.locator('[data-part-state]').all()) {
		const state = await p.getAttribute('data-part-state');
		const note = p.locator('[data-ga-note]');
		if (state !== 'ok' && (await note.count()))
			expect(await note.innerText(), `a ${state} part`).not.toMatch(ALL_CLEAR);
	}
}

for (const [w, h] of [
	[390, 844],
	[1440, 900]
] as const) {
	test(`live Getting Around at ${w}: every part settles to its own words`, async ({ page }) => {
		test.setTimeout(90_000);
		await page.setViewportSize({ width: w, height: h });
		await page.goto('/?layout=v2#getting-around'); // the hash opens it on a phone too
		await expect(page.locator('[data-layout="v2"][data-hydrated="true"]')).toBeVisible();
		const s = page.locator('section#getting-around');
		await expect(s).toHaveAttribute('data-open', 'true');
		for (const k of ['airports', 'roads', 'transit']) {
			await expect(s.locator(`[data-ga="${k}"]`)).not.toContainText(/Loading/, { timeout: 30_000 });
		}
		await expect(
			s.locator('[data-ga="airports"] [data-line], [data-ga="airports"] [data-ga-note]')
		).not.toHaveCount(0);
		await noUnbackedAllClear(s);
		await expect(s).not.toContainText(/on time/i);
		for (const k of ['airports', 'roads', 'transit']) {
			console.log(
				`${w} ${k}:`,
				(await s.locator(`[data-ga="${k}"]`).innerText()).replace(/\s*\n\s*/g, ' | ')
			);
		}
		const status = s.locator('[data-section-status]');
		console.log(`${w} status:`, (await status.count()) ? await status.innerText() : '(none)');
		await s.screenshot({ path: `/tmp/claude-501/dash-ga-${w}.png` });
		await page.evaluate(() => window.scrollTo(0, 0));
		await page.screenshot({ path: `/tmp/claude-501/dash-ga-${w}-top.png` }); // the brief link in context
	});
}
