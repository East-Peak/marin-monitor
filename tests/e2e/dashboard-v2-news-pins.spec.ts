import { expect, test, type Page, type Route } from '@playwright/test';
import { reportingSnapshot } from './fixtures/v2-reporting';
import { settled, sourceCount } from './fixtures/v2-probe';
import { TOWN_BY_SLUG } from '../../src/lib/config/towns';

/**
 * NEWSPIN1: shows at their reviewed venues, sheriff reports counted on their towns. A venue dot
 * opens its shows; a town's reports are rows with the county's masked address as text, and the
 * county's point is never drawn.
 */
test.skip(({ baseURL }) => baseURL?.startsWith('https://') ?? false, 'stubbed');

const T0 = Math.floor(Date.now() / 1000) * 1000;
const H = 3_600_000;
const json = (route: Route, body: unknown, headers: Record<string, string> = {}) =>
	route.fulfill({
		status: 200,
		contentType: 'application/json',
		headers,
		body: JSON.stringify(body)
	});
/** An instant as the county's floating Pacific wall time. */
const wall = (ms: number) => {
	const p = Object.fromEntries(
		new Intl.DateTimeFormat('en-CA', {
			timeZone: 'America/Los_Angeles',
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			hourCycle: 'h23'
		})
			.formatToParts(ms)
			.map((x) => [x.type, x.value])
	);
	return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00.000`;
};

const show = (id: string, title: string, at: number, over: Record<string, unknown> = {}) => ({
	id,
	title,
	link: `https://www.marinjcc.org/events/${id}/`,
	pubDate: new Date(at).toISOString(),
	timestamp: at,
	source: 'Osher Marin JCC',
	category: 'shows',
	verification: 'community',
	town: 'San Rafael',
	townSlug: 'san-rafael',
	lat: 37.9994,
	lon: -122.5231,
	startSource: 'startDate',
	venueId: 'marin-jcc',
	locationText: 'Osher Marin JCC · 200 North San Pedro Road',
	...over
});
const ACTIVITY = [
	// Starts in two minutes: it leaves the list once it has started.
	show('soon', 'Israeli Folk Dance!', T0 + 2 * 60_000),
	show('adrian', 'Adrian West Band', T0 + 26 * H),
	show('yoga', 'Shabbat Yoga', T0 + 50 * H, {
		locationText: 'JCC 2nd Floor Yoga Studio · 200 N. San Pedro Rd.'
	}),
	// At another place: listed by Events, never on the JCC's dot.
	show('rodef', 'Re-Visioning Zionism', T0 + 30 * H, {
		locationText: 'Rodef Sholom Sanctuary · 170 North San Pedro Road'
	}),
	// A hub page, dated by its fetch: no start, so neither listed nor mapped.
	show('hub', 'Sausalito Seahorse calendar', T0 - H, {
		source: 'Sausalito Seahorse',
		startSource: undefined,
		venueId: undefined,
		locationText: undefined
	})
];
const SYNCED = new Date(T0 - 2 * H).toISOString();
const COUNTY_POINT = { lat: 37.998783, lon: -122.571247 };
const BLOTTER = [
	{
		unique_id: 'SO260002627',
		incident_date_time: wall(T0 - 3 * H),
		crime: 'THEFT',
		crime_class: 'THEFT',
		incident_street_address: '5XX THE ALAMEDA',
		incident_city_town: 'SLEEPY HOLLOW',
		incident_city_town_mapping: 'SAN ANSELMO',
		latitude: String(COUNTY_POINT.lat),
		longitude: String(COUNTY_POINT.lon)
	},
	{
		unique_id: 'SO260002611',
		incident_date_time: wall(T0 - 6 * H),
		crime: 'DOM VIOL',
		crime_class: 'ASSAULT',
		incident_street_address: '1XX OAK AVE',
		incident_city_town: 'SAN ANSELMO',
		incident_city_town_mapping: 'SAN ANSELMO',
		latitude: '37.9811',
		longitude: '-122.5602'
	}
];
/** Only the two NEWSPIN1 layers on: the other data layers' lists predate them. */
const ONLY_NEW_LAYERS = {
	traffic: false,
	fire: false,
	gas: false,
	ev: false,
	coffee: false,
	fitness: false,
	airport: false,
	cams: false,
	roads: false
};

async function stub(page: Page, counted: { activity: number }) {
	await page.addInitScript((layers) => {
		localStorage.setItem('mm_sections_v2', JSON.stringify({ version: 3, open: {}, layers }));
	}, ONLY_NEW_LAYERS);
	await page.route(
		/\/api\/(data|nps|transit|health|feeds|article|geocode|calfire|traffic|airport-status|cams)\b|earthquake\.usgs\.gov|api\.weather\.gov|tidesandcurrents/,
		(r) => r.fulfill({ status: 503, body: 'stubbed' })
	);
	await page.route('**/api/data/activity', (r) => {
		counted.activity++;
		return json(r, ACTIVITY, { 'X-Synced-At': SYNCED });
	});
	await page.route(/data\.marincounty\.gov\/resource\/ahxi-5nsc\.json/, (r) => json(r, BLOTTER));
	await page.route('**/api/news/snapshot', (r) =>
		r.fulfill({ status: 200, contentType: 'application/json', body: reportingSnapshot(T0, []) })
	);
}
const panel = (page: Page) => page.getByRole('complementary', { name: 'In view' });
const rows = (scope: ReturnType<Page['locator']>) =>
	scope
		.locator('[data-in-view-row]')
		.evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.inViewRow));
const layerRow = (page: Page, id: string) =>
	page.locator(`[data-layer-panel] [data-layer-row="${id}"]`);
const blotterFeatures = (page: Page) =>
	page.evaluate(() => {
		const m = (
			window as unknown as {
				__v2ProbeMap?: {
					getSource(id: string): {
						serialize(): { data: { features: { geometry: { coordinates: number[] } }[] } };
					};
				};
			}
		).__v2ProbeMap;
		return m
			?.getSource('blotter-towns')
			?.serialize()
			.data.features.map((f) => f.geometry.coordinates);
	});

test.beforeEach(async ({ page }) => {
	await page.clock.install({ time: T0 });
});

const EXPECTED_ROWS = [
	'shows:venue:marin-jcc',
	'shows:event:soon',
	'shows:event:adrian',
	'shows:event:yoga',
	'blotter:town:san-anselmo',
	'blotter:blotter-SO260002627'
];

test.describe('desktop 1440×900', () => {
	test.use({ viewport: { width: 1440, height: 900 } });

	test('a venue dot opens its shows; the rows sit under it; the Layers rows say what is placed', async ({
		page
	}) => {
		await stub(page, { activity: 0 });
		await page.goto('/?probe');
		await expect(page.locator('[data-layout="v2"][data-hydrated="true"]')).toBeVisible();
		await settled(page);
		await expect.poll(() => rows(panel(page))).toEqual(EXPECTED_ROWS);
		await page.getByRole('button', { name: 'Layers' }).click();
		await expect(layerRow(page, 'shows').locator('[data-layer-note]')).toHaveText(
			'3 shows mapped · 1 upcoming show not mapped (no confirmed venue)'
		);
		await expect(layerRow(page, 'shows').locator('[data-layer-status]')).toContainText(
			'venue calendars · as of'
		);
		await expect(layerRow(page, 'blotter').locator('[data-layer-note]')).toHaveText(
			'1 report · 1 not shown (not a property or public-place report)'
		);
		expect(await sourceCount(page, 'show-venues')).toBe(1);
		await page.keyboard.press('Escape');
		await panel(page).locator('[data-in-view-row="shows:venue:marin-jcc"]').click();
		const detail = panel(page).locator('[data-detail]');
		await expect(detail).toContainText('Osher Marin JCC · venue list');
		await expect(detail).toContainText('Adrian West Band');
		await expect(detail).toContainText('Shabbat Yoga');
		await expect(detail).not.toContainText('Re-Visioning Zionism');
	});

	test('a town’s reports: the masked address as text, a count at the town, never the county’s point', async ({
		page
	}) => {
		await stub(page, { activity: 0 });
		await page.goto('/?probe');
		await settled(page);
		await expect.poll(() => rows(panel(page))).toEqual(EXPECTED_ROWS);
		const report = panel(page).locator('[data-in-view-row="blotter:blotter-SO260002627"]');
		await expect(report).toContainText('Theft · 5XX The Alameda');
		const town = TOWN_BY_SLUG['san-anselmo'];
		expect(await blotterFeatures(page)).toEqual([[town.lon, town.lat]]);
		await report.click();
		const detail = panel(page).locator('[data-detail]');
		await expect(detail).toContainText('Theft · 5XX The Alameda');
		await expect(detail).toContainText('placed by town (the county masks addresses)');
		await expect(detail).not.toContainText('DOM');
	});

	test('a selected show that starts leaves the list and says "No longer listed"', async ({
		page
	}) => {
		await stub(page, { activity: 0 });
		await page.goto('/?probe');
		await settled(page);
		await expect.poll(() => rows(panel(page))).toEqual(EXPECTED_ROWS);
		await panel(page).locator('[data-in-view-row="shows:event:soon"]').click();
		await expect(panel(page).locator('[data-detail]')).toContainText('Israeli Folk Dance!');
		await page.clock.fastForward(3 * 60_000);
		await expect(panel(page).locator('[data-in-view-notice]')).toHaveText('No longer listed');
		await expect(panel(page).locator('[data-in-view-row="shows:event:soon"]')).toHaveCount(0);
	});

	test('a direct /map load with the Shows layer on reads the calendar, Events never opened', async ({
		page
	}) => {
		const counted = { activity: 0 };
		await stub(page, counted);
		await page.goto('/map?probe&layers=shows');
		await expect(page.locator('[data-layout="explore"][data-hydrated="true"]')).toBeVisible();
		await settled(page);
		await expect.poll(() => sourceCount(page, 'show-venues')).toBe(1);
		expect(counted.activity).toBeGreaterThan(0);
		await expect.poll(() => rows(panel(page))).toEqual(EXPECTED_ROWS.slice(0, 4));
	});
});

test.describe('phone 390×844', () => {
	test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
	const sheet = (page: Page) => page.getByRole('region', { name: 'In view' });

	test('/map: the same layers; a venue opens its shows, a town’s report its masked address', async ({
		page
	}) => {
		await stub(page, { activity: 0 });
		await page.goto('/map?probe&layers=shows,blotter#11/37.99/-122.55');
		await expect(page.locator('[data-layout="explore"][data-hydrated="true"]')).toBeVisible();
		await settled(page);
		const handle = sheet(page).locator('[data-sheet-handle]');
		await handle.focus();
		await page.keyboard.press('ArrowUp');
		await expect(handle).toHaveAttribute('aria-expanded', 'true');
		await expect.poll(() => rows(sheet(page))).toEqual(EXPECTED_ROWS);
		await sheet(page).locator('[data-in-view-row="shows:venue:marin-jcc"]').click();
		const dialog = page.getByRole('dialog');
		await expect(dialog).toContainText('Osher Marin JCC · venue list');
		await expect(dialog).toContainText('Shabbat Yoga');
		await page.keyboard.press('Escape');
		await sheet(page).locator('[data-in-view-row="blotter:blotter-SO260002627"]').click();
		await expect(page.getByRole('dialog')).toContainText('Theft · 5XX The Alameda');
		const town = TOWN_BY_SLUG['san-anselmo'];
		expect(await blotterFeatures(page)).toEqual([[town.lon, town.lat]]);
	});
});
