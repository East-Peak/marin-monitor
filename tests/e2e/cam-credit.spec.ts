import { expect, test, type Page } from '@playwright/test';
import { CAM_HOSTS, FRAME_16_9, stubCams } from './fixtures/cams';
import { frameProblems } from './fixtures/frame-whole';

/**
 * CAMBAR1: every ALERTCalifornia frame shows whole, and nothing of ours paints over its info
 * bar (their display rule; our use of the frames depends on honouring it).
 */
test.skip(({ baseURL }) => baseURL?.startsWith('https://') ?? false, 'stubbed');

const T0 = Math.floor(Date.now() / 1000) * 1000;
// Fresh headings for two cameras: their heading line must sit off the frame too.
const HEADINGS = {
	headingAt: T0 - 20_000,
	cams: [
		{ id: 'alert-tam-east', az: 163, fov: 62.8, patrolling: false, frameAt: T0 - 60_000 },
		{ id: 'alert-muir-beach', az: 200.2, fov: 62.8, patrolling: false, frameAt: T0 - 60_000 }
	]
};

async function openDashboard(page: Page) {
	await page.clock.install({ time: T0 });
	await page.route(
		/\/api\/(data|nps|transit|airport-status|health|feeds|article|geocode)\b|\/api\/news\/snapshot|earthquake\.usgs\.gov|api\.weather\.gov|tidesandcurrents/,
		(r) => r.fulfill({ status: 503, body: 'stubbed' })
	);
	await page.route('**/api/cams/heading', (r) =>
		r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(HEADINGS) })
	);
	await stubCams(page, { png: FRAME_16_9 });
	await page.goto('/?layout=v2');
	await expect(page.locator('[data-layout="v2"][data-hydrated="true"]')).toBeVisible();
}

async function openTvCameras(page: Page) {
	await page.route(CAM_HOSTS, (r) =>
		r.fulfill({ status: 200, contentType: 'image/png', body: FRAME_16_9 })
	);
	await page.goto('/tv');
	await expect(page.getByRole('button', { name: 'Crime & Safety' })).toBeVisible();
	await page.keyboard.press('Space'); // paused: the slide stays put while it is measured
	for (let i = 0; i < 25; i++) {
		if ((await page.locator('[data-camera-id^="alert-"]').count()) > 0) return;
		await page.keyboard.press('ArrowRight');
		await page.waitForTimeout(150);
	}
	throw new Error('no fire-camera slide reached');
}

for (const viewport of [
	{ width: 1440, height: 900 },
	{ width: 390, height: 844 }
]) {
	test.describe(`${viewport.width}×${viewport.height}`, () => {
		test.use({ viewport });

		test('dashboard: every ALERTCalifornia tile shows its whole frame, its info bar uncovered', async ({
			page
		}) => {
			test.setTimeout(90_000);
			await openDashboard(page);
			const slots = page.locator('section#cams [data-cam-slot^="alert-"]');
			const ids = await slots.evaluateAll((els) =>
				els.map((e) => (e as HTMLElement).dataset.camSlot!)
			);
			expect(ids.length).toBe(17);
			// The heading line is up before measuring (desktop; the phone's one line has no room).
			await expect(
				page.locator('[data-camera-id="alert-tam-east"] [data-cam-heading]')
			).toBeAttached();
			const found: Record<string, string[]> = {};
			for (const id of ids) {
				const slot = page.locator(`[data-cam-slot="${id}"]`);
				await slot.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'center' }));
				const problems = await frameProblems(slot.locator('img'));
				if (problems.length) found[id] = problems;
			}
			expect(found).toEqual({});
		});

		test('/tv: every ALERTCalifornia tile shows its whole frame, its info bar uncovered', async ({
			page
		}) => {
			await openTvCameras(page);
			// Every fire camera on the slide has its frame (Codex CAMBAR1 #6).
			await expect(page.locator('[data-camera-id^="alert-"]')).toHaveCount(5);
			const imgs = page.locator('[data-camera-id^="alert-"] img');
			await expect(imgs).toHaveCount(5);
			const found: Record<string, string[]> = {};
			for (let i = 0; i < (await imgs.count()); i++) {
				const problems = await frameProblems(imgs.nth(i));
				if (problems.length) found[(await imgs.nth(i).getAttribute('alt'))!] = problems;
			}
			expect(found).toEqual({});
		});
	});
}
