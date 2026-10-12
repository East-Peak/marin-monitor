import { expect, test, type Page, type Route } from '@playwright/test';
import { SOURCES, reportingSnapshot } from './fixtures/v2-reporting';
import { probe, settled } from './fixtures/v2-probe';

/**
 * §13.3 height acceptance, 390×844, 100% UI scale, frozen clock, fonts loaded. Fixtures carry
 * long titles, an advisory and failure banners (an unreadable advisory, a partial-coverage
 * line, unavailable brief cards). PRs 10–12 add the all-disclosures-open gate here.
 */
test.skip(({ baseURL }) => baseURL?.startsWith('https://') ?? false, 'stubbed');

const T0 = Math.floor(Date.now() / 1000) * 1000;
const H = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();
const json = (route: Route, body: unknown, status = 200) =>
	route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const LONG = (topic: string) =>
	`Marin County supervisors weigh a long-debated plan for ${topic}, wildfire defensible space, sea-level rise along Richardson Bay and a bond measure headed to the November ballot`;
const ADVISORY = {
	properties: {
		id: 'urn:oid:2.49.0.1.840.0.height',
		event: 'Coastal Flood Advisory',
		headline: 'Coastal Flood Advisory',
		severity: 'Minor',
		status: 'Actual',
		messageType: 'Alert',
		sent: iso(T0 - H),
		effective: iso(T0 - H),
		expires: iso(T0 + 6 * H),
		ends: iso(T0 + 9 * H),
		references: [],
		geocode: { UGC: ['CAZ506'] }
	}
};
const UNREADABLE = { properties: { ...ADVISORY.properties, id: 'urn:broken', expires: null } };

async function stub(page: Page) {
	await page.route(
		/\/api\/(data|nps|transit|airport-status|health|feeds|article|geocode)\b|earthquake\.usgs\.gov|api\.weather\.gov\/(points|gridpoints|stations)|tidesandcurrents/,
		(r) => r.fulfill({ status: 503, body: 'stubbed' })
	);
	await page.route(/api\.weather\.gov\/alerts\/active/, (r) =>
		json(r, { features: [ADVISORY, UNREADABLE] })
	);
	await page.route('**/api/news/snapshot', (r) =>
		r.fulfill({
			status: 200,
			contentType: 'application/json',
			body: reportingSnapshot(T0, [
				{ slug: 'h1', title: LONG('housing'), source: SOURCES.ij, hoursAgo: 1 },
				{ slug: 'h2', title: LONG('transit'), source: SOURCES.nbc, hoursAgo: 2 },
				{ slug: 'h3', title: LONG('schools'), source: SOURCES.ptReyes, hoursAgo: 2.5 },
				{ slug: 'h4', title: LONG('water'), source: SOURCES.pacificSun, hoursAgo: 4 },
				{ slug: 'h5', title: LONG('parks'), source: SOURCES.ij, hoursAgo: 5 }
			])
		})
	);
}

test.describe('phone 390×844', () => {
	test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

	for (const remembered of [false, true]) {
		test(`the 3rd Latest-reporting item ends ≤ 1,266 px ${remembered ? 'with every section saved open' : 'on a first visit'} (§13.3)`, async ({
			page
		}) => {
			await page.clock.install({ time: T0 });
			if (remembered) {
				await page.addInitScript(() =>
					localStorage.setItem(
						'mm_sections_v2',
						JSON.stringify({
							version: 2,
							open: {
								'getting-around': true,
								outdoors: true,
								news: true,
								cost: true,
								events: true,
								strava: true
							}
						})
					)
				);
			}
			await stub(page);
			await page.goto('/?layout=v2&probe');
			await expect(page.locator('[data-layout="v2"][data-hydrated="true"]')).toBeVisible();
			await page.evaluate(() => document.fonts.ready);
			await settled(page); // every part settled; the map drew the latest revision (Codex r3 #5)
			// The fixture content that makes the page tall must be on screen before measuring.
			await expect(page.locator('[data-slot="advisories"]')).toContainText("couldn't be read");
			await expect(page.locator('[data-slot="latest-reporting"]')).toContainText(
				'Partial coverage'
			);
			await expect(page.locator('[data-slot="map-status"] [data-section-status]')).toBeVisible();
			const rows = page.locator('[data-reporting-row]');
			await expect(rows).toHaveCount(5);
			await expect(rows.nth(2)).toContainText('schools');
			const bottom = await rows
				.nth(2)
				.evaluate((el) => el.getBoundingClientRect().bottom + window.scrollY);
			console.log(`3rd Latest-reporting item bottom: ${Math.round(bottom)} px (budget 1,266)`);
			expect(bottom).toBeLessThanOrEqual(1266);
		});
	}
});

test('the height measurement waits for a delayed brief card', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.clock.install({ time: T0 });
	await stub(page); // the file's own stub: broad fail-fast first, specific routes after
	let release!: () => void;
	const held = new Promise<void>((r) => (release = r));
	// Registered last, so it wins. The hourly forecast resolves its grid via /points first (the
	// file's stub fails that fast), so the forecast card is held at /points; the observation and
	// tides cards don't use it.
	await page.route(/api\.weather\.gov\/points/, async (r) => {
		await held;
		await r.fulfill({ status: 503, body: 'down' });
	});
	await page.goto('/?layout=v2&probe');
	await expect(page.locator('[data-layout="v2"][data-hydrated="true"]')).toBeVisible();
	// Every map source settles, but the brief's forecast card is still pending: not settled.
	await expect
		.poll(async () => (await probe(page))?.loading ?? [], { timeout: 15_000 })
		.toEqual(['brief:forecast']);
	await expect(settled(page, 3_000)).rejects.toThrow();
	release();
	const p = await settled(page);
	expect(p.loading).toEqual([]);
	await expect(page.locator('[data-card="rain"]')).toContainText("Couldn't load"); // the failure line that adds height is on screen
});
