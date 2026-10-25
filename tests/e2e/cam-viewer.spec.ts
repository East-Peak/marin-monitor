import { expect, test, type Page, type Route } from '@playwright/test';
import { CAM_HOSTS, FRAME_16_9, png } from './fixtures/cams';
import { frameProblems } from './fixtures/frame-whole';

/** CAMVIEW1: the camera viewer, opened from the wall and arrowed through. */
test.skip(({ baseURL }) => baseURL?.startsWith('https://') ?? false, 'stubbed');
test.use({ viewport: { width: 1440, height: 900 } });

const T0 = Math.floor(Date.now() / 1000) * 1000;
const FULL = png(1920, 1080);
const HEADINGS = {
	headingAt: T0 - 20_000,
	cams: [
		{ id: 'alert-tam-east', az: 90, fov: 60, patrolling: false, frameAt: T0 - 60_000 },
		{ id: 'alert-tam-west', az: 300, fov: 60, patrolling: true, frameAt: T0 - 60_000 }
	]
};
const json = (route: Route, body: unknown, status = 200) =>
	route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

interface Cams {
	/** Every camera URL requested, in order. */
	seen: string[];
	full: () => string[];
	thumbs: () => string[];
}

async function stub(
	page: Page,
	opts: { fail?: (url: string, n: number) => boolean; delayMs?: number } = {}
): Promise<Cams> {
	await page.route(
		/\/api\/(data|nps|transit|airport-status|health|feeds|article|geocode|calfire|traffic)\b|\/api\/news\/snapshot|earthquake\.usgs\.gov|api\.weather\.gov|tidesandcurrents/,
		(r) => r.fulfill({ status: 503, body: 'stubbed' })
	);
	await page.route('**/api/cams/heading', (r) => json(r, HEADINGS));
	const seen: string[] = [];
	await page.route(CAM_HOSTS, async (r) => {
		const url = r.request().url();
		seen.push(url);
		const n = seen.filter((u) => u.split('?')[0] === url.split('?')[0]).length;
		if (opts.delayMs) await new Promise((res) => setTimeout(res, opts.delayMs));
		if (opts.fail?.(url, n)) return r.fulfill({ status: 404, body: 'gone' }).catch(() => {});
		const thumb = url.includes('latest-thumb');
		await r
			.fulfill({
				status: 200,
				contentType: 'image/png',
				headers: { 'access-control-allow-origin': '*' },
				body: thumb ? FRAME_16_9 : FULL
			})
			.catch(() => {}); // aborted by the page
	});
	const isFull = (u: string) => !u.includes('latest-thumb');
	return {
		seen,
		full: () => seen.filter(isFull),
		thumbs: () => seen.filter((u) => !isFull(u))
	};
}

async function open(page: Page, path = '/?layout=v2') {
	await page.goto(path);
	await expect(page.locator('[data-layout="v2"][data-hydrated="true"]')).toBeVisible();
}
const viewer = (page: Page) => page.locator('[data-cam-viewer]');
const tile = (page: Page, id: string) => page.locator(`section#cams a[data-camera-id="${id}"]`);
const camOf = (page: Page) => new URL(page.url()).searchParams.get('cam');
async function openFromTile(page: Page, id = 'alert-tam-east') {
	await tile(page, id).scrollIntoViewIfNeeded();
	await expect(tile(page, id).locator('img')).toBeVisible();
	await tile(page, id).click();
	await expect(viewer(page)).toBeVisible();
	await expect(viewer(page)).toHaveAttribute('data-camera-id', id);
}

test('a tile opens the viewer; ← → step, ↑ ↓ jump an area; the URL, the caption and the corner map follow', async ({
	page
}) => {
	await stub(page);
	await open(page);
	await openFromTile(page);
	const v = viewer(page);
	await expect(page.getByRole('dialog', { name: 'Mt. Tam East' })).toBeVisible();
	expect(camOf(page)).toBe('alert-tam-east');
	await expect(v.locator('[data-cam-viewer-live]')).toHaveText(/Mt\. Tam East, 1 of 21/);
	// The ends do nothing.
	await page.keyboard.press('ArrowLeft');
	await expect(v).toHaveAttribute('data-camera-id', 'alert-tam-east');
	await page.keyboard.press('ArrowRight');
	await expect(v).toHaveAttribute('data-camera-id', 'alert-tam-west');
	expect(camOf(page)).toBe('alert-tam-west');
	await expect(v.locator('[data-cam-viewer-live]')).toHaveText(/Mt\. Tam West, 2 of 21/);
	await expect(v.getByRole('heading', { name: 'Mt. Tam West' })).toBeVisible();
	// Sweeping: the corner map's cone is dashed, the key says so.
	await expect(v.locator('[data-cam-viewer-map]')).toHaveAttribute('data-cone', 'sweeping');
	await expect(v.locator('[data-cam-viewer-map]')).toContainText('Dashed: sweeping');
	await expect(v.locator('[data-cam-viewer-heading]').first()).toContainText(
		'Last reported heading: sweeping (patrol)'
	);
	await page.keyboard.press('ArrowDown');
	await expect(v).toHaveAttribute('data-camera-id', 'alert-san-pedro');
	await expect(v).toContainText('Central Marin');
	const here = () =>
		v.locator('circle.here').evaluate((c) => [c.getAttribute('cx'), c.getAttribute('cy')]);
	const atSanPedro = await here();
	await page.keyboard.press('ArrowUp');
	await expect(v).toHaveAttribute('data-camera-id', 'alert-tam-east');
	expect(await here()).not.toEqual(atSanPedro);
	await expect(v.locator('[data-cam-viewer-map]')).toHaveAttribute('data-cone', 'solid');
	// The credit in full, the licence and the image itself.
	await expect(v.locator('[data-cam-viewer-credit]')).toHaveText(
		'ALERTCalifornia | UC San Diego · CC BY-NC-ND 4.0'
	);
	await expect(v.getByRole('link', { name: 'CC BY-NC-ND 4.0' })).toHaveAttribute(
		'href',
		'https://creativecommons.org/licenses/by-nc-nd/4.0/'
	);
	await expect(v.getByRole('link', { name: 'Open image ↗' })).toHaveAttribute(
		'href',
		'https://cameras.alertcalifornia.org/public-camera-data/Axis-TamEast/latest-frame.jpg'
	);
	// ALERTCalifornia's capture time can't be read: the viewer says so.
	await expect(v.locator('[data-cam-viewer-time]')).toHaveText('Capture time unavailable');
	await page.screenshot({ path: '/tmp/claude-501/camview/e2e-viewer-1440.png' });
});

test('the whole frame, uncovered: CAMBAR1 passes on the viewer, nothing paints over it', async ({
	page
}) => {
	await stub(page);
	await open(page);
	await openFromTile(page);
	const img = viewer(page).locator('.viewer-img');
	expect(await frameProblems(img)).toEqual([]);
	const box = (await img.boundingBox())!;
	expect(box.width).toBeGreaterThan(1000);
	// A traffic camera's frame too, with its approximate road cone.
	for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowDown');
	await expect(viewer(page)).toHaveAttribute('data-camera-id', 'caltrans-spencer');
	await expect(viewer(page).locator('[data-cam-viewer-map]')).toHaveAttribute(
		'data-cone',
		'approximate'
	);
	await expect(viewer(page).locator('[data-cam-viewer-heading]')).toHaveText(
		'Facing N · approximate (road direction)'
	);
	expect(await frameProblems(viewer(page).locator('.viewer-img'))).toEqual([]);
});

test('Back closes, Forward reopens, Esc closes; focus returns to the tile last viewed', async ({
	page
}) => {
	await stub(page);
	await open(page);
	await openFromTile(page);
	await page.keyboard.press('ArrowRight');
	await expect(viewer(page)).toHaveAttribute('data-camera-id', 'alert-tam-west');
	await page.goBack();
	await expect(viewer(page)).toBeHidden();
	expect(camOf(page)).toBeNull();
	await expect(tile(page, 'alert-tam-west')).toBeFocused();
	await page.goForward();
	await expect(viewer(page)).toHaveAttribute('data-camera-id', 'alert-tam-west');
	await page.keyboard.press('ArrowRight');
	await page.keyboard.press('Escape');
	await expect(viewer(page)).toBeHidden();
	expect(camOf(page)).toBeNull();
	await expect(tile(page, 'alert-muir-beach')).toBeFocused();
	// Esc went back one entry, not off the page.
	expect(new URL(page.url()).pathname).toBe('/');
	// Close does the same, and Enter on a focused tile opens it.
	await page.keyboard.press('Enter');
	await expect(viewer(page)).toHaveAttribute('data-camera-id', 'alert-muir-beach');
	await viewer(page).getByRole('button', { name: 'Close' }).click();
	await expect(viewer(page)).toBeHidden();
	await expect(tile(page, 'alert-muir-beach')).toBeFocused();
});

test('a modal: focus stays inside, the page behind is inert and still', async ({ page }) => {
	await stub(page);
	await open(page);
	await openFromTile(page);
	const y0 = await page.evaluate(() => window.scrollY);
	for (let i = 0; i < 40; i++) await page.keyboard.press('Tab');
	expect(await page.evaluate(() => !!document.activeElement?.closest('[data-cam-viewer]'))).toBe(
		true
	);
	expect(
		await page.evaluate(() =>
			[...document.body.children]
				.filter((el) => !el.matches('[data-cam-viewer]'))
				.every((el) => el.hasAttribute('inert'))
		)
	).toBe(true);
	await page.mouse.wheel(0, 800);
	await page.waitForTimeout(200);
	expect(await page.evaluate(() => window.scrollY)).toBe(y0);
	await page.keyboard.press('Escape');
	expect(
		await page.evaluate(() => [...document.body.children].some((el) => el.hasAttribute('inert')))
	).toBe(false);
});

test('Cmd- or Ctrl-click still opens the image in a new tab, and no viewer', async ({
	page,
	context
}) => {
	await stub(page);
	await open(page);
	const t = tile(page, 'alert-tam-east');
	await t.scrollIntoViewIfNeeded();
	await expect(t).toHaveAttribute('target', '_blank');
	// The new tab asks for the full frame (its own request: the page's stubs don't reach it).
	await context.route(CAM_HOSTS, (r) =>
		r.fulfill({ status: 200, contentType: 'image/png', body: FULL })
	);
	const asked: string[] = [];
	context.on('request', (r) => asked.push(r.url()));
	const [popup] = await Promise.all([
		context.waitForEvent('page'),
		t.click({ modifiers: [process.platform === 'darwin' ? 'Meta' : 'Control'] })
	]);
	await expect
		.poll(() => asked.some((u) => u.endsWith('Axis-TamEast/latest-frame.jpg')))
		.toBe(true);
	await popup.close();
	await expect(viewer(page)).toBeHidden();
	expect(camOf(page)).toBeNull();
});

test('a loaded link opens there and closes without leaving the site; an unknown id is dropped', async ({
	page
}) => {
	await stub(page);
	await open(page, '/?layout=v2&cam=caltrans-580#outdoors');
	await expect(viewer(page)).toHaveAttribute('data-camera-id', 'caltrans-580');
	await page.keyboard.press('ArrowRight');
	await expect(viewer(page)).toHaveAttribute('data-camera-id', 'caltrans-ignacio');
	await page.keyboard.press('Escape');
	await expect(viewer(page)).toBeHidden();
	const url = new URL(page.url());
	expect(url.pathname).toBe('/');
	expect(url.searchParams.get('cam')).toBeNull();
	expect(url.searchParams.get('layout')).toBe('v2');
	expect(url.hash).toBe('#outdoors');
	// Reload reopens at the camera in the URL.
	await open(page, '/?layout=v2&cam=alert-bolinas');
	await page.reload();
	await expect(viewer(page)).toHaveAttribute('data-camera-id', 'alert-bolinas');
	await open(page, '/?layout=v2&cam=abc7-tam');
	await expect.poll(() => camOf(page)).toBeNull();
	await expect(viewer(page)).toBeHidden();
});

test('the thumbnail strip: loaded tiles’ thumbnails, named placeholders elsewhere; a tap jumps', async ({
	page
}) => {
	const cams = await stub(page);
	await open(page);
	await openFromTile(page);
	const strip = viewer(page).locator('[data-cam-viewer-strip]');
	const current = strip.locator('[aria-current="true"]');
	await expect(current).toHaveAttribute('data-cam-thumb', 'alert-tam-east');
	await expect(strip.locator('[data-cam-thumb="alert-tam-east"] img')).toBeVisible();
	const before = cams.thumbs().length;
	await strip.locator('[data-cam-thumb="caltrans-ignacio"]').click();
	await expect(viewer(page)).toHaveAttribute('data-camera-id', 'caltrans-ignacio');
	await expect(current).toHaveAttribute('data-cam-thumb', 'caltrans-ignacio');
	await expect(current).toBeInViewport();
	// Its highlight rings the thumbnail, outside it.
	const ring = await current.evaluate((el) => {
		const s = getComputedStyle(el);
		return { offset: parseFloat(s.outlineOffset), width: parseFloat(s.outlineWidth) };
	});
	expect(ring.offset).toBeGreaterThan(0);
	expect(ring.width).toBeGreaterThan(0);
	// The strip never asked for a thumbnail of its own.
	expect(cams.thumbs().length).toBe(before);
	// A resize while open keeps every thumbnail, with no new requests.
	const shown = await strip.locator('img').count();
	await page.setViewportSize({ width: 1100, height: 800 });
	await page.waitForTimeout(300);
	expect(await strip.locator('img').count()).toBe(shown);
	expect(
		await strip
			.locator('img')
			.evaluateAll((imgs) => (imgs as HTMLImageElement[]).every((i) => i.naturalWidth > 0))
	).toBe(true);
	expect(cams.thumbs().length).toBe(before);
});

test('a resize to a phone’s width unmounts the wall: the strip keeps its thumbnails', async ({
	page
}) => {
	const cams = await stub(page);
	await open(page);
	await tile(page, 'caltrans-spencer').scrollIntoViewIfNeeded();
	await expect(tile(page, 'caltrans-spencer').locator('img')).toBeVisible();
	await openFromTile(page);
	const strip = viewer(page).locator('[data-cam-viewer-strip]');
	const shown = await strip.locator('img').count();
	expect(shown).toBeGreaterThan(5);
	const before = cams.thumbs().length;
	// A Caltrans tile's thumbnail is a blob it fetched: the strip holds the same one.
	const spencer = strip.locator('[data-cam-thumb="caltrans-spencer"] img');
	await expect(spencer).toHaveAttribute('src', /^blob:/);
	const blob = await spencer.getAttribute('src');
	const caltransBefore = cams.full().filter((u) => u.includes('cwwp2')).length;
	await page.setViewportSize({ width: 600, height: 800 });
	await expect(page.locator('section.v2-cam-wall')).toHaveCount(0);
	await page.waitForTimeout(300);
	expect(await strip.locator('img').count()).toBe(shown);
	expect(
		await strip
			.locator('img')
			.evaluateAll((imgs) => (imgs as HTMLImageElement[]).every((i) => i.naturalWidth > 0))
	).toBe(true);
	// The phone strip's tiles were never asked to load under the viewer.
	expect(cams.thumbs().length).toBe(before);
	expect(cams.full().filter((u) => u.includes('cwwp2')).length).toBe(caltransBefore);
	// The wall's tile is gone; the blob it fetched still draws, until the viewer lets it go.
	await expect(spencer).toHaveAttribute('src', blob!);
	// A fresh <img> from the blob decodes only while it is unrevoked (CSP keeps fetch off blob:).
	const usable = (src: string) =>
		page.evaluate(
			(u) =>
				new Promise<boolean>((done) => {
					const img = new Image();
					img.onload = () => done(true);
					img.onerror = () => done(false);
					img.src = u;
				}),
			src
		);
	expect(await usable(blob!)).toBe(true);
	await page.keyboard.press('Escape');
	await expect(viewer(page)).toBeHidden();
	await expect.poll(() => usable(blob!)).toBe(false);
});

test('rapid stepping asks for no more than each camera visited, its neighbours, once; tiles pause', async ({
	page
}) => {
	const cams = await stub(page);
	await open(page);
	await openFromTile(page);
	const thumbsBefore = cams.thumbs().length;
	for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowRight');
	await expect(viewer(page)).toHaveAttribute('data-camera-id', 'alert-vision');
	await page.waitForTimeout(500);
	// The ridge cams' full frames: only the viewer asks for those (their tiles load thumbnails).
	const full = cams
		.full()
		.filter((u) => u.includes('alertcalifornia'))
		.map((u) => u.split('?')[0]);
	// Visited 13 cameras: their frames plus one neighbour beyond, each at most once.
	expect(full.length).toBeLessThanOrEqual(14);
	expect(new Set(full).size).toBe(full.length);
	expect(cams.thumbs().length).toBe(thumbsBefore);
});

test('a frame that never loads says unavailable; closing during a load is clean', async ({
	page
}) => {
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(e.message));
	await stub(page, { fail: (u) => u.includes('Axis-TamWest/latest-frame') });
	await open(page);
	await openFromTile(page);
	await page.keyboard.press('ArrowRight');
	await expect(viewer(page).locator('[data-cam-viewer-state]')).toHaveText('Frame unavailable');
	await expect(viewer(page).locator('[data-cam-viewer-time]')).toHaveText('Frame unavailable');
	await page.keyboard.press('Escape');
	expect(errors).toEqual([]);
});

test('closing during a slow load leaves nothing behind', async ({ page }) => {
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(e.message));
	await stub(page, { delayMs: 0 });
	await open(page);
	await tile(page, 'alert-tam-east').scrollIntoViewIfNeeded();
	await expect(tile(page, 'alert-tam-east').locator('img')).toBeVisible();
	await page.route(/latest-frame/, async (r) => {
		await new Promise((res) => setTimeout(res, 1500));
		await r.fulfill({ status: 200, contentType: 'image/png', body: FULL }).catch(() => {});
	});
	await tile(page, 'alert-tam-east').click();
	await expect(viewer(page).locator('[data-cam-viewer-state]')).toHaveText('Loading frame…');
	await page.keyboard.press('Escape');
	await expect(viewer(page)).toBeHidden();
	await page.waitForTimeout(2000);
	await expect(viewer(page)).toBeHidden();
	expect(errors).toEqual([]);
});

test('the open frame refreshes each minute while visible; a failed refresh keeps it, "not updating"; hidden, it stops', async ({
	page
}) => {
	let failing = false;
	const cams = await stub(page, {
		fail: (u) => failing && u.includes('Axis-TamEast/latest-frame')
	});
	await open(page);
	// Fake time from here: the viewer's timers start under it.
	await page.clock.install();
	await openFromTile(page);
	await expect(viewer(page).locator('.viewer-img')).toBeVisible();
	const tamEast = () => cams.full().filter((u) => u.includes('Axis-TamEast')).length;
	expect(tamEast()).toBe(1);
	// In 10 s steps: a request still in flight holds the next (one load per camera at a time).
	const advanceUntil = async (n: number) => {
		for (let i = 0; i < 18 && tamEast() < n; i++) {
			await page.clock.runFor(10_000);
			await page.waitForTimeout(50);
		}
		expect(tamEast()).toBe(n);
	};
	await advanceUntil(2);
	failing = true;
	await advanceUntil(3);
	await expect(viewer(page).locator('.viewer-img')).toBeVisible();
	await expect(viewer(page).locator('[data-cam-viewer-time]')).toHaveText(
		/Last received [12] min ago, not updating/
	);
	// Hidden: no refresh.
	await page.evaluate(() => {
		Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
		document.dispatchEvent(new Event('visibilitychange'));
	});
	await page.clock.runFor(5 * 60_000);
	await page.waitForTimeout(300);
	expect(tamEast()).toBe(3);
});

test('stepping to an end with the buttons keeps focus in the viewer: keys still work (Codex #1)', async ({
	page
}) => {
	await stub(page);
	await open(page);
	await openFromTile(page);
	const prev = viewer(page).getByRole('button', { name: 'Previous camera' });
	await expect(prev).toHaveAttribute('aria-disabled', 'true');
	await viewer(page).getByRole('button', { name: 'Next camera' }).click();
	await expect(viewer(page)).toHaveAttribute('data-camera-id', 'alert-tam-west');
	await prev.click();
	await expect(viewer(page)).toHaveAttribute('data-camera-id', 'alert-tam-east');
	await expect(prev).toBeFocused();
	await page.keyboard.press('Enter'); // at the start: nothing happens, focus stays
	await expect(viewer(page)).toHaveAttribute('data-camera-id', 'alert-tam-east');
	await expect(prev).toBeFocused();
	await page.keyboard.press('ArrowRight');
	await expect(viewer(page)).toHaveAttribute('data-camera-id', 'alert-tam-west');
	await page.keyboard.press('Escape');
	await expect(viewer(page)).toBeHidden();
});

test('a viewer that fails to load drops ?cam and un-pauses the tiles (Codex #4)', async ({
	page
}) => {
	await stub(page);
	await open(page);
	await tile(page, 'alert-tam-east').scrollIntoViewIfNeeded();
	await expect(tile(page, 'alert-tam-east').locator('img')).toBeVisible();
	// The viewer's chunk, and only it, can't be fetched (offline, a stale deploy).
	const chunks: string[] = [];
	await page.route(/\/_app\/immutable\/.*\.js$/, (r) => {
		chunks.push(r.request().url());
		return r.abort();
	});
	await tile(page, 'alert-tam-east').click();
	await expect.poll(() => chunks.length).toBeGreaterThan(0);
	await expect.poll(() => camOf(page)).toBeNull();
	await expect(viewer(page)).toBeHidden();
	await expect(tile(page, 'alert-tam-east')).toHaveAttribute('data-status', /live|connecting/);
});
