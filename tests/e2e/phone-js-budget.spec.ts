import { expect, test } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

/**
 * MOBILE1's JS budget: each phone route's initial JS, compressed, shared chunks counted. The
 * initial set is what the server tells the browser to preload (its Link header's
 * modulepreloads, which include the entry and every shared chunk). gzip -9 stands in for the
 * CDN's compression. The budget is the post-fix size + 10%; set a new one only on purpose.
 */

const BUDGET: Record<string, number> = JSON.parse(
	readFileSync('tests/e2e/fixtures/js-budget.json', 'utf8')
);

test('@phone initial JS per route stays within its budget', async ({ request, baseURL }, info) => {
	test.skip(info.project.name !== 'phone-chromium', 'one build, measured once');
	const measured: Record<string, { bytes: number; files: number }> = {};
	for (const route of Object.keys(BUDGET)) {
		const res = await request.get(route);
		expect(res.status()).toBe(200);
		const page = new URL(route, baseURL);
		const files = [
			...new Set(
				(res.headers()['link'] ?? '')
					.split(',')
					.filter((l) => /rel="modulepreload"/.test(l))
					.map((l) => new URL(l.match(/<([^>]+)>/)![1], page).pathname)
			)
		];
		expect(files.length, `${route} preloads its JS`).toBeGreaterThan(3);
		let bytes = 0;
		for (const file of files) {
			const js = await request.get(file);
			expect(js.status(), file).toBe(200);
			bytes += gzipSync(await js.body(), { level: 9 }).length;
		}
		measured[route] = { bytes, files: files.length };
	}
	mkdirSync('test-results', { recursive: true });
	writeFileSync('test-results/js-budget.json', JSON.stringify(measured, null, 2));
	for (const [route, { bytes }] of Object.entries(measured))
		expect(bytes, `${route}: ${bytes} B gzip vs budget ${BUDGET[route]} B`).toBeLessThanOrEqual(
			BUDGET[route]
		);
});
