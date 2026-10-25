/**
 * The phone tap audit (MOBILE1): every control is tapped the way a thumb would, its outcome is
 * asserted, and one row per control is written to test-results/phone-audit/<project>.jsonl.
 *
 * A row passes only when the tap lands on the control itself (nothing on top at its centre),
 * its hit area (the element plus any padding or ::after that hit-tests as it) is at least
 * 44×44 CSS px, one tap produces the outcome, and the outcome is real: content shown, a
 * navigation, a dialog. An aria-expanded flip alone is never an outcome.
 */
import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Written by phone-news.mjs when the phone server starts; SSR reads them too. */
const PHONE_NEWS = 'tests/e2e/fixtures/.phone-news.json';
const PHONE_ALERTS = 'tests/e2e/fixtures/.phone-alerts.json';
/** The app's own hosts: the phone server, and production for PHONE_LIVE. */
const APP_HOSTS = new Set(['localhost', 'marinmonitor.com']);
export const MIN_TARGET = 44;

/**
 * Client reads of the snapshot get the server's fixture too, so SSR and every refresh agree.
 * Navigations away from the app (external links) land on a blank page, so a tap's outcome can
 * be checked without loading the internet.
 */
export async function preparePhone(page: Page) {
	// Against production (PHONE_LIVE=1) its own data stands; only external navigations land blank.
	if (process.env.PHONE_LIVE) return blankAway(page);
	const snapshot = readFileSync(PHONE_NEWS, 'utf8');
	await page.route('**/api/news/snapshot', (r) =>
		r.fulfill({ contentType: 'application/json', body: `{"status":"ok","snapshot":${snapshot}}` })
	);
	const alerts = readFileSync(PHONE_ALERTS, 'utf8');
	await page.route('https://api.weather.gov/alerts/active**', (r) =>
		r.fulfill({ contentType: 'application/geo+json', body: alerts })
	);
	// The brief's weather and tide, dated to the clock: a live observation can age past its
	// limit mid-run and grow an "out of date" line, which is NWS's timing, not the page's.
	const json = (body: unknown) => ({ contentType: 'application/json', body: JSON.stringify(body) });
	const H = 3_600_000;
	const at = Date.now();
	const iso = (ms: number) => new Date(ms).toISOString();
	await page.route(/api\.weather\.gov\/points\//, (r) =>
		r.fulfill(json({ properties: { gridId: 'MTR', gridX: 83, gridY: 115 } }))
	);
	await page.route(/api\.weather\.gov\/gridpoints\/.*\/forecast\/hourly/, (r) =>
		r.fulfill(
			json({
				properties: {
					updateTime: iso(at - H),
					periods: Array.from({ length: 24 }, (_, i) => ({
						number: i + 1,
						startTime: iso(at - (at % H) + i * H),
						endTime: iso(at - (at % H) + (i + 1) * H),
						temperature: 64,
						temperatureUnit: 'F',
						windSpeed: '5 mph',
						windDirection: 'W',
						shortForecast: 'Sunny',
						isDaytime: true,
						probabilityOfPrecipitation: { unitCode: 'wmoUnit:percent', value: 10 }
					}))
				}
			})
		)
	);
	const observation = {
		properties: {
			timestamp: iso(at - 10 * 60_000),
			textDescription: 'Clear',
			temperature: { unitCode: 'wmoUnit:degC', value: 18, qualityControl: 'V' }
		}
	};
	await page.route(/api\.weather\.gov\/stations\/[^/]+\/observations\/latest/, (r) =>
		r.fulfill(json(observation))
	);
	await page.route(/api\.weather\.gov\/stations\/[^/]+\/observations\?/, (r) =>
		r.fulfill(json({ features: [observation] }))
	);
	const gmt = (ms: number) => iso(ms).slice(0, 16).replace('T', ' ');
	await page.route(/api\.tidesandcurrents\.noaa\.gov/, (r) =>
		r.fulfill(
			json({
				predictions: [
					{ t: gmt(at + 2 * H), v: '5.120', type: 'H' },
					{ t: gmt(at + 8 * H), v: '0.410', type: 'L' }
				]
			})
		)
	);
	await blankAway(page);
}

/** Navigations away from the app land on a blank page; everything else is untouched. */
async function blankAway(page: Page) {
	await page.context().route(
		(url) => !APP_HOSTS.has(url.hostname),
		(r) =>
			r.request().isNavigationRequest()
				? r.fulfill({ contentType: 'text/html', body: '<title>away</title>' })
				: r.fallback()
	);
}

/** A page is audited only once it shows what it exists to show. */
export async function openPhone(page: Page, path: string, content: Locator) {
	const res = await page.goto(path);
	expect(res?.status()).toBe(200);
	await expect(content.first()).toBeVisible({ timeout: 15_000 });
}

export interface Hit {
	/** The tap point: the centre of the control's largest line box. */
	x: number;
	y: number;
	w: number;
	h: number;
	/** The hit area, measured by hit-testing outward from the centre. */
	hitW: number;
	hitH: number;
	/** What is on top at the centre, when it isn't the control. */
	covered: string | null;
}

export async function measure(target: Locator): Promise<Hit> {
	// Centred, as a thumb scrolls a thing into comfortable view: at a scroller's edge part of
	// its hit area would be clipped and unmeasurable, though no finger taps it there.
	await target.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'nearest' }));
	// A finger meets the settled page: wait until the control's box holds across two frames
	// (a neighbour's reflow, e.g. a layer's legend closing, can still be under way).
	await target.evaluate(
		(el) =>
			new Promise<void>((done) => {
				let last = '';
				let tries = 0;
				const check = () => {
					const r = el.getBoundingClientRect();
					const now = `${r.x},${r.y},${r.width},${r.height}`;
					if ((now === last && tries > 1) || tries > 20) return done();
					last = now;
					tries++;
					requestAnimationFrame(check);
				};
				requestAnimationFrame(check);
			})
	);
	return target.evaluate((el) => {
		// A link that wraps is tapped on one of its line boxes, not between them.
		const box = (el.matches('input') && el.closest('label')) || el;
		const lines = [...box.getClientRects()];
		const r = lines.length
			? lines.reduce((a, b) => (b.width * b.height > a.width * a.height ? b : a))
			: box.getBoundingClientRect();
		const cx = r.left + r.width / 2;
		const cy = r.top + r.height / 2;
		// A checkbox or radio inside a <label> is hit anywhere on the label.
		const area = (el.matches('input') && el.closest('label')) || el;
		const mine = (x: number, y: number) => {
			const t = document.elementFromPoint(x, y);
			return !!t && (t === area || area.contains(t));
		};
		const reach = (dx: number, dy: number) => {
			let d = 0;
			while (d < 40 && mine(cx + dx * (d + 1), cy + dy * (d + 1))) d++;
			return d;
		};
		const top = document.elementFromPoint(cx, cy);
		const onTop = mine(cx, cy);
		const name = (t: Element | null) =>
			t
				? `${t.tagName.toLowerCase()}${t.className ? `.${String(t.className).split(' ')[0]}` : ''}`
				: 'nothing';
		return {
			x: cx,
			y: cy,
			w: Math.round(r.width),
			h: Math.round(r.height),
			hitW: onTop ? reach(-1, 0) + reach(1, 0) + 1 : 0,
			hitH: onTop ? reach(0, -1) + reach(0, 1) + 1 : 0,
			covered: onTop ? null : name(top)
		};
	});
}

export interface Row {
	page: string;
	state: string;
	control: string;
	device: string;
	result: 'pass' | 'fail';
	why: string[];
	hit?: Hit;
}

export function record(info: TestInfo, row: Omit<Row, 'device'>) {
	const dir = join('test-results', 'phone-audit');
	mkdirSync(dir, { recursive: true });
	appendFileSync(
		join(dir, `${info.project.name}.jsonl`),
		`${JSON.stringify({ ...row, device: info.project.name })}\n`
	);
}

export interface TapCheck {
	page: string;
	state: string;
	control: string;
	target: Locator;
	/** The real outcome, asserted with expect. */
	outcome: () => Promise<void>;
	/** Puts things back (close, navigate back); its own outcome is asserted inside. */
	undo?: () => Promise<void>;
	/** A known small target: its reason, and the floor it must still meet (CSS px). */
	smallOk?: { reason: string; min: number };
}

/**
 * Taps one control and records its row. Returns the failures, so a test can assert none
 * (or, for a control the audit found broken, declare the failure it expects).
 */
export async function auditTap(page: Page, info: TestInfo, c: TapCheck): Promise<string[]> {
	const why: string[] = [];
	const hit = await measure(c.target);
	if (hit.covered) why.push(`intercepted by ${hit.covered}`);
	// Sampled in whole pixels from a fractional centre, an exact 44 px box reads 43: 1 px slack.
	const floor = c.smallOk?.min ?? MIN_TARGET;
	if (hit.hitW < floor - 1 || hit.hitH < floor - 1) why.push(`hit area ${hit.hitW}×${hit.hitH}`);
	// A real tap at the centre: it goes to whatever is on top, exactly as a thumb's would.
	await page.touchscreen.tap(hit.x, hit.y);
	let ok = await passes(c.outcome);
	if (!ok) {
		await page.touchscreen.tap(hit.x, hit.y);
		ok = await passes(c.outcome);
		why.push(ok ? 'needed a double-tap' : 'no outcome from a tap');
	}
	if (ok && c.undo) {
		if (!(await passes(c.undo))) why.push('did not close or round-trip');
	}
	// A target let off the size check still says so in its row.
	const note = c.smallOk && (hit.hitW < MIN_TARGET - 1 || hit.hitH < MIN_TARGET - 1);
	record(info, {
		page: c.page,
		state: c.state,
		control: c.control,
		result: why.length ? 'fail' : 'pass',
		why: note ? [...why, `small, pending a ruling: ${c.smallOk!.reason}`] : why,
		hit
	});
	return why;
}

async function passes(check: () => Promise<void>) {
	try {
		await check();
		return true;
	} catch {
		return false;
	}
}

/** A finger's tap at a control's centre: whatever is on top there (its label's padding too). */
export async function fingerTap(page: Page, target: Locator) {
	const hit = await measure(target);
	await page.touchscreen.tap(hit.x, hit.y);
}

/** A swipe or drag, by touch events with intermediate moves (MapLibre and sheets need them). */
export async function swipe(
	page: Page,
	from: { x: number; y: number },
	to: { x: number; y: number },
	steps = 8
) {
	const cdp = page.context().browser()?.browserType().name() === 'chromium';
	if (!cdp) {
		// WebKit has no touch-move driver: replay what a finger produces on the element under
		// the start, pointer events (pointerType touch) and touch events both.
		await page.evaluate(
			async ({ from, to, steps }) => {
				const target = document.elementFromPoint(from.x, from.y)!;
				// One move per frame, as a finger's arrive: handlers that sample per frame see each.
				const frame = () => new Promise(requestAnimationFrame);
				// WebKit has no Touch constructor; its legacy createTouch takes page coordinates.
				const doc = document as unknown as {
					createTouch(...a: unknown[]): Touch;
					// The DOM types say Touch[]; WebKit accepts only a TouchList here.
					createTouchList(...t: Touch[]): Touch[];
				};
				const touch = (x: number, y: number) =>
					doc.createTouchList(doc.createTouch(window, target, 1, x + scrollX, y + scrollY, x, y));
				const fire = (type: string, x: number, y: number) => {
					const pointer = { start: 'pointerdown', move: 'pointermove', end: 'pointerup' }[type]!;
					target.dispatchEvent(
						new PointerEvent(pointer, {
							bubbles: true,
							cancelable: true,
							pointerId: 1,
							pointerType: 'touch',
							isPrimary: true,
							clientX: x,
							clientY: y
						})
					);
					const end = type === 'end';
					target.dispatchEvent(
						new TouchEvent(`touch${type}`, {
							bubbles: true,
							cancelable: true,
							touches: end ? doc.createTouchList() : touch(x, y),
							targetTouches: end ? doc.createTouchList() : touch(x, y),
							changedTouches: touch(x, y)
						})
					);
				};
				fire('start', from.x, from.y);
				for (let i = 1; i <= steps; i++) {
					await frame();
					fire(
						'move',
						from.x + ((to.x - from.x) * i) / steps,
						from.y + ((to.y - from.y) * i) / steps
					);
				}
				await frame();
				fire('end', to.x, to.y);
			},
			{ from, to, steps }
		);
		return;
	}
	const session = await page.context().newCDPSession(page);
	const point = (p: { x: number; y: number }) => [{ x: p.x, y: p.y, id: 1 }];
	await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(from) });
	for (let i = 1; i <= steps; i++)
		await session.send('Input.dispatchTouchEvent', {
			type: 'touchMove',
			touchPoints: point({
				x: from.x + ((to.x - from.x) * i) / steps,
				y: from.y + ((to.y - from.y) * i) / steps
			})
		});
	await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
	await session.detach();
}
