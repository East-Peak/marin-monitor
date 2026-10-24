import { defineConfig, devices } from '@playwright/test';

/**
 * Only the SSR spec's server reads a server-side news snapshot (DASH-FLIP1). It runs on its
 * own port; every other spec's server has no seed, so their per-test browser fixtures apply.
 * It is a dev server so Svelte reports hydration mismatches.
 */
const SSR_SPEC = /(dashboard-v2|map-explore)-ssr\.spec\.ts/;
const SSR_PORT = 4174;
/**
 * The Lifestyle Index's specs run against its own preview with the flag on and an engine-written
 * seed (LIFE2); every other server has the flag off, as production does.
 */
const LIFESTYLE_SPEC = /lifestyle.*\.spec\.ts/;
const LIFESTYLE_PORT = 4175;
const LIFESTYLE_ENV = {
	NEWS_SNAPSHOT_FIXTURE: '/dev/null',
	LIFESTYLE_INDEX: 'on',
	LIFESTYLE_HIGHLIGHTS: 'on',
	LIFESTYLE_FIXTURE: 'tests/e2e/fixtures/lifestyle-index.json'
};

export default defineConfig({
	testDir: './tests/e2e',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 1 : undefined,
	reporter: 'html',
	use: {
		baseURL: 'http://localhost:4173',
		trace: 'on-first-retry'
	},
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] },
			testIgnore: [SSR_SPEC, LIFESTYLE_SPEC]
		},
		{
			name: 'lifestyle',
			use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${LIFESTYLE_PORT}` },
			testMatch: LIFESTYLE_SPEC
		},
		{
			name: 'ssr',
			use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${SSR_PORT}` },
			testMatch: SSR_SPEC
		}
	],
	webServer: [
		{
			command: 'npm run preview',
			url: 'http://localhost:4173',
			// No SSR seed, even with a local Blob token: an empty "snapshot" fails the read, so
			// the first paint is client-loaded exactly as before DASH-FLIP1.
			env: { NEWS_SNAPSHOT_FIXTURE: '/dev/null' },
			// Never reuse: a server started without this env (or another app on the port) would
			// serve live SSR news or the wrong page. A busy port fails loudly instead.
			reuseExistingServer: false
		},
		{
			command: `npx vite preview --port ${LIFESTYLE_PORT} --strictPort`,
			url: `http://localhost:${LIFESTYLE_PORT}`,
			env: LIFESTYLE_ENV,
			reuseExistingServer: false
		},
		{
			command: `npx vite dev --port ${SSR_PORT} --strictPort`,
			url: `http://localhost:${SSR_PORT}`,
			env: { NEWS_SNAPSHOT_FIXTURE: 'tests/e2e/fixtures/news-snapshot-producer.json' },
			reuseExistingServer: false,
			timeout: 120_000
		}
	]
});
