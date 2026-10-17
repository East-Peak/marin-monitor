// tests/e2e/dashboard-cache.spec.ts
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { DEFAULT_DASHBOARD_LAYOUT } from '../../src/lib/dashboard/layout-flag';

test.skip(
	({ baseURL }) => !baseURL?.startsWith('https://'),
	'deployed-CDN assertions run against production only'
);

type Layout = 'legacy' | 'v2';
const EDGE_HIT = ['HIT', 'STALE'];

/** Which layouts a response body carries: HTML markers or the devalue-serialized data payload. */
function layoutsIn(body: string): Layout[] {
	const found: Layout[] = [];
	if (body.includes('data-layout="legacy"') || body.includes('"legacy"')) found.push('legacy');
	if (body.includes('data-layout="v2"') || body.includes('"v2"')) found.push('v2');
	return found;
}

async function probe(request: APIRequestContext, path: string) {
	const res = await request.get(path);
	expect(res.status(), path).toBe(200);
	return { cache: res.headers()['x-vercel-cache'] ?? '', layouts: layoutsIn(await res.text()) };
}

/** The default (no ?layout) and the two explicit overrides, as HTML and as client-navigation data. */
type Entry = 'default' | Layout;
const LAYOUT_OF: Record<Entry, Layout> = {
	default: DEFAULT_DASHBOARD_LAYOUT,
	legacy: 'legacy',
	v2: 'v2'
};

function urls(cb: string) {
	return {
		default: [`/?cb=${cb}`, `/__data.json?cb=${cb}&x-sveltekit-invalidated=01`],
		legacy: [
			`/?cb=${cb}&layout=legacy`,
			`/__data.json?cb=${cb}&layout=legacy&x-sveltekit-invalidated=01`
		],
		v2: [`/?cb=${cb}&layout=v2`, `/__data.json?cb=${cb}&layout=v2&x-sveltekit-invalidated=01`]
	} satisfies Record<Entry, string[]>;
}

for (const first of ['default', 'legacy', 'v2'] as const) {
	test(`HTML and __data.json keep their layout when ${first} warms the edge first`, async ({
		request
	}) => {
		const u = urls(`${Date.now()}-${first}`);
		const order: Entry[] = [
			first,
			...(['default', 'legacy', 'v2'] as const).filter((e) => e !== first)
		];
		for (const entry of order) {
			for (const path of u[entry]) {
				const a = await probe(request, path);
				const b = await probe(request, path);
				expect(a.layouts, path).toEqual([LAYOUT_OF[entry]]);
				expect(b.layouts, path).toEqual([LAYOUT_OF[entry]]);
				if (entry === 'default') {
					// Only the default is edge-cached (a default v2 needs its snapshot read, DASH-FLIP1).
					expect(EDGE_HIT, `${path} second fetch should be edge-cached`).toContain(b.cache);
				} else {
					expect(EDGE_HIT, `${path} must never be served from the edge`).not.toContain(a.cache);
					expect(EDGE_HIT, `${path} must never be served from the edge`).not.toContain(b.cache);
				}
			}
		}
	});
}

async function clientNavDataUrls(page: Page): Promise<{ v2: string; legacy: string }> {
	const seen: string[] = [];
	page.on('request', (r) => {
		if (r.url().includes('/__data.json')) seen.push(r.url());
	});
	await page.addInitScript(() => localStorage.setItem('mm_onboardingComplete', 'true'));
	await page.goto(`/?layout=v2&cb=${Date.now()}`);
	await expect(page.locator('[data-layout="v2"][data-hydrated="true"]')).toBeVisible();
	await page.getByRole('link', { name: 'Old dashboard' }).click();
	await expect(page.locator('[data-layout="legacy"]')).toBeVisible();
	await page.evaluate(() => {
		const a = document.createElement('a');
		a.href = `/?layout=v2&cb=nav${Date.now()}`;
		document.querySelector('[data-layout="legacy"]')!.append(a);
		a.click();
	});
	await expect(page.locator('[data-layout="v2"][data-hydrated="true"]')).toBeVisible();
	const v2 = seen.find((u) => u.includes('layout=v2'));
	const legacy = seen.find((u) => u.includes('layout=legacy'));
	expect(v2, 'client navigation to v2 fetched __data.json').toBeTruthy();
	expect(legacy, 'client navigation to legacy fetched __data.json').toBeTruthy();
	return { v2: v2!, legacy: legacy! };
}

test('the real client-navigation data URLs are layout-correct and never edge-served', async ({
	page,
	request
}) => {
	const { v2, legacy } = await clientNavDataUrls(page);
	for (let i = 0; i < 2; i++) {
		const d2 = await probe(request, v2);
		expect(d2.layouts).toEqual(['v2']);
		expect(EDGE_HIT).not.toContain(d2.cache);
		const dl = await probe(request, legacy);
		expect(dl.layouts).toEqual(['legacy']);
		expect(EDGE_HIT).not.toContain(dl.cache);
	}
});
