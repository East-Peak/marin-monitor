import { expect, test, type Page, type Route } from '@playwright/test';

test.skip(
	({ baseURL }) => baseURL?.startsWith('https://') ?? false,
	'stubbed; production uses dashboard-v2-brief-prod.spec.ts'
);

const T0 = Date.parse('2026-09-29T15:00:00Z'); // 8:00 AM PDT
const H = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();

function hourly(pop: (i: number) => number | null) {
	const start = Date.parse('2026-09-29T14:00:00Z'); // 7 AM PDT, 24 hours
	return {
		properties: {
			updateTime: '2026-09-29T14:30:00+00:00',
			periods: Array.from({ length: 24 }, (_, i) => ({
				number: i + 1,
				startTime: iso(start + i * H),
				endTime: iso(start + (i + 1) * H),
				temperature: 60,
				temperatureUnit: 'F',
				windSpeed: '5 mph',
				windDirection: 'W',
				shortForecast: 'Sunny',
				isDaytime: true,
				probabilityOfPrecipitation: { unitCode: 'wmoUnit:percent', value: pop(i) }
			}))
		}
	};
}
const ADVISORY = {
	properties: {
		id: 'urn:oid:2.49.0.1.840.0.test',
		event: 'Coastal Flood Advisory',
		headline: 'Coastal Flood Advisory',
		severity: 'Minor',
		status: 'Actual',
		messageType: 'Alert',
		sent: iso(T0 - H),
		effective: iso(T0 - H),
		expires: iso(T0 + 2 * 60_000),
		ends: '2026-10-01T17:00:00-07:00',
		references: [],
		geocode: { UGC: ['CAZ006', 'CAZ506'] }
	}
};
const OBSERVATION = {
	properties: {
		timestamp: '2026-09-29T14:55:00+00:00',
		textDescription: 'Clear',
		temperature: { value: 15.5, qualityControl: 'V' }
	}
};
const TIDES = {
	predictions: [
		// GMT (the v2 fetcher requests time_zone=gmt): 12:41 PM and 7:48 PM PDT.
		{ t: '2026-09-29 19:41', v: '6.287', type: 'H' },
		{ t: '2026-09-30 02:48', v: '-0.202', type: 'L' }
	]
};
const HEALTH = {
	status: 'degraded',
	acceptable: false,
	sources: [
		{
			name: 'Gas Prices',
			status: 'ok',
			reason: null,
			cadence: 'daily',
			maxAgeDays: 2,
			observedAt: iso(T0 - H),
			ageDays: 0
		},
		{
			name: 'Wine Index',
			status: 'stale',
			reason: 'older than 10d',
			cadence: 'weekly',
			maxAgeDays: 10,
			observedAt: iso(T0 - 20 * 24 * H),
			ageDays: 20
		}
	],
	subsources: [{ name: 'Pacific Sun', parent: 'News feeds', status: 'unavailable' }]
};

const json = (route: Route, body: unknown, status = 200) =>
	route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

async function stubAll(
	page: Page,
	over: {
		alerts?: (r: Route) => unknown;
		millValleyHourly?: (r: Route) => unknown;
		pop?: (i: number) => number | null;
	} = {}
) {
	// Everything the brief doesn't test fails fast (and honestly) instead of hitting the network.
	await page.route(/\/api\/(data|nps|transit)\b|\/api\/news\/snapshot|earthquake\.usgs\.gov/, (r) =>
		json(r, { status: 'unavailable', reason: 'missing' }, 503)
	);
	await page.route('**/api/health', (r) => json(r, HEALTH, 503));
	await page.route(/api\.weather\.gov\/points\//, (r) =>
		json(r, {
			properties: r.request().url().includes('37.906')
				? { gridId: 'MTR', gridX: 84, gridY: 112 }
				: { gridId: 'MTR', gridX: 83, gridY: 115 }
		})
	);
	await page.route(/gridpoints\/MTR\/83,115\/forecast\/hourly/, (r) =>
		json(r, hourly(over.pop ?? ((i) => (i === 5 ? 40 : 10))))
	);
	await page.route(
		/gridpoints\/MTR\/84,112\/forecast\/hourly/,
		over.millValleyHourly ??
			((r) =>
				json(
					r,
					hourly(() => 70)
				))
	);
	await page.route(/stations\/KDVO\/observations\/latest/, (r) => json(r, OBSERVATION));
	await page.route(
		/api\.weather\.gov\/alerts\/active/,
		over.alerts ?? ((r) => json(r, { features: [ADVISORY] }))
	);
	await page.route(/api\.tidesandcurrents\.noaa\.gov/, (r) => json(r, TIDES));
}

async function openV2(page: Page) {
	await page.goto('/?layout=v2');
	await expect(page.locator('[data-layout="v2"][data-hydrated="true"]')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
	await page.clock.install({ time: T0 });
});

test('each brief card answers with its value, scope and time', async ({ page }) => {
	await stubAll(page);
	await openV2(page);
	const weather = page.locator('[data-card="weather"]');
	await expect(weather).toContainText('60°F');
	await expect(weather).toContainText('Observed at Gnoss Field (Novato) · 7:55 AM');
	const rain = page.locator('[data-card="rain"]');
	await expect(rain).toContainText('Rain today: 40%');
	await expect(rain).toContainText('Central Marin forecast · issued 7:30 AM');
	const tide = page.locator('[data-card="tide"]');
	await expect(tide).toContainText('High 6.3 ft · 12:41 PM');
	await expect(tide).toContainText('Point Reyes · NOAA prediction');
	await expect(page.locator('main')).not.toContainText(/\bLIVE\b|just now/i);
});

test('an advisory shows with its Marin scope and leaves at expiry with no refetch', async ({
	page
}) => {
	const alertRequests: string[] = [];
	page.on('request', (r) => {
		if (r.url().includes('/alerts/active')) alertRequests.push(r.url());
	});
	await stubAll(page);
	await openV2(page);
	const row = page.locator('[data-slot="advisories"]');
	await expect(row).toContainText('Coastal Flood Advisory');
	await expect(row).toContainText('North Bay interior valleys · until Oct 1, 5:00 PM');
	expect(alertRequests).toHaveLength(1);
	expect(new URL(alertRequests[0]).searchParams.get('zone')?.split(',').sort()).toEqual([
		'CAC041',
		'CAZ502',
		'CAZ505',
		'CAZ506'
	]);
	await page.clock.runFor(3 * 60_000);
	await expect(row).toHaveCount(0);
	expect(alertRequests).toHaveLength(1);
});

test('a failed advisory fetch stays visible as "Advisories unavailable"; nothing claims all clear', async ({
	page
}) => {
	await stubAll(page, { alerts: (r) => r.fulfill({ status: 500, body: 'down' }) });
	await openV2(page);
	await expect(page.locator('[data-slot="advisories"]')).toContainText('Advisories unavailable');
	await expect(page.locator('main')).not.toContainText(/all clear|no advisories/i);
});

test('an unreadable Marin alert keeps coverage visibly degraded, never a silent "no advisories"', async ({
	page
}) => {
	const broken = { properties: { ...ADVISORY.properties, id: 'urn:broken', expires: null } };
	await stubAll(page, { alerts: (r) => json(r, { features: [broken] }) });
	await openV2(page);
	const row = page.locator('[data-slot="advisories"]');
	await expect(row).toContainText('Advisories unavailable');
	await expect(row).toContainText("1 advisory message couldn't be read");
});

test('a missing precipitation probability reads unknown, never 0%', async ({ page }) => {
	await stubAll(page, { pop: (i) => (i === 3 ? null : 10) });
	await openV2(page);
	const rain = page.locator('[data-card="rain"]');
	await expect(rain).toContainText('Rain chance unknown');
	await expect(rain).not.toContainText('%');
});

test('a failed new-town forecast keeps the old value under its old label and names the town', async ({
	page
}) => {
	await stubAll(page, { millValleyHourly: (r) => r.fulfill({ status: 500, body: 'down' }) });
	await openV2(page);
	const rain = page.locator('[data-card="rain"]');
	await expect(rain).toContainText('Central Marin forecast');
	await page.locator('[data-layout="v2"] .picker-trigger').click();
	await page.getByRole('option', { name: 'Mill Valley' }).click();
	// The service client retries twice with backoff before giving up.
	await expect(rain).toContainText("Couldn't load the Mill Valley forecast", { timeout: 20_000 });
	await expect(rain).toContainText('Central Marin forecast');
	await expect(rain).toContainText('Rain today: 40%');
	await expect(page.locator('[data-card="tide"]')).toContainText('San Francisco · NOAA prediction');
});

test('the health indicator names degraded sources from /api/health', async ({ page }) => {
	await stubAll(page);
	await openV2(page);
	const button = page.getByRole('button', { name: 'Sources: 2 degraded' });
	await expect(button).toBeVisible();
	await button.click();
	const list = page.locator('[data-health-list]');
	await expect(list).toContainText('Wine Index');
	await expect(list).toContainText('Pacific Sun');
	await expect(list).not.toContainText('Gas Prices');
});

test.describe('phone', () => {
	test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
	test('"Traffic cams & map" opens the collapsed Getting Around section, then focuses it', async ({
		page
	}) => {
		await stubAll(page);
		await openV2(page);
		const toggle = page.locator('[data-section-toggle="getting-around"]');
		await expect(toggle).toHaveAttribute('aria-expanded', 'false');
		await page.locator('[data-card="getting-around"] a').click();
		await expect(toggle).toHaveAttribute('aria-expanded', 'true');
		await expect(toggle).toBeFocused();
	});
});
