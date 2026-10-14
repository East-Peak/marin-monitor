import { expect, test } from '@playwright/test';
import { SETTLED_HEALTH_LABEL } from '../../src/lib/dashboard/health-labels';
import { formatAsOf } from '../../src/lib/dashboard/pacific-time';

test.skip(({ baseURL }) => !baseURL?.startsWith('https://'), 'production readback only');

test('production brief: every card answers or says why not; nothing says LIVE or just now', async ({
	page
}) => {
	await page.goto(`/?layout=v2&cb=${Date.now()}`);
	await expect(page.locator('[data-layout="v2"][data-hydrated="true"]')).toBeVisible();
	await expect(page.locator('[data-card="weather"]')).toContainText(
		/Observed at Gnoss Field \(Novato\)|Observation unavailable/,
		{ timeout: 30_000 }
	);
	await expect(page.locator('[data-card="rain"]')).toContainText(
		/Rain today: \d+%|Rain chance unknown|Forecast unavailable/,
		{ timeout: 30_000 }
	);
	await expect(page.locator('[data-card="tide"]')).toContainText(
		/(Point Reyes|San Francisco) · NOAA prediction|Tide predictions unavailable/,
		{ timeout: 30_000 }
	);
	// The same pattern the unit test proves every settled label matches, "Sources: degraded" included (Codex r2 #6).
	await expect(page.getByRole('button', { name: SETTLED_HEALTH_LABEL })).toBeVisible({
		timeout: 30_000
	});
	for (const card of await page.locator('[data-card]').all()) {
		expect(await card.getAttribute('data-state')).toMatch(
			/^(loading|ok|stale|unavailable|unknown)$/
		);
	}
	expect(await page.locator('main').innerText()).not.toMatch(/\bLIVE\b|just now|all clear/i);
});

interface Report {
	at: number;
	iso: string;
	c: number | null;
	qc: string;
}

const MAX_AGE_MS = 90 * 60_000;
const usable = (r: Report) => r.c !== null && !['X', 'Q', 'B'].includes(r.qc);

/** Decisions 2 and 4, written independently of `chooseObservation`. */
function expectedPick(reports: readonly Report[], now: number): Report | null {
	const seen = reports.filter((r) => r.at <= now + 5 * 60_000).sort((a, b) => b.at - a.at);
	return seen.find((r) => usable(r) && now - r.at <= MAX_AGE_MS) ?? seen[0] ?? null;
}

test('production weather card agrees with the browser’s own KDVO observation list', async ({
	page
}) => {
	const list = new Promise<{ url: string; body: { features?: unknown } }>((resolve) => {
		page.on('response', async (response) => {
			if (!/stations\/KDVO\/observations\?/.test(response.url())) return;
			try {
				resolve({ url: response.url(), body: await response.json() });
			} catch {
				// Not a JSON body; keep waiting for one.
			}
		});
	});
	await page.goto(`/?layout=v2&cb=${Date.now()}`);
	const card = page.locator('[data-card="weather"]');
	await expect(card).toContainText(/Observed at Gnoss Field \(Novato\)|Observation unavailable/, {
		timeout: 30_000
	});
	const seen = await Promise.race([list, page.waitForTimeout(5_000).then(() => null)]);
	if (!seen)
		throw new Error('weather provenance not proven: no observations-list response observed');

	const now = Date.now();
	const features = Array.isArray(seen.body.features) ? seen.body.features : [];
	const reports: Report[] = features.flatMap((f) => {
		const p = (f as { properties?: Record<string, unknown> })?.properties;
		const iso = typeof p?.timestamp === 'string' ? p.timestamp : '';
		const at = Date.parse(iso);
		if (!Number.isFinite(at)) return [];
		const t = p?.temperature as { value?: unknown; qualityControl?: unknown } | undefined;
		const c = typeof t?.value === 'number' && Number.isFinite(t.value) ? t.value : null;
		return [{ at, iso, c, qc: String(t?.qualityControl) }];
	});
	const newest = [...reports].sort((a, b) => b.at - a.at)[0];
	const inWindow = expectedPick(reports, now);
	const value = card.locator('[data-text-role="value"]');
	const meta = card.locator('[data-text-role="meta"]').first();
	const cardText = (await card.innerText()).replace(/\s+/g, ' ').trim();
	console.log(
		`live weather provenance: list url=${seen.url} newest=${newest ? `${newest.iso} ${newest.c} ${newest.qc}` : 'none'}` +
			` · usable-in-90m=${inWindow && usable(inWindow) && now - inWindow.at <= MAX_AGE_MS ? inWindow.iso : 'none'}` +
			` · evaluated at=${new Date(now).toISOString()} · card: "${cardText}"`
	);

	// The page judged the list a moment before `now`; near the 90-min edge either pick is right.
	const picks = [
		expectedPick(reports, now - 60_000),
		inWindow,
		expectedPick(reports, now + 60_000)
	];
	if (new Set(picks.map((r) => r?.iso)).size > 1)
		console.log('weather pick sits within 60 s of the bound');
	if (!inWindow) {
		await expect(meta).toHaveText('Observation unavailable');
		return;
	}
	const shown = (r: Report) => ({
		value: usable(r) ? `${Math.round((r.c! * 9) / 5 + 32)}°F` : 'Temperature unknown',
		meta: `Observed at Gnoss Field (Novato) · ${formatAsOf(r.at, now)}`
	});
	const actual = { value: (await value.innerText()).trim(), meta: (await meta.innerText()).trim() };
	expect(
		picks.some(
			(r) => r && actual.value === shown(r).value && actual.meta.startsWith(shown(r).meta)
		),
		`card ${JSON.stringify(actual)} disagrees with the list's pick ${JSON.stringify(shown(inWindow))}`
	).toBe(true);
});
