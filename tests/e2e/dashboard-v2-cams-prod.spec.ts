import { expect, test } from '@playwright/test';

test.skip(({ baseURL }) => !baseURL?.startsWith('https://'), 'production only');

for (const [w, h] of [
	[390, 844],
	[1440, 900]
] as const) {
	test(`live Cams strip at ${w}: ridge cams first, a decoded picture, no broken image`, async ({
		page
	}) => {
		test.setTimeout(90_000); // two bounded 30 s waits plus navigation (Codex r7 #1)
		await page.setViewportSize({ width: w, height: h });
		await page.goto('/?layout=v2');
		await expect(page.locator('[data-layout="v2"][data-hydrated="true"]')).toBeVisible();
		const strip = page.locator('section#cams');
		await expect(strip.locator('[data-camera-id]').first()).toHaveAttribute(
			'data-camera-id',
			'alert-tam-east'
		);
		const decoded = () =>
			strip
				.locator('img')
				.evaluateAll(
					(imgs) =>
						(imgs as HTMLImageElement[]).filter((i) => i.complete && i.naturalWidth > 0).length
				);
		await expect.poll(decoded, { timeout: 30_000 }).toBeGreaterThan(0);
		const broken = await strip
			.locator('img')
			.evaluateAll(
				(imgs) =>
					(imgs as HTMLImageElement[]).filter((i) => !(i.complete && i.naturalWidth > 0)).length
			);
		expect(broken).toBe(0);
		await page.screenshot({ path: `/tmp/claude-501/dash-cams-${w}.png` });
		if (w === 1440) {
			await page.locator('[data-cam-slot="caltrans-spencer"]').scrollIntoViewIfNeeded();
			const t = page.locator('[data-camera-id="caltrans-spencer"]');
			await expect(t).toHaveAttribute('data-status', /live|stale|offline/, { timeout: 30_000 });
			console.log(
				'caltrans-spencer:',
				await t.getAttribute('data-status'),
				'|',
				await t.locator('[data-cam-meta]').textContent()
			);
		}
	});
}
