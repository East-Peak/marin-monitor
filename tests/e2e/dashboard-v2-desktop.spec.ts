import { expect, test, type Page } from '@playwright/test';
import { stubCams } from './fixtures/cams';
import { SOURCES, reportingSnapshot } from './fixtures/v2-reporting';

/**
 * Desktop frame (plan-dashboard-desktop Goal 1): full width to 2,240 px, sections always
 * open with no disclosure, and the cam wall under the map. The phone keeps the strip.
 * Screenshots land in SHOTS_DIR when it is set (gate 3), never in the repo.
 */
test.skip(({ baseURL }) => baseURL?.startsWith('https://') ?? false, 'stubbed');

const stubRest = (page: Page) =>
	page.route(
		/\/api\/(data|nps|transit|airport-status|health|feeds|article|geocode)\b|\/api\/news\/snapshot|earthquake\.usgs\.gov|api\.weather\.gov|tidesandcurrents/,
		(r) => r.fulfill({ status: 503, body: 'stubbed' })
	);
async function open(page: Page) {
	await stubRest(page);
	await stubCams(page);
	await page.goto('/?layout=v2');
	await expect(page.locator('[data-layout="v2"][data-hydrated="true"]')).toBeVisible();
}
/** Outdoors' reads with real shapes (Goal 2): NWS points + hourly, marine, fires, USGS 7 d, AQI. */
async function stubOutdoors(page: Page) {
	const H = 3_600_000;
	const hour0 = Math.floor(Date.now() / H) * H;
	const json = (body: unknown) => ({
		status: 200,
		contentType: 'application/json',
		body: JSON.stringify(body)
	});
	await page.route(/api\.weather\.gov\/points\//, (r) =>
		r.fulfill(json({ properties: { gridId: 'MTR', gridX: 83, gridY: 115 } }))
	);
	await page.route(/api\.weather\.gov\/gridpoints\/MTR\/83,115\/forecast\/hourly/, (r) =>
		r.fulfill(
			json({
				properties: {
					updateTime: new Date(hour0 - H).toISOString(),
					periods: Array.from({ length: 72 }, (_, i) => ({
						startTime: new Date(hour0 + i * H).toISOString(),
						endTime: new Date(hour0 + (i + 1) * H).toISOString(),
						temperature: 55 + Math.round(12 * Math.sin((i / 24) * 2 * Math.PI)),
						temperatureUnit: 'F',
						probabilityOfPrecipitation: { value: i % 7 === 0 ? 20 : 0 }
					}))
				}
			})
		)
	);
	await page.route(/marine-api\.open-meteo\.com/, (r) =>
		r.fulfill(
			json({
				hourly: {
					time: Array.from({ length: 72 }, (_, i) => (hour0 + i * H) / 1000),
					wave_height: Array.from({ length: 72 }, (_, i) => 4 + Math.sin(i / 6)),
					wave_period: Array.from({ length: 72 }, () => 12),
					wave_direction: Array.from({ length: 72 }, () => 250)
				}
			})
		)
	);
	await page.route(/\/api\/calfire|services3\.arcgis\.com/, (r) =>
		r.fulfill(json({ features: [] }))
	);
	await page.route(/earthquake\.usgs\.gov/, (r) =>
		r.fulfill(json({ features: [], metadata: { generated: Date.now() } }))
	);
	await page.route(/\/api\/air-quality\b/, (r) =>
		r.fulfill(
			json({
				aqi: 14,
				category: 'Good',
				color: '#00e400',
				pollutant: 'OZONE',
				area: 'San Rafael',
				observedAt: hour0 - H,
				timestamp: Date.now()
			})
		)
	);
}
const box = async (page: Page, sel: string) => (await page.locator(sel).first().boundingBox())!;

for (const width of [1440, 2000]) {
	test.describe(`desktop ${width}`, () => {
		test.use({ viewport: { width, height: 1000 } });

		test('full width, sections always open with no disclosure, cam wall below the map', async ({
			page
		}) => {
			await open(page);
			const main = await box(page, 'main');
			if (width === 1440) expect(main.width).toBeGreaterThan(1300);
			expect(main.width).toBeLessThanOrEqual(2240);
			expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
				width
			);

			const sections = page.locator('[data-section]');
			expect(await sections.count()).toBeGreaterThanOrEqual(5);
			await expect(page.locator('[data-section] [aria-expanded]')).toHaveCount(0);
			await expect(page.locator('[data-section-toggle]')).toHaveCount(0);
			await expect(page.locator('[data-section][data-open="false"]')).toHaveCount(0);

			await expect(page.locator('.cams-row')).toHaveCount(0);
			const wall = page.locator('[data-slot="cam-wall"]');
			await expect(wall).toBeVisible();
			const map = await box(page, '#map');
			expect((await wall.boundingBox())!.y).toBeGreaterThanOrEqual(map.y + map.height - 1);
			await expect(wall.locator('[data-camera-id]')).toHaveCount(21);

			const dir = process.env.SHOTS_DIR;
			if (dir) await page.screenshot({ path: `${dir}/desktop-${width}.png`, fullPage: true });
		});
	});
}

test.describe('desktop 1440: the frame', () => {
	test.use({ viewport: { width: 1440, height: 1000 } });

	test('brief is three columns and the map is 500 px tall', async ({ page }) => {
		await open(page);
		const cols = await page
			.locator('[data-slot="brief"]')
			.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').map(parseFloat));
		expect(cols).toHaveLength(3);
		// 5fr · 4fr · 3fr
		expect(cols[0] / cols[2]).toBeCloseTo(5 / 3, 1);
		expect(cols[1] / cols[2]).toBeCloseTo(4 / 3, 1);
		expect(Math.round((await box(page, '.v2-map-canvas')).height)).toBe(500);
	});

	test('South Marin leads the wall at 4 of 6 columns, its first tile a 2×2 block', async ({
		page
	}) => {
		await open(page);
		const south = await box(page, '[data-cam-group="south"]');
		const central = await box(page, '[data-cam-group="central"]');
		expect(Math.abs(south.y - central.y)).toBeLessThanOrEqual(4);
		expect(south.width).toBeGreaterThan(central.width * 1.8);
		const lead = await box(page, '[data-cam-group="south"] li:first-child');
		const next = await box(page, '[data-cam-group="south"] li:nth-child(2)');
		expect(lead.width).toBeGreaterThan(next.width * 1.8);
		expect(lead.height).toBeGreaterThan(next.height * 1.8);
		// Exactly two 16:9 rows and the gap: the lead tile never stretches its rows.
		expect(lead.height).toBeLessThanOrEqual(next.height * 2 + 12);
		const fifth = await box(page, '[data-cam-group="south"] li:nth-child(5)');
		expect(Math.abs(lead.y + lead.height - (fifth.y + fifth.height))).toBeLessThanOrEqual(2);
	});
});

test.describe('desktop 1700+', () => {
	test.use({ viewport: { width: 1800, height: 1000 } });
	test('the map is 540 px tall', async ({ page }) => {
		await open(page);
		expect(Math.round((await box(page, '.v2-map-canvas')).height)).toBe(540);
	});
});

test.describe('desktop 1440: Outdoors beside Getting Around (Goal 2)', () => {
	test.use({ viewport: { width: 1440, height: 1000 } });

	test('Outdoors and Getting Around share a row; the temperature chart has a path', async ({
		page
	}) => {
		await stubRest(page);
		await stubOutdoors(page);
		await stubCams(page);
		await page.goto('/?layout=v2');
		await expect(page.locator('[data-layout="v2"][data-hydrated="true"]')).toBeVisible();
		const out = await box(page, '#outdoors');
		const ga = await box(page, '#getting-around');
		expect(Math.abs(out.y - ga.y)).toBeLessThanOrEqual(4);
		expect(out.x).toBeLessThan(ga.x);
		expect(out.width).toBeGreaterThan(ga.width);
		const path = page.locator('#outdoors [data-card="forecast"] svg path').first();
		await expect(path).toHaveAttribute('d', /\S/);
		await expect(page.locator('#outdoors [data-card-source]')).toHaveCount(4);
		await expect(page.locator('#outdoors [data-card="ground"]')).toContainText('None near');
		await expect(page.locator('#outdoors [data-row="air"]')).toContainText('14 · Good');
		await expect(page.locator('#outdoors [data-card="ground"] [data-card-source]')).toContainText(
			'AirNow · as of'
		);
		await expect(page.locator('#outdoors [data-card="surf"]')).toContainText(
			'Open-Meteo marine forecast'
		);
		const dir = process.env.SHOTS_DIR;
		if (dir) await page.locator('#outdoors').screenshot({ path: `${dir}/outdoors-1440.png` });
	});
});

/** Cost's reads with real shapes (Goal 3): a gas week of 4-hourly readings, fitness with history. */
async function stubCost(page: Page) {
	const H = 3_600_000;
	const now = Date.now();
	const json = (body: unknown) => ({
		status: 200,
		contentType: 'application/json',
		body: JSON.stringify(body)
	});
	const gas = (i: number) => ({
		timestamp: new Date(now - i * 4 * H).toISOString(),
		lastSuccessfulScrapeAt: new Date(now - i * 4 * H).toISOString(),
		stationCount: 2,
		avgRegular: 6.3 + i * 0.002,
		avgMidgrade: null,
		avgPremium: 6.9,
		avgDiesel: 6.6,
		minRegular: 5.8,
		maxRegular: 6.9,
		stations: [5.9, 6.4].map((price, k) => ({
			placeId: `p${k}`,
			name: `Station ${k}`,
			address: `${k} Main St, San Rafael`,
			lat: 37.97,
			lon: -122.53,
			fuelPrices: [{ type: 'REGULAR_UNLEADED', price }]
		}))
	});
	const history = Array.from({ length: 50 }, (_, i) => gas(i));
	await page.route(/\/api\/data\/gas-prices\b/, (r) =>
		r.fulfill(json({ current: history[0], history }))
	);
	const fit = (daysAgo: number, median: number) => ({
		timestamp: new Date(now - daysAgo * 24 * H).toISOString(),
		lastSuccessfulScrapeAt: new Date(now - daysAgo * 24 * H).toISOString(),
		studioCount: 16,
		medianPrice: median,
		avgPrice: median,
		minPrice: 20,
		maxPrice: 45,
		medianByType: { yoga: 30 },
		studios: []
	});
	await page.route(/\/api\/data\/fitness\b/, (r) =>
		r.fulfill(json({ current: fit(1, 32), history: [fit(1, 32), fit(31, 31), fit(61, 30)] }))
	);
}

test.describe('desktop 1440: Cost & Character (Goal 3)', () => {
	test.use({ viewport: { width: 1440, height: 1000 } });

	test('the gas card shows a real 7-day change; sparklines render; failed reads say so', async ({
		page
	}) => {
		await stubRest(page);
		await stubCost(page);
		await stubCams(page);
		await page.goto('/?layout=v2');
		await expect(page.locator('[data-layout="v2"][data-hydrated="true"]')).toBeVisible();
		const cost = page.locator('#cost');
		const change = cost.locator('[data-card="gas"] [data-stat="change7"] [data-text-role="value"]');
		await expect(change).toHaveText(/^[+−-]\$0\.\d{3}$|—/);
		await expect(change).toHaveText('−$0.084');
		expect(await cost.locator('[data-spark] path').count()).toBeGreaterThanOrEqual(1);
		// The composite and the other sub-indexes are stubbed down: never $0.
		await expect(cost.locator('[data-card="composite"]')).toContainText('Unavailable');
		await expect(cost.locator('[data-tile="school"]')).toContainText('Unavailable');
		await expect(cost.locator('[data-card-source]').first()).toBeVisible();
		await expect(cost).not.toContainText('later release');
		const dir = process.env.SHOTS_DIR;
		if (dir) await cost.screenshot({ path: `${dir}/cost-1440.png` });
	});
});

/** News & Civic, Events and Marin Lately reads with real shapes (Goal 4). */
async function stubCivic(page: Page) {
	const H = 3_600_000;
	const now = Date.now();
	const json = (body: unknown) => ({
		status: 200,
		contentType: 'application/json',
		body: JSON.stringify(body)
	});
	const stories = Array.from({ length: 20 }, (_, i) => ({
		slug: `w${i}`,
		title: `Marin story number ${i + 1} on the county wire`,
		source: i % 2 ? SOURCES.ij : SOURCES.ptReyes,
		hoursAgo: i + 1
	}));
	const lately = [
		// The band shows only with a piece ≤ 30 days old (DASH-FLIP1).
		{ slug: 'promo', title: 'Quick Update for Our Subscribers', hoursAgo: 2 * 24 },
		{ slug: 'l1', title: 'Mother Nature Actually Kind of a Bitch', hoursAgo: 3 * 24 },
		{ slug: 'l2', title: 'Northern Spotted Owl Misgendered', hoursAgo: 40 * 24 }
	].map((l) => ({ ...l, source: SOURCES.lately }));
	await page.route('**/api/news/snapshot', (r) =>
		r.fulfill({
			status: 200,
			contentType: 'application/json',
			body: reportingSnapshot(now, [...stories, ...lately])
		})
	);
	const iso = (ms: number) => new Date(ms).toISOString();
	await page.route(/\/api\/data\/311\b/, (r) =>
		r.fulfill(
			json({
				lastUpdated: iso(now - H),
				count: 4,
				issues: ['Illegal Dumping', 'Illegal Dumping', 'Trees', 'Sidewalks'].map((summary, i) => ({
					id: 900 + i,
					status: 'Acknowledged',
					summary,
					description: 'x',
					lat: 37.97,
					lng: -122.53,
					address: `${i + 1} Fourth St, San Rafael, CA`,
					created_at: iso(now - (i * 30 + 2) * H),
					html_url: `https://seeclickfix.com/issues/${900 + i}`
				}))
			})
		)
	);
	const item = (id: string, title: string, category: string, at: number, source: string) => ({
		id,
		title,
		link: `https://events.example/${id}`,
		pubDate: iso(at),
		timestamp: at,
		source,
		category,
		verification: 'official'
	});
	await page.route(/\/api\/data\/activity\b/, (r) =>
		r.fulfill(
			json([
				item('s1', 'Jazz Night | Sweetwater', 'shows', now + 5 * H, 'Sweetwater Music Hall'),
				item('s2', 'Bluegrass Brunch', 'shows', now + 50 * H, 'Rancho Nicasio'),
				item('s3', 'Film Night', 'shows', now + 100 * H, 'Osher Marin JCC'),
				item(
					'r1',
					'Dipsea Race 2027 · Sunday, June 13, 2027',
					'endurance',
					now + 240 * 24 * H,
					'Dipsea Race'
				)
			])
		)
	);
	await page.route(/\/api\/data\/police-logs\b/, (r) =>
		r.fulfill(json([item('p1', 'ROAD CLOSURE: Grant Ave', 'safety', now - 2 * H, 'Novato PD')]))
	);
}

for (const width of [1440, 2000]) {
	test.describe(`desktop ${width}: News & Civic, Events, Marin Lately (Goal 4)`, () => {
		test.use({ viewport: { width, height: 1000 } });

		test('News and Events share a row; Lately spans the grid; no "later" placeholder', async ({
			page
		}) => {
			await stubRest(page);
			await stubCivic(page);
			await stubCams(page);
			await page.goto('/?layout=v2');
			await expect(page.locator('[data-layout="v2"][data-hydrated="true"]')).toBeVisible();
			const news = await box(page, '#news');
			const events = await box(page, '#events');
			expect(Math.abs(news.y - events.y)).toBeLessThanOrEqual(4);
			expect(news.x).toBeLessThan(events.x);
			expect(news.width).toBeGreaterThan(events.width);
			const grid = await box(page, '#sections');
			const lately = await box(page, '[data-slot="lately"]');
			expect(Math.abs(lately.width - grid.width)).toBeLessThanOrEqual(2);
			// Between Cost and News, as in the mockup.
			expect(lately.y).toBeGreaterThan((await box(page, '#cost')).y);
			expect(lately.y + lately.height).toBeLessThanOrEqual(news.y);
			await expect(page.getByText(/later release/)).toHaveCount(0);

			await expect(page.locator('#news [data-section-meta]')).toHaveText(/^\d+ of \d+ feeds OK$/);
			await expect(page.locator('#news [data-wire-row]')).toHaveCount(12);
			await expect(page.locator('#news [data-card="fixit"] [data-day]').first()).toBeVisible();
			await expect(page.locator('#events [data-show-day]')).toHaveCount(10);
			await expect(page.locator('[data-slot="lately"]')).toContainText(
				'Mother Nature Actually Kind of a Bitch'
			);
			await expect(page.locator('[data-slot="lately"]')).not.toContainText('quiet');
			await expect(page.locator('[data-slot="lately"]')).not.toContainText('Subscribers');
			await expect(page.locator('[data-slot="sources-footer"]')).toBeVisible();

			const dir = process.env.SHOTS_DIR;
			if (dir) {
				await page
					.locator('[data-slot="lately"]')
					.screenshot({ path: `${dir}/lately-${width}.png` });
				await page.locator('#news').screenshot({ path: `${dir}/news-${width}.png` });
				await page.locator('#events').screenshot({ path: `${dir}/events-${width}.png` });
			}
		});
	});
}

test.describe('narrow desktop 1100: Cost tiles four across (Goal 3)', () => {
	test.use({ viewport: { width: 1100, height: 1000 } });

	test('the sub-index tiles are four across below 1700 px', async ({ page }) => {
		await open(page);
		const cols = await page
			.locator('#cost .idx')
			.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
		expect(cols).toBe(4);
	});
});

test.describe('very wide 2600', () => {
	test.use({ viewport: { width: 2600, height: 1000 } });
	test('the page stops at 2,240 px', async ({ page }) => {
		await open(page);
		expect(Math.round((await box(page, 'main')).width)).toBe(2240);
	});
});

test.describe('narrow desktop 1100 (the mockup ≤1279 fallbacks)', () => {
	test.use({ viewport: { width: 1100, height: 900 } });
	test('brief and map stack; the wall has two columns; sections stay open with no toggle', async ({
		page
	}) => {
		await open(page);
		const cols = await page
			.locator('[data-slot="brief"]')
			.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
		expect(cols).toBe(1);
		const map = await box(page, '.v2-map-canvas');
		const latest = await box(page, '#map .v2-map-row > :last-child');
		expect(latest.y).toBeGreaterThanOrEqual(map.y + map.height - 1);
		const south = await box(page, '[data-cam-group="south"]');
		const central = await box(page, '[data-cam-group="central"]');
		expect(central.y).toBeGreaterThan(south.y + south.height - 1);
		await expect(page.locator('[data-section-toggle]')).toHaveCount(0);
		expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
			1100
		);
	});
});

test.describe('narrow desktop 1100: Outdoors and Getting Around stack (Goal 2)', () => {
	test.use({ viewport: { width: 1100, height: 1000 } });

	test('Getting Around above Outdoors, both full width', async ({ page }) => {
		await open(page);
		const out = await box(page, '#outdoors');
		const ga = await box(page, '#getting-around');
		expect(out.y).toBeGreaterThan(ga.y + ga.height - 1);
		expect(Math.abs(out.width - ga.width)).toBeLessThanOrEqual(2);
	});
});

test.describe('phone 390', () => {
	test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

	test('keeps the cam strip; no cam wall; sections still collapse', async ({ page }) => {
		await open(page);
		await expect(page.locator('section#cams .cams-row')).toBeVisible();
		await expect(page.locator('[data-slot="cam-wall"]')).toHaveCount(0);
		await expect(page.locator('[data-section-toggle="news"]')).toHaveAttribute(
			'aria-expanded',
			'false'
		);
	});
});

/** The brief's own reads with real shapes (MAPX1): 12 h of KDVO, NOAA hi/lo + hourly, marine. */
async function stubBrief(page: Page) {
	const H = 3_600_000;
	const now = Date.now();
	const json = (body: unknown) => ({
		status: 200,
		contentType: 'application/json',
		body: JSON.stringify(body)
	});
	const gmt = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ');
	await page.route(/stations\/KDVO\/observations/, (r) =>
		r.fulfill(
			json({
				features: Array.from({ length: 36 }, (_, i) => ({
					properties: {
						timestamp: new Date(now - i * 20 * 60_000).toISOString(),
						textDescription: 'Clear',
						temperature: { value: 12 + Math.sin(i / 6) * 4, qualityControl: 'V' }
					}
				}))
			})
		)
	);
	await page.route(/tidesandcurrents\.noaa\.gov/, (r) => {
		const day0 = Math.floor(now / (24 * H)) * 24 * H - 24 * H;
		const hourly =
			r.request().url().includes('interval=h&') || /interval=h$/.test(r.request().url());
		const predictions = hourly
			? Array.from({ length: 96 }, (_, i) => ({
					t: gmt(day0 + i * H),
					v: (3 + 2.5 * Math.cos((i * 2 * Math.PI) / 12.4)).toFixed(3)
				}))
			: Array.from({ length: 16 }, (_, i) => ({
					t: gmt(day0 + i * 6.2 * H),
					v: i % 2 ? '0.500' : '5.500',
					type: i % 2 ? 'L' : 'H'
				}));
		return r.fulfill(json({ predictions }));
	});
	await page.route(/api\.weather\.gov\/alerts\/active/, (r) =>
		r.fulfill(
			json({
				features: [
					{
						properties: {
							id: 'urn:oid:mapx1-beach',
							event: 'Beach Hazards Statement',
							headline: 'Beach Hazards Statement',
							description: '* WHAT...Sneaker waves.',
							instruction: 'Never turn your back on the ocean.',
							severity: 'Moderate',
							status: 'Actual',
							messageType: 'Alert',
							sent: new Date(now - H).toISOString(),
							effective: new Date(now - H).toISOString(),
							expires: new Date(now + 6 * H).toISOString(),
							ends: new Date(now + 30 * H).toISOString(),
							references: [],
							geocode: { UGC: ['CAZ505'] }
						}
					}
				]
			})
		)
	);
	await stubOutdoors(page);
}

for (const width of [1440, 2000]) {
	test.describe(`desktop ${width}: the top of the page (MAPX1)`, () => {
		test.use({ viewport: { width, height: 1000 } });

		test('the brief is compact, its three slots all answer, and the map starts high', async ({
			page
		}) => {
			await stubRest(page);
			await stubBrief(page);
			await stubCams(page);
			await page.goto('/?layout=v2');
			await expect(page.locator('[data-layout="v2"][data-hydrated="true"]')).toBeVisible();
			const brief = page.locator('[data-slot="brief"]');
			await expect(brief.locator('[data-chart="trace"] path[data-line]')).toHaveAttribute(
				'd',
				/^M/
			);
			await expect(brief.locator('[data-chart="tide"] circle[data-event]').first()).toBeVisible();
			await expect(brief.locator('[data-card="ocean"]')).toHaveAttribute('data-state', 'ok');

			// Three grid slots, each holding an answer: no empty third slot.
			const slots = brief.locator(':scope > *');
			await expect(slots).toHaveCount(3);
			for (const slot of await slots.all()) {
				const b = (await slot.boundingBox())!;
				expect(b.height).toBeGreaterThan(60);
				expect((await slot.innerText()).trim().length).toBeGreaterThan(10);
			}
			const tops = await Promise.all(
				(await slots.all()).map(async (s) => (await s.boundingBox())!.y)
			);
			expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(2);

			await expect(brief.locator('a[data-card="getting-around"]')).toBeVisible();
			const jump = page.locator('nav.v2-jump-desk');
			await expect(jump.locator('a')).toHaveCount(6);
			expect((await jump.boundingBox())!.height).toBeLessThanOrEqual(40);
			// The advisory is a chip sized to its text, never a full-width box.
			const chip = page.locator('[data-slot="advisories"] button[data-advisory]');
			await expect(chip).toContainText('Beach Hazards Statement · North Bay coast · until');
			expect((await chip.boundingBox())!.width).toBeLessThan(width / 2);

			expect((await brief.boundingBox())!.height).toBeLessThanOrEqual(260);
			if (width === 1440) expect((await box(page, '#v2-map-title')).y).toBeLessThanOrEqual(520);
		});
	});
}

test.describe('desktop 1440: the advisory reader (MAPX1)', () => {
	test.use({ viewport: { width: 1440, height: 1000 } });

	test('a chip opens the NWS text; Esc closes it and focus returns to the chip', async ({
		page
	}) => {
		await stubRest(page);
		await stubBrief(page);
		await stubCams(page);
		await page.goto('/?layout=v2');
		const chip = page.locator('[data-slot="advisories"] button[data-advisory]');
		await chip.click();
		const dialog = page.getByRole('dialog', { name: 'Beach Hazards Statement' });
		await expect(dialog).toContainText('Never turn your back on the ocean.');
		await expect(dialog.getByRole('button', { name: 'Close' })).toBeFocused();
		await page.keyboard.press('Escape');
		await expect(dialog).toHaveCount(0);
		await expect(chip).toBeFocused();
		const dir = process.env.SHOTS_DIR;
		if (dir) await page.screenshot({ path: `${dir}/mapx1-top-1440.png` });
	});
});
