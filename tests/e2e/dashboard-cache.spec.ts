// tests/e2e/dashboard-cache.spec.ts
import { expect, test, type APIRequestContext } from '@playwright/test';

test.skip(
	({ baseURL }) => !baseURL?.startsWith('https://'),
	'deployed-CDN assertions run against production only'
);

const EDGE_HIT = ['HIT', 'STALE'];

async function probe(request: APIRequestContext, path: string) {
	const res = await request.get(path);
	expect(res.status(), path).toBe(200);
	return { cache: res.headers()['x-vercel-cache'] ?? '', body: await res.text() };
}

/** `/` and a stale `?layout=` link, as HTML and as client-navigation data. */
function urls(cb: string) {
	return [
		`/?cb=${cb}`,
		`/__data.json?cb=${cb}&x-sveltekit-invalidated=01`,
		`/?cb=${cb}&layout=legacy`,
		`/__data.json?cb=${cb}&layout=legacy&x-sveltekit-invalidated=01`
	];
}

test('the seeded dashboard is edge-cached, a stale ?layout= link included', async ({ request }) => {
	for (const path of urls(`${Date.now()}`)) {
		const a = await probe(request, path);
		const b = await probe(request, path);
		if (!path.includes('__data.json')) {
			expect(a.body, path).toContain('data-layout="v2"');
			expect(a.body, path).not.toContain('LegacyDashboard');
		}
		// A seeded page is public (DASH-FLIP1); the second fetch is served from the edge.
		expect(EDGE_HIT, `${path} second fetch should be edge-cached`).toContain(b.cache);
	}
});
