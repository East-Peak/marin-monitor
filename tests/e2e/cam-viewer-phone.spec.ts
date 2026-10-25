import { expect, test, type Page } from '@playwright/test';
import { CAM_HOSTS, FRAME_16_9, png } from './fixtures/cams';
import { frameProblems } from './fixtures/frame-whole';
import { auditTap, fingerTap, openPhone, preparePhone, swipe } from './fixtures/phone-audit';

/** CAMVIEW1 on the phone (MOBILE1's projects): swipes on the frame, taps, the map toggle. */
test.skip(() => !!process.env.PHONE_LIVE, 'stubbed cameras');

const FULL = png(1920, 1080);
const viewer = (page: Page) => page.locator('[data-cam-viewer]');
const at = (page: Page) => viewer(page).getAttribute('data-camera-id');

test.beforeEach(async ({ page }) => {
	await preparePhone(page);
	await page.route(CAM_HOSTS, (r) =>
		r
			.fulfill({
				status: 200,
				contentType: 'image/png',
				headers: { 'access-control-allow-origin': '*' },
				body: r.request().url().includes('latest-thumb') ? FRAME_16_9 : FULL
			})
			.catch(() => {})
	);
	await openPhone(page, '/', page.locator('.v2-news-title'));
	await expect(page.locator('[data-hydrated="true"]')).toBeVisible();
	const first = page.locator('a.cam-tile').first();
	await expect(first.locator('img')).toBeVisible();
	await fingerTap(page, first);
	await expect(viewer(page)).toHaveAttribute('data-camera-id', 'alert-tam-east');
	await expect(viewer(page).locator('.viewer-img')).toBeVisible();
});

/** A finger across the frame, from one fraction of it to another. */
async function swipeFrame(page: Page, from: [number, number], to: [number, number]) {
	const b = (await viewer(page).locator('[data-cam-viewer-frame]').boundingBox())!;
	const p = ([fx, fy]: [number, number]) => ({ x: b.x + b.width * fx, y: b.y + b.height * fy });
	await swipe(page, p(from), p(to), 10);
}

test('@phone the frame is whole and uncovered, full width; the map waits behind its toggle', async ({
	page
}, info) => {
	expect(await frameProblems(viewer(page).locator('.viewer-img'))).toEqual([]);
	const box = (await viewer(page).locator('.viewer-img').boundingBox())!;
	expect(box.width).toBeGreaterThan(page.viewportSize()!.width - 30);
	const map = viewer(page).locator('[data-cam-viewer-map]');
	await expect(map).toBeHidden();
	const toggle = viewer(page).getByRole('button', { name: 'Map' });
	const why = await auditTap(page, info, {
		page: 'viewer',
		state: 'open',
		control: 'corner-map toggle',
		target: toggle,
		outcome: async () => {
			await expect(map).toBeVisible();
			await expect(map.locator('circle.here')).toBeVisible();
		}
	});
	expect(why).toEqual([]);
	await map.scrollIntoViewIfNeeded();
	await page.screenshot({ path: `/tmp/claude-501/camview/e2e-phone-${info.project.name}.png` });
});

test('@phone a sideways swipe on the frame steps; a swipe down closes', async ({ page }) => {
	await swipeFrame(page, [0.85, 0.5], [0.15, 0.5]);
	await expect.poll(() => at(page)).toBe('alert-tam-west');
	await swipeFrame(page, [0.15, 0.5], [0.85, 0.5]);
	await expect.poll(() => at(page)).toBe('alert-tam-east');
	await swipeFrame(page, [0.5, 0.1], [0.5, 0.95]);
	await expect(viewer(page)).toBeHidden();
	expect(new URL(page.url()).searchParams.get('cam')).toBeNull();
});

test('@phone ‹ › are 44 px taps; scrolling the strip or the caption never steps', async ({
	page
}, info) => {
	const next = viewer(page).getByRole('button', { name: 'Next camera' });
	const prev = viewer(page).getByRole('button', { name: 'Previous camera' });
	const why = [
		...(await auditTap(page, info, {
			page: 'viewer',
			state: 'open',
			control: 'next camera',
			target: next,
			outcome: async () => expect.poll(() => at(page)).toBe('alert-tam-west')
		})),
		...(await auditTap(page, info, {
			page: 'viewer',
			state: 'open',
			control: 'previous camera',
			target: prev,
			outcome: async () => expect.poll(() => at(page)).toBe('alert-tam-east')
		}))
	];
	expect(why).toEqual([]);
	const strip = viewer(page).locator('[data-cam-viewer-strip]');
	await strip.scrollIntoViewIfNeeded();
	const b = (await strip.boundingBox())!;
	const y = b.y + b.height / 2;
	await swipe(page, { x: b.x + b.width * 0.85, y }, { x: b.x + b.width * 0.15, y }, 12);
	const caption = viewer(page).locator('[data-cam-viewer-credit]');
	const c = (await caption.boundingBox())!;
	await swipe(page, { x: c.x + 20, y: c.y + 5 }, { x: c.x + 220, y: c.y + 5 }, 8);
	await page.waitForTimeout(300);
	expect(await at(page)).toBe('alert-tam-east');
	await expect(viewer(page)).toBeVisible();
	// A thumbnail tap jumps.
	await fingerTap(page, strip.locator('[data-cam-thumb="caltrans-spencer"]'));
	await expect.poll(() => at(page)).toBe('caltrans-spencer');
});
