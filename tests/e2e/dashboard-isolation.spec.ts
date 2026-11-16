import { expect, test } from '@playwright/test';
import { SOURCES, reportingSnapshot } from './fixtures/v2-reporting';

test('/tv is unchanged by v2’s headline places (NEWSPIN2): it reads a Tomales Bay story and draws nothing at a place', async ({
	page
}) => {
	const BAY = 'Woman from Los Angeles dies after kayak capsizes in Tomales Bay';
	await page.addInitScript(() => localStorage.setItem('mm_onboardingComplete', 'true'));
	await page.route(
		/\/api\/(feeds|article|geocode|data|nps|transit|calfire|traffic|airport-status|cams)\b/,
		(r) => r.fulfill({ status: 503, body: 'test' })
	);
	await page.route('**/api/news/snapshot', (r) =>
		r.fulfill({
			status: 200,
			contentType: 'application/json',
			body: reportingSnapshot(Date.now(), [
				{
					slug: 'kayak',
					title: BAY,
					source: SOURCES.ij,
					hoursAgo: 2,
					town: { name: 'Tomales', slug: 'tomales' }
				}
			])
		})
	);
	await page.goto('/tv?probe');
	await page.getByRole('button', { name: 'Local News Wire' }).click();
	await expect(page.locator('h3', { hasText: BAY })).toBeVisible({ timeout: 15_000 });
	const places = () =>
		page.evaluate(() => {
			type Src = { serialize(): { data: { features: unknown[] } } };
			const m = (window as unknown as { __tvProbeMap?: { getSource(id: string): Src | undefined } })
				.__tvProbeMap;
			return m ? (m.getSource('story-places')?.serialize().data.features.length ?? 0) : null;
		});
	await expect.poll(places).toBe(0);
});
