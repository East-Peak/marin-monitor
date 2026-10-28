import { expect, test, type Locator, type Page, type Route } from '@playwright/test';
import { stub, T0 } from './fixtures/v2-height';
import { settled } from './fixtures/v2-probe';

/**
 * TEXT1 rules 5 and 6, measured from viewport coordinates and the scroll position: opening or
 * closing a section keeps its header still (≤ 1 px), even as its content arrives late; a collapse
 * near the document's end may scroll, so there the header only has to stay in view. Opening and
 * closing a dialog moves nothing on the page, and the scroll is where it was.
 */
test.skip(({ baseURL }) => baseURL?.startsWith('https://') ?? false, 'stubbed');

const iso = (ms: number) => new Date(ms).toISOString();
const json = (r: Route, body: unknown) =>
	r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

/** Getting Around's roads read lands 1.2 s after the section opens: content arriving late. */
async function lateRoads(page: Page) {
	await page.route('**/api/traffic/corridors', async (r) => {
		await new Promise((done) => setTimeout(done, 1_200));
		await json(r, {
			checkedAt: iso(T0 - 60_000),
			upstreamCount: 40,
			unreadable: 0,
			events: Array.from({ length: 3 }, (_, i) => ({
				id: `511.org/g${i}`,
				group: 'to-oak',
				certain: true,
				kind: 'Traffic Collision',
				road: 'I-580',
				where: `Westbound east of Central Ave, lane ${i}`,
				severity: 'Major',
				reportedAt: iso(T0 - 600_000)
			}))
		});
	});
}

async function open(page: Page) {
	await page.clock.install({ time: T0 });
	await stub(page);
	await lateRoads(page);
	await page.goto('/?probe');
	await expect(page.locator('[data-layout="v2"][data-hydrated="true"]')).toBeVisible();
	await page.evaluate(() => document.fonts.ready);
	// Measured on a still page: every read settled and the page's height unchanged for a second.
	await settled(page);
	let height = -1;
	for (let still = 0; still < 4; ) {
		await page.waitForTimeout(250);
		const h = await page.evaluate(() => document.documentElement.scrollHeight);
		still = h === height ? still + 1 : 0;
		height = h;
	}
}

const top = (l: Locator) => l.evaluate((el) => el.getBoundingClientRect().top);
const atEnd = (page: Page) =>
	page.evaluate(
		() => window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2
	);

/** On the phone projects (iPhone 13 WebKit, Pixel 7 Chromium): Stuart's iPhone remains the real check. */
test.describe('@phone', () => {
	for (const id of ['getting-around', 'outdoors', 'news', 'cost', 'events'] as const) {
		test(`@phone section ${id}: opening and closing keeps its header still (rule 5)`, async ({
			page
		}) => {
			await open(page);
			const toggle = page.locator(`[data-section-toggle="${id}"]`);
			// Mid-screen, with page above and below it: the hard case for anchoring.
			await toggle.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
			const before = await top(toggle);
			await toggle.tap();
			await expect(page.locator(`section#${id}`)).toHaveAttribute('data-open', 'true');
			if (id === 'getting-around')
				await expect(page.locator('[data-ga="roads"] [data-row]')).toHaveCount(3, {
					timeout: 10_000
				}); // the late read has landed
			await page.waitForTimeout(400);
			expect(Math.abs((await top(toggle)) - before), 'opened').toBeLessThanOrEqual(1);

			const beforeClose = await top(toggle);
			await toggle.tap();
			await expect(page.locator(`section#${id}`)).toHaveAttribute('data-open', 'false');
			await page.waitForTimeout(400);
			if (await atEnd(page))
				await expect(toggle).toBeInViewport(); // the page got shorter
			else expect(Math.abs((await top(toggle)) - beforeClose), 'closed').toBeLessThanOrEqual(1);
		});
	}

	test('@phone collapsing the last section at the document’s end keeps its header in view', async ({
		page
	}) => {
		await open(page);
		const toggle = page.locator('[data-section-toggle="events"]');
		await toggle.tap();
		await expect(page.locator('section#events')).toHaveAttribute('data-open', 'true');
		await page.evaluate(() =>
			window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' })
		);
		await toggle.tap();
		await expect(page.locator('section#events')).toHaveAttribute('data-open', 'false');
		await expect(toggle).toBeInViewport();
	});
});

/** A sheet rises from the bottom, full width; a side panel hangs from the right, narrower. */
const shape = (page: Page) =>
	page.getByRole('dialog').evaluate((el) => {
		const r = el.getBoundingClientRect();
		const full = Math.abs(r.width - document.documentElement.clientWidth) < 2;
		return full && Math.abs(r.bottom - window.innerHeight) < 2 ? 'sheet' : 'side';
	});

for (const [name, variant] of [
	['1440', 'side'],
	['@phone', 'sheet']
] as const) {
	test(`${name}: a dialog opens as a ${variant} and moves nothing; closing restores the scroll (rule 6)`, async ({
		page
	}) => {
		if (name === '1440') await page.setViewportSize({ width: 1440, height: 900 });
		await open(page);
		const opener = page.locator('[data-coverage-details]').first();
		await expect(opener).toBeVisible({ timeout: 15_000 });
		await opener.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
		const marks = page.locator('[data-section-toggle], [data-slot="latest-reporting"], #map');
		const where = () =>
			marks.evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top * 10)));
		const scroll = await page.evaluate(() => window.scrollY);
		const before = await where();

		await opener.click();
		const dialog = page.getByRole('dialog');
		await expect(dialog).toBeVisible();
		expect(await shape(page)).toBe(variant);
		expect(await where(), 'open').toEqual(before);
		// The page behind is inert and doesn't scroll under a wheel (a mouse: desktop only).
		if (name === '1440') {
			await page.mouse.wheel(0, 600);
			await page.waitForTimeout(200);
			expect(await page.evaluate(() => window.scrollY)).toBe(scroll);
		}
		// Focus stays inside while the page is covered.
		for (let i = 0; i < 6; i++) {
			await page.keyboard.press('Tab');
			expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(
				true
			);
		}

		await dialog.getByRole('button', { name: 'Close' }).click();
		await expect(dialog).toHaveCount(0);
		expect(await page.evaluate(() => window.scrollY)).toBe(scroll);
		expect(await where(), 'closed').toEqual(before);
		await expect(opener).toBeFocused();
	});
}
