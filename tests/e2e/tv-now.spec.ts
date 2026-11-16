import { expect, test, type Page, type Route } from '@playwright/test';

/**
 * The TV header's "Now" is the station's observed reading (what the dashboard shows), never the
 * hourly forecast; with no usable observation it says so.
 */
test.skip(({ baseURL }) => baseURL?.startsWith('https://') ?? false, 'stubbed');

const H = 3_600_000;
const json = (route: Route, body: unknown, status = 200) =>
	route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

function hourly(tempF: number) {
	const start = Math.floor(Date.now() / H) * H;
	return {
		properties: {
			updateTime: new Date(start).toISOString(),
			periods: Array.from({ length: 24 }, (_, i) => ({
				number: i + 1,
				startTime: new Date(start + i * H).toISOString(),
				endTime: new Date(start + (i + 1) * H).toISOString(),
				temperature: tempF,
				temperatureUnit: 'F',
				windSpeed: '5 mph',
				windDirection: 'W',
				shortForecast: 'Sunny',
				isDaytime: true,
				probabilityOfPrecipitation: { unitCode: 'wmoUnit:percent', value: 10 }
			}))
		}
	};
}

async function stub(page: Page, observation: unknown[]) {
	await page.route(
		/\/api\/(transit|nps|data|feeds|article|geocode|calfire|traffic|airport-status|cams)|earthquake\.usgs\.gov/,
		(r) => r.fulfill({ status: 503, body: 'stubbed' })
	);
	await page.route(/api\.weather\.gov\/points\//, (r) =>
		json(r, { properties: { gridId: 'MTR', gridX: 83, gridY: 115 } })
	);
	await page.route(/forecast\/hourly/, (r) => json(r, hourly(57)));
	await page.route(/stations\/KDVO\/observations/, (r) => json(r, { features: observation }));
}

const report = (minutesAgo: number, celsius: number | null) => ({
	properties: {
		timestamp: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
		textDescription: 'Cloudy',
		temperature: { value: celsius, qualityControl: 'V' }
	}
});

test('Now is the observed 54, not the 57 forecast', async ({ page }) => {
	await stub(page, [report(10, 12.2)]);
	await page.goto('/tv');
	const header = page.locator('header').first();
	await expect(header).toContainText('54°F');
	await expect(header).not.toContainText('57°F');
});

test('with no usable observation the header says so and shows no forecast as Now', async ({
	page
}) => {
	await stub(page, [report(300, 12.2)]);
	await page.goto('/tv');
	await expect(page.getByText('Observation unavailable')).toBeVisible();
	await expect(page.locator('body')).not.toContainText('Now');
});
