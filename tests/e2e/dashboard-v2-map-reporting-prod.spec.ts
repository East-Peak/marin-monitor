import { expect, test } from '@playwright/test';
import { expectNoAlertAffordance } from './fixtures/alert-affordances';
import { probe, rendered } from './fixtures/v2-probe';

/** Production invariants for PR 9 on real data. Readiness is the ?probe hook, never wording (Codex r3 #5). */
test.skip(({ baseURL }) => !(baseURL?.startsWith('https://') ?? false), 'production only');

test('Latest reporting is bounded and labelled; the map draws owned features or says why; nothing unowned is requested', async ({
	page
}) => {
	const unowned: string[] = [];
	page.on('request', (r) => {
		if (/^\/api\/(calfire|airport-status|traffic\/events)$/.test(new URL(r.url()).pathname))
			unowned.push(r.url());
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
