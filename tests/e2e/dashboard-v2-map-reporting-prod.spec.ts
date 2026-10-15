import { expect, test } from '@playwright/test';
import { expectNoAlertAffordance } from './fixtures/alert-affordances';
import { probe, rendered, settled } from './fixtures/v2-probe';

/** Production invariants for PR 9 on real data. Readiness is the ?probe hook, never wording (Codex r3 #5). */
test.skip(({ baseURL }) => !(baseURL?.startsWith('https://') ?? false), 'production only');

test('Latest reporting is bounded and labelled; the map draws owned features or says why; nothing unowned is requested', async ({
	page
}) => {
	const unowned: string[] = [];
	page.on('request', (r) => {
		// airport-status is owned by Getting Around (its spec pins one request open, none closed).
		if (/^\/api\/(calfire|traffic\/events)$/.test(new URL(r.url()).pathname)) unowned.push(r.url());
	});
	await page.goto('/?layout=v2&probe');
	await expect(page.locator('[data-layout="v2"][data-hydrated="true"]')).toBeVisible();
	await expect
		.poll(
			async () => {
				const p = await probe(page);
				return !!p && p.loading.length === 0 && p.synced?.revision === p.dataRevision;
			},
			{ timeout: 45_000 }
		)
		.toBe(true);
	const p = (await probe(page))!;
	console.log(
		`live map layers ${JSON.stringify(p.layers)} counts ${JSON.stringify(p.synced!.counts)}`
	);

	// Latest reporting: rows, or a terminal explanation (empty sentence or a non-loading status).
	const region = page.locator('[data-slot="latest-reporting"]');
	const rowsL = region.locator('[data-reporting-row]');
	const metas = await rowsL.locator('.v2-news-meta').allInnerTexts();
	expect(metas.length).toBeLessThanOrEqual(5);
	if (metas.length === 0) {
		const why = region.locator(
			'[data-reporting-empty], [data-section-status]:not([data-section-status="loading"])'
		);
		await expect(why).toHaveCount(1);
		console.log(`live Latest reporting: no rows; "${await why.innerText()}"`);
	}
	for (const meta of metas) {
		expect(meta).toMatch(/^.+ · (\d+ min ago|\d+ h ago|[A-Z][a-z]{2} \d{1,2}) · .+$/);
		expect(meta).not.toMatch(/just now|\bLIVE\b/i);
	}
	await expectNoAlertAffordance(region);

	// The map: drawn features when a layer established data, else an explicit terminal status.
	const drawn =
		(p.synced!.counts['news-pins'] ?? 0) +
		(p.synced!.counts['311-reports'] ?? 0) +
		(p.synced!.counts.earthquakes ?? 0);
	if (drawn > 0) {
		await expect
			.poll(() => rendered(page, ['news-pins-layer', '311-reports-layer', 'earthquakes-layer']), {
				timeout: 20_000
			})
			.toBeGreaterThan(0);
	} else {
		await expect(page.locator('[data-slot="map-status"] [data-section-status]')).toHaveAttribute(
			'data-section-status',
			/unavailable|unknown|stale|no-match|empty/
		);
	}
	expect(p.synced!.counts['alert-pulses']).toBe(0);
	await page.waitForTimeout(2_000);
	expect(unowned).toEqual([]);
});

type TimedPart = '311' | 'earthquakes';
const MAX_AGE_MS: Record<TimedPart, number> = { earthquakes: 30 * 60_000, '311': 86_400_000 };
const FUTURE_SKEW_MS = 5 * 60_000;
const usgsTime = (v: unknown) =>
	typeof v === 'number' && v > 0 && Number.isFinite(new Date(v).getTime()) ? v : null;
const zonedTime = (v: unknown) =>
	typeof v === 'string' && /(Z|[+-]\d{2}:?\d{2})$/i.test(v) && Number.isFinite(Date.parse(v))
		? Date.parse(v)
		: null;
const iso = (t: number | null) => (t === null ? 'null' : new Date(t).toISOString());

test('311 and quakes: the map judged the browser’s own payload times, and names neither as unverified (map coverage label)', async ({
	page
}) => {
	// The browser's own responses are the evidence (Codex r1 #3, #4); the last body of each wins.
	const seen: Partial<Record<TimedPart, Promise<{ url: string; time: number | null }>>> = {};
	page.on('response', (res) => {
		const url = res.url();
		const part: TimedPart | null = /earthquake\.usgs\.gov\/fdsnws\/event\/1\/query/.test(url)
			? 'earthquakes'
			: new URL(url).pathname === '/api/data/311'
				? '311'
				: null;
		if (!part) return;
		seen[part] = res
			.json()
			.then((body) => ({
				url,
				time:
					part === 'earthquakes'
						? usgsTime(body?.metadata?.generated)
						: zonedTime(body?.lastUpdated)
			}))
			.catch(() => ({ url, time: null }));
	});
	await page.goto('/?layout=v2&probe');
	await expect(page.locator('[data-layout="v2"][data-hydrated="true"]')).toBeVisible();
	const p = await settled(page, 45_000);
	const at = Date.now();
	const quake = await seen.earthquakes;
	const fix = await seen['311'];
	const container = page.locator('[data-slot="map-status"]');
	const status =
		(await container.locator('[data-section-status]').count()) === 0
			? 'no status line'
			: await container.innerText();
	console.log(
		`live map provenance: usgs url=${quake?.url ?? 'none'} generated=${iso(quake?.time ?? null)} · 311 lastUpdated=${iso(fix?.time ?? null)} · evaluated at=${iso(at)} · map status: "${status}"`
	);

	const problems: string[] = [];
	for (const [part, read] of [
		['earthquakes', quake],
		['311', fix]
	] as const) {
		const why = !read
			? part === 'earthquakes'
				? 'no USGS response observed'
				: 'no 311 response observed'
			: read.time === null
				? 'payload time missing or invalid'
				: read.time - at > FUTURE_SKEW_MS
					? `payload time ${iso(read.time)} is in the future`
					: at - read.time > MAX_AGE_MS[part]
						? `payload time ${iso(read.time)} is older than its max age`
						: p.provenance[part].state !== 'ok' || p.provenance[part].observedAt !== read.time
							? `the app judged ${JSON.stringify(p.provenance[part])}, not ok at ${iso(read.time)}`
							: null;
		if (why) problems.push(`provenance not proven for ${part}: ${why}`);
	}
	expect(problems).toEqual([]);
	expect(status).not.toContain('Fix It Marin (311): unverified');
	expect(status).not.toContain('USGS earthquakes: unverified');
	expect(status).not.toMatch(
		/(Fix It Marin \(311\)|USGS earthquakes)( unverified|, [^·]*unverified)/
	);
});
