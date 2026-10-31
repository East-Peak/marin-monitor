import { expect, test, type Page, type Route } from '@playwright/test';
import {
	PARKING_BOILERPLATE,
	SAN_RAFAEL,
	SOURCES,
	reportingSnapshot
} from './fixtures/v2-reporting';

/**
 * The TV's header count and alert list agree on what an alert is: city boilerplate isn't one,
 * and neither is a pre-flagged item from a non-alert source, or an old or undated Nixle post.
 * One real active alert stays, so suppressing everything can't pass.
 */
test.skip(({ baseURL }) => baseURL?.startsWith('https://') ?? false, 'stubbed');

const HOUR = 3_600_000;
const nixle = (slug: string, title: string, age: number) => {
	const at = Date.now() - age;
	return {
		id: `nixle-novato-pd-${slug}`,
		title,
		link: `https://local.nixle.us/${slug}`,
		pubDate: new Date(at).toISOString(),
		timestamp: at,
		description: title,
		content: title,
		source: 'Novato PD',
		category: 'safety',
		verification: 'official',
		topics: ['public-safety', 'police-alert', 'advisory'],
		isAlert: true
	};
};
const ACTIVE = 'Grant Ave closed for a police investigation';
const POLICE_LOGS = [
	nixle('active', ACTIVE, HOUR),
	nixle('old', 'Roadway reopened in October', 72 * HOUR),
	{ ...nixle('wine', 'Wine festival road notice', HOUR), id: 'wine-festival-1' }
];

async function stub(page: Page) {
	await page.route(
		/\/api\/(transit|nps|data\/(?!police-logs)|feeds|article|geocode|calfire|traffic|airport-status|cams)|earthquake\.usgs\.gov|api\.weather\.gov/,
		(r: Route) => r.fulfill({ status: 503, body: 'stubbed' })
	);
	await page.route('**/api/data/police-logs', (r) =>
		r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(POLICE_LOGS) })
	);
	await page.route('**/api/news/snapshot', (r) =>
		r.fulfill({
			status: 200,
			contentType: 'application/json',
			body: reportingSnapshot(Date.now(), [
				{
					slug: 'parking',
					title: PARKING_BOILERPLATE,
					source: SOURCES.sanRafael,
					hoursAgo: 1,
					town: SAN_RAFAEL
				}
			])
		})
	);
}

test('the header count and the alerts shown hold only the active alert', async ({ page }) => {
	await stub(page);
	await page.goto('/tv?probe');
	await expect(page.locator('[data-screen-id]').first()).toBeVisible();
	await page.keyboard.press(' ');
	await expect(page.getByText('PAUSED', { exact: true })).toBeVisible();
	await page.locator('[data-screen-id="safety"]').click();
	await expect(page.getByText('1 alert', { exact: true })).toBeVisible();
	const shown = page.locator('.tv-screen').getByText('Alert', { exact: true });
	await expect(shown).toHaveCount(1);
	await expect(page.locator('.tv-screen')).toContainText(ACTIVE);
});
