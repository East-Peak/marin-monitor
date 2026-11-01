import { expect, test, type Locator, type Page } from '@playwright/test';
import { fingerTap, openPhone, preparePhone, swipe } from './fixtures/phone-audit';
import { stubCams } from './fixtures/cams';
import { stubBrief, stubCivic, stubCost, stubRest } from './fixtures/v2-populated';

/**
 * CHARTREAD1: read any chart by pointing at it. Every series here is seeded from one pinned
 * clock, so each readout's value and time is asserted exactly.
 */
const H = 3_600_000;
const MIN = 60_000;
const T0 = Date.parse('2026-10-31T17:10:00.000Z'); // Saturday 10:10 AM PDT
const HOUR0 = Math.floor(T0 / H) * H;
const json = (body: unknown) => ({
	status: 200,
	contentType: 'application/json',
	body: JSON.stringify(body)
});
const celsius = (f: number) => ((f - 32) * 5) / 9;
const report = (at: number, f: number | null) => ({
	properties: {
		timestamp: new Date(at).toISOString(),
		textDescription: 'Clear',
		temperature: { value: f === null ? null : celsius(f), qualityControl: 'V' }
	}
});

/** KDVO: 6 AM takes 6:05, 7 AM has only a null report near it, 8 AM 8:15, 9 AM 8:55, Now 9:55. */
const REPORTS = [
	report(HOUR0 - 4 * H + 5 * MIN, 46),
	report(HOUR0 - 3 * H - 25 * MIN, null),
	report(HOUR0 - H - 45 * MIN, 49),
	report(HOUR0 - H - 5 * MIN, 52),
	report(HOUR0 - 5 * MIN, 57)
];

async function stubSeries(page: Page, now = T0) {
	await page.clock.install({ time: now });
	await stubRest(page);
	await stubBrief(page, now);
	await stubCost(page, now);
	await stubCivic(page);
	await stubCams(page);
	await page.route(/stations\/KDVO\/observations/, (r) => r.fulfill(json({ features: REPORTS })));
	const week = (i: number) => ({
		timestamp: new Date(now - i * 7 * 24 * H).toISOString(),
		lastSuccessfulScrapeAt: new Date(now - i * 7 * 24 * H).toISOString(),
		compositeScore: 104 - i,
		tiers: [],
		marinNumber: { total: 100, annualized: 1200, items: [] }
	});
	await page.route(/\/api\/data\/composite\b/, (r) =>
		r.fulfill(json({ current: week(0), history: [week(3), week(2), week(1), week(0)] }))
	);
}

const box = async (l: Locator) => (await l.boundingBox())!;
const readout = (chart: Locator) => chart.locator('[data-readout]');

/** Hover at a fraction across the chart's drawing. */
async function hoverAt(page: Page, chart: Locator, fraction: number) {
	const plot = chart.locator('[data-readout-plot]');
	await plot.scrollIntoViewIfNeeded();
	const b = await box(plot);
	await page.mouse.move(b.x + b.width * fraction, b.y + b.height / 2);
}

/** The label stays inside its card, and pointing moves nothing on the page. */
async function holdsStill(page: Page, chart: Locator, card: Locator, fraction: number) {
	const shape = () =>
		page.evaluate(() => ({
			h: document.documentElement.scrollHeight,
			w: document.documentElement.scrollWidth,
			y: scrollY
		}));
	await page.mouse.move(0, 0);
	await expect(readout(chart)).toHaveCount(0);
	// The rest of the page loads around this: only the readout's own effect is being measured.
	let before = await shape();
	for (let same = 0; same < 3; ) {
		await page.waitForTimeout(250);
		const next = await shape();
		same = next.h === before.h ? same + 1 : 0;
		before = next;
	}
	const cardBefore = await box(card);
	await hoverAt(page, chart, fraction);
	await expect(readout(chart)).toBeVisible();
	const after = await shape();
	const cardAfter = await box(card);
	expect(after.h).toBe(before.h);
	expect(after.w).toBe(before.w);
	expect(cardAfter.height).toBe(cardBefore.height);
	const label = await box(readout(chart));
	expect(label.x).toBeGreaterThanOrEqual(cardAfter.x);
	expect(label.x + label.width).toBeLessThanOrEqual(cardAfter.x + cardAfter.width);
	expect(label.y).toBeGreaterThanOrEqual(cardAfter.y);
	const plot = await box(chart.locator('[data-readout-plot]'));
	expect(label.y + label.height, 'the label sits above the chart').toBeLessThanOrEqual(plot.y + 1);
}

test.skip(({ baseURL }) => baseURL?.startsWith('https://') ?? false, 'stubbed');

test.describe('1440', () => {
	test.use({ viewport: { width: 1440, height: 1000 } });

	test.beforeEach(async ({ page }) => {
		await stubSeries(page);
		await page.goto('/?layout=v2');
		await expect(page.locator('[data-layout="v2"][data-hydrated="true"]')).toBeVisible();
	});

	test('chart 1: the tile’s grid reads the report’s own time, and the silence where a column is empty', async ({
		page
	}) => {
		const card = page.locator('[data-card="weather"]');
		const chart = card.getByRole('slider');
		await expect(chart).toHaveAttribute(
			'aria-label',
			'Temperature, 4 hours observed, now, then 8 hours forecast'
		);
		await expect(chart.locator('[data-col-time]').nth(4)).toHaveText('Now');
		await expect(chart.locator('[data-col-temp]').nth(4)).toHaveText('57°');
		await expect(card.locator('[data-text-role="value"]').first()).toHaveText('57°F');

		const col = (i: number) => (i + 0.5) / 13;
		await hoverAt(page, chart, col(3));
		await expect(readout(chart)).toHaveText('observed 52° · 8:55 AM · Gnoss Field');
		await hoverAt(page, chart, col(4));
		await expect(readout(chart)).toHaveText('observed 57° · 9:55 AM · Gnoss Field');
		await hoverAt(page, chart, col(5));
		await expect(readout(chart)).toHaveText(/^forecast \d+° · 11 AM$/);
		await expect(chart.locator('[data-readout-dot]')).toBeVisible();

		await expect(chart.locator('[data-col-temp]').nth(1)).toHaveText('—');
		await hoverAt(page, chart, col(1));
		await expect(readout(chart)).toHaveText('No readings 6:05–8:15 AM');
		await expect(chart.locator('[data-readout-dot]')).toHaveCount(0);

		await page.mouse.move(0, 0);
		await expect(readout(chart)).toHaveCount(0);
	});

	test('chart 1 holds still, keeps its label inside the card, and works from the keyboard', async ({
		page
	}) => {
		const card = page.locator('[data-card="weather"]');
		const chart = card.getByRole('slider');
		for (const f of [0.02, 0.5, 0.98]) await holdsStill(page, chart, card, f);
		await page.mouse.move(0, 0);

		await chart.focus();
		await page.keyboard.press('ArrowLeft');
		await expect(chart).toHaveAttribute('aria-valuetext', 'observed 52° · 8:55 AM · Gnoss Field');
		await page.keyboard.press('End');
		await expect(chart).toHaveAttribute('aria-valuenow', '12');
		await page.keyboard.press('Home');
		await expect(readout(chart)).toHaveText('observed 46° · 6:05 AM · Gnoss Field');
		await page.keyboard.press('Escape');
		await expect(readout(chart)).toHaveCount(0);
		const hint = await chart.getAttribute('aria-describedby');
		await expect(page.locator(`[id="${hint}"]`)).toHaveText('Arrow keys read each value');
	});

	test('the tile as it looks', async ({ page }) => {
		const dir = process.env.SHOTS_DIR;
		test.skip(!dir, 'screenshots on request');
		const chart = page.locator('[data-card="weather"]').getByRole('slider');
		await hoverAt(page, chart, 3.5 / 13);
		await page.locator('[data-slot="brief"]').screenshot({ path: `${dir}/brief-1440.png` });
		await page.locator('#outdoors').screenshot({ path: `${dir}/outdoors-1440.png` });
	});

	test('chart 2: today’s tide reads NOAA’s hourly points and names the events', async ({
		page
	}) => {
		const card = page.locator('[data-card="tide"]');
		const chart = card.getByRole('slider');
		await hoverAt(page, chart, 0.5);
		await expect(readout(chart)).toHaveText(
			/^predicted (high |low )?\d+(\.\d)? ft · \d+(:\d\d)? [AP]M$/
		);
		await holdsStill(page, chart, card, 0.95);
		await chart.focus();
		await page.keyboard.press('Home');
		await expect(chart).toHaveAttribute('aria-valuetext', /^predicted .* ft · 12 AM$/);
	});

	test('chart 3: wave height reads each forecast hour', async ({ page }) => {
		const card = page.locator('[data-card="ocean"]');
		const chart = card.getByRole('slider');
		await hoverAt(page, chart, 0);
		await expect(readout(chart)).toHaveText('forecast 4.0 ft · 10 AM');
		await holdsStill(page, chart, card, 0.98);
	});

	test('chart 5: rain bars read their own hour', async ({ page }) => {
		const card = page.locator('[data-card="forecast"]');
		const chart = card.getByRole('slider', { name: /Chance of rain/ });
		await hoverAt(page, chart, 0.07);
		await expect(readout(chart)).toHaveText(/^forecast \d+% chance · \d+ [AP]M$/);
		await holdsStill(page, chart, card, 0.5);
	});

	test('chart 6: each day reads its forecast high and low', async ({ page }) => {
		const card = page.locator('[data-card="forecast"]');
		const chart = card.getByRole('slider', { name: 'Daily high and low' });
		await hoverAt(page, chart, 0.02);
		await expect(readout(chart)).toHaveText(/^forecast \d+° high · \d+° low · Today$/);
		await holdsStill(page, chart, card, 0.98);
	});

	test('chart 7: the 48 h tide stops only on NOAA’s events', async ({ page }) => {
		const card = page.locator('[data-card="tides"]');
		const chart = card.getByRole('slider');
		await hoverAt(page, chart, 0.33);
		await expect(readout(chart)).toHaveText(
			/^predicted (high|low) \d\.\d ft · (Fri|Sat|Sun|Mon) \d+(:\d\d)? [AP]M$/
		);
		await holdsStill(page, chart, card, 0.98);
	});

	test('chart 8: surf reads by time, and a missing hour is not closed up', async ({ page }) => {
		const card = page.locator('[data-card="surf"]');
		const chart = card.getByRole('slider');
		await hoverAt(page, chart, 0);
		await expect(readout(chart)).toHaveText('forecast 4.0 ft · 10 AM');
		await holdsStill(page, chart, card, 0.98);
	});

	test('chart 10: gas stops on each day’s last reading, with its range', async ({ page }) => {
		const card = page.locator('[data-card="gas"]');
		const chart = card.getByRole('slider');
		await hoverAt(page, chart, 0.99);
		await expect(readout(chart)).toHaveText(/^\$6\.\d\d average · \$5\.80–\$6\.90 · Oct 31$/);
		await holdsStill(page, chart, card, 0.5);
		await chart.focus();
		await page.keyboard.press('Home');
		await expect(chart).toHaveAttribute('aria-valuetext', /average · \$5\.80–\$6\.90 · Oct \d+$/);
	});

	test('chart 11: a sub-index spark reads its own dates', async ({ page }) => {
		const card = page.locator('[data-tile="fitness"]');
		const chart = card.getByRole('slider');
		await hoverAt(page, chart, 0);
		await expect(readout(chart)).toHaveText('$30 · Aug 31');
		await hoverAt(page, chart, 0.99);
		await expect(readout(chart)).toHaveText('$32 · Oct 30');
		await holdsStill(page, chart, card, 0.5);
	});

	test('chart 9: the composite reads each week', async ({ page }) => {
		const card = page.locator('[data-card="composite"]');
		const chart = card.getByRole('slider');
		await hoverAt(page, chart, 0.99);
		await expect(readout(chart)).toHaveText('104.0 · Oct 31');
		await holdsStill(page, chart, card, 0.5);
	});

	test('chart 1: a refresh mid-readout clears it', async ({ page }) => {
		const card = page.locator('[data-card="weather"]');
		const chart = card.getByRole('slider');
		await chart.focus();
		await page.keyboard.press('Home');
		await expect(readout(chart)).toBeVisible();
		await page.route(/stations\/KDVO\/observations/, (r) =>
			r.fulfill(json({ features: [report(HOUR0 - 4 * H + 5 * MIN, 45), ...REPORTS.slice(1)] }))
		);
		await page.clock.fastForward(6 * MIN);
		await expect(readout(chart)).toHaveCount(0);
	});

	test('chart 4 is the same grid with 24 hours ahead, read by hover', async ({ page }) => {
		const card = page.locator('[data-card="forecast"]');
		const chart = card.getByRole('slider', { name: /^Temperature/ });
		await expect(chart.locator('[data-col-time]')).toHaveCount(29);
		await expect(chart.locator('[data-col-temp]').nth(4)).toHaveText('57°');
		// It opens with the past hours in view, before anything scrolls it.
		await expect(chart.locator('[data-readout-plot]').locator('..')).toHaveJSProperty(
			'scrollLeft',
			0
		);
		await hoverAt(page, chart, 3.5 / 29);
		await expect(readout(chart)).toHaveText('observed 52° · 8:55 AM · Gnoss Field');
		await expect(chart.locator('[data-readout-plot]').locator('..')).toHaveJSProperty(
			'scrollLeft',
			0
		);
		await holdsStill(page, chart, card, 0.3);
	});
});

test.describe('@phone chart 4', () => {
	test.beforeEach(async ({ page }) => {
		await preparePhone(page);
		await stubSeries(page);
		await openPhone(page, '/', page.locator('[data-layout="v2"]'));
		await expect(page.locator('[data-hydrated="true"]')).toBeVisible();
		const toggle = page.locator('[data-section-toggle="outdoors"]');
		await toggle.scrollIntoViewIfNeeded();
		await fingerTap(page, toggle);
	});
	const chart = (page: Page) =>
		page.locator('[data-card="forecast"]').getByRole('slider', { name: /^Temperature/ });

	test('@phone Brief and Cost charts are absent; Outdoors’ grid starts at now', async ({
		page
	}) => {
		await expect(chart(page).locator('[data-col-time]')).toHaveCount(29);
		await expect(page.locator('[data-slot="brief"] [role="slider"]')).toHaveCount(0);
		await expect(page.locator('[data-slot="cost"]')).toHaveCount(0);
		const scroller = chart(page).locator('[data-readout-plot]').locator('..');
		await expect.poll(() => scroller.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
		expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
			await page.evaluate(() => innerWidth)
		);
	});

	test('@phone a tap reads and stays; a tap elsewhere clears', async ({ page }) => {
		const plot = chart(page).locator('[data-readout-plot]');
		await plot.scrollIntoViewIfNeeded();
		const seen = await box(chart(page));
		await page.touchscreen.tap(seen.x + 50, seen.y + 40);
		await expect(readout(chart(page))).toBeVisible();
		await expect(readout(chart(page))).toContainText(/°/);
		const card = await box(page.locator('[data-card="forecast"]'));
		const label = await box(readout(chart(page)));
		expect(label.x).toBeGreaterThanOrEqual(card.x);
		expect(label.x + label.width).toBeLessThanOrEqual(card.x + card.width);
		await page.touchscreen.tap(card.x + 20, card.y + 6);
		await expect(readout(chart(page))).toHaveCount(0);
	});

	test('@phone a sideways swipe scrolls the chart and reads nothing', async ({ page }, info) => {
		test.skip(info.project.name !== 'phone-chromium', 'a native scroller needs real touch input');
		const b = await box(chart(page));
		const scroller = chart(page).locator('[data-readout-plot]').locator('..');
		const before = await scroller.evaluate((el) => el.scrollLeft);
		const y = b.y + 40;
		await swipe(page, { x: b.x + b.width * 0.8, y }, { x: b.x + b.width * 0.2, y }, 12);
		await expect.poll(() => scroller.evaluate((el) => el.scrollLeft)).toBeGreaterThan(before);
		await expect(readout(chart(page))).toHaveCount(0);
	});

	test('@phone a vertical scroll that starts on the chart moves the page and pins nothing', async ({
		page
	}, info) => {
		test.skip(info.project.name !== 'phone-chromium', 'a native scroll needs real touch input');
		const b = await box(chart(page));
		const before = await page.evaluate(() => scrollY);
		await swipe(page, { x: b.x + 100, y: b.y + 60 }, { x: b.x + 100, y: b.y - 120 }, 10);
		await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(before);
		await expect(readout(chart(page))).toHaveCount(0);
	});

	test('@phone charts 5–8 read by tap, inside their cards', async ({ page }) => {
		const cards = [
			['forecast', /Chance of rain/, /^forecast \d+% chance · /],
			['forecast', /Daily high/, /^forecast \d+° high · \d+° low · /],
			['tides', /Predicted tide/, /^predicted (high|low) \d\.\d ft · /],
			['surf', /Wave height/, /^forecast \d\.\d ft · /]
		] as const;
		for (const [id, name, words] of cards) {
			const card = page.locator(`[data-card="${id}"]`);
			const c = card.getByRole('slider', { name });
			await c.scrollIntoViewIfNeeded();
			const b = await box(c);
			await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
			await expect(readout(c)).toHaveText(words);
			const cardBox = await box(card);
			const label = await box(readout(c));
			expect(label.x).toBeGreaterThanOrEqual(cardBox.x);
			expect(label.x + label.width).toBeLessThanOrEqual(cardBox.x + cardBox.width);
			expect(label.y).toBeGreaterThanOrEqual(cardBox.y);
		}
	});

	test('@phone a sideways drag on a chart that doesn’t scroll follows the finger', async ({
		page
	}) => {
		const c = page.locator('[data-card="surf"]').getByRole('slider');
		await c.scrollIntoViewIfNeeded();
		const b = await box(c);
		const y = b.y + b.height / 2;
		const seen: string[] = [];
		await c.evaluate((el) => {
			new MutationObserver(() => {
				const t = el.querySelector('[data-readout]')?.textContent;
				if (t) (window as unknown as { __seen: Set<string> }).__seen.add(t);
			}).observe(el, { subtree: true, childList: true, characterData: true });
			(window as unknown as { __seen: Set<string> }).__seen = new Set();
		});
		await swipe(page, { x: b.x + 20, y }, { x: b.x + b.width - 20, y }, 12);
		await expect(readout(c)).toHaveText(/^forecast \d\.\d ft · /);
		seen.push(
			...(await page.evaluate(() => [...(window as unknown as { __seen: Set<string> }).__seen]))
		);
		expect(seen.length).toBeGreaterThan(2);
	});
});
