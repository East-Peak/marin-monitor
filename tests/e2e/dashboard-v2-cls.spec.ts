import { expect, test } from '@playwright/test';
import { preparePhone } from './fixtures/phone-audit';

/**
 * Hydration and the first data move nothing, at every width (layout shift ≤ 0.1). The wide
 * jump row is in the server's HTML and CSS decides which jump nav shows, so a tablet or desktop
 * page does not drop its content when the script arrives. Runs on the phone server (production's
 * flags, a populated news snapshot), at the viewport each case sets.
 */
const WIDTHS = [
	{ name: 'phone 390', width: 390, height: 844 },
	{ name: 'tablet 1024', width: 1024, height: 768 },
	{ name: 'desktop 1440', width: 1440, height: 900 },
	{ name: 'wide 1920', width: 1920, height: 1080 }
];

for (const { name, width, height } of WIDTHS) {
	test(`@phone ${name}: hydration and the first data move nothing (layout shift ≤ 0.1)`, async ({
		browser
	}, info) => {
		test.skip(info.project.name !== 'phone-chromium', 'WebKit has no LayoutShift API');
		test.slow(); // throttled 4× and loaded: the page takes its time to arrive
		const context = await browser.newContext({
			viewport: { width, height },
			baseURL: info.project.use.baseURL
		});
		const page = await context.newPage();
		await preparePhone(page);
		await page.addInitScript(() => {
			const w = window as unknown as { __shift: number; __moved: string[] };
			w.__shift = 0;
			w.__moved = [];
			new PerformanceObserver((list) => {
				for (const e of list.getEntries() as unknown as {
					value: number;
					hadRecentInput: boolean;
					sources: { node: Element | null; previousRect: DOMRect; currentRect: DOMRect }[];
				}[]) {
					if (e.hadRecentInput) continue;
					w.__shift += e.value;
					for (const s of e.sources)
						w.__moved.push(
							`${e.value.toFixed(3)} ${s.node?.nodeName}#${s.node?.closest('[id]')?.id}.${String((s.node as HTMLElement | null)?.className).slice(0, 40)} y ${Math.round(s.previousRect.y)}→${Math.round(s.currentRect.y)} h ${Math.round(s.previousRect.height)}→${Math.round(s.currentRect.height)}`
						);
				}
			}).observe({ type: 'layout-shift', buffered: true });
		});
		// A slow device's pace: the page paints before its script has run.
		const cdp = await context.newCDPSession(page);
		await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
		await cdp.send('Network.enable');
		await cdp.send('Network.emulateNetworkConditions', {
			offline: false,
			latency: 150,
			downloadThroughput: (1.6 * 1024 * 1024) / 8,
			uploadThroughput: (750 * 1024) / 8
		});
		await page.goto('/');
		await expect(page.locator('[data-hydrated="true"][data-cycling="false"]')).toBeVisible({
			timeout: 60_000
		});
		await expect(page.locator('[data-card="weather"] [data-text-role="value"]')).toHaveText(
			'64°F',
			{
				timeout: 45_000
			}
		);
		await page.waitForTimeout(2_000);
		const { shift, moved } = await page.evaluate(() => {
			const w = window as unknown as { __shift: number; __moved: string[] };
			return { shift: w.__shift, moved: w.__moved };
		});
		await context.close();
		// What moved, when it fails.
		expect(shift, moved.join('\n')).toBeLessThanOrEqual(0.1);
	});
}
