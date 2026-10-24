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
/**
 * The phone audit (MOBILE1): `@phone` tests run on an iPhone (WebKit) and a Pixel (Chromium),
 * against a preview with production's flags, the lifestyle seed and a populated news snapshot
 * dated against the clock, so nothing is measured empty. Every other project skips them.
 */
const PHONE = /@phone/;
const PHONE_PORT = 4176;
export const PHONE_NEWS = 'tests/e2e/fixtures/.phone-news.json';

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
			testIgnore: [SSR_SPEC, LIFESTYLE_SPEC],
			grepInvert: PHONE
		},
		{
			name: 'lifestyle',
			use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${LIFESTYLE_PORT}` },
			testMatch: LIFESTYLE_SPEC,
			grepInvert: PHONE
		},
		{
			name: 'ssr',
			use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${SSR_PORT}` },
			testMatch: SSR_SPEC,
			grepInvert: PHONE
		},
		{
			name: 'phone-webkit',
			use: { ...devices['iPhone 13'], baseURL: `http://localhost:${PHONE_PORT}` },
			grep: PHONE
		},
		{
			name: 'phone-chromium',
			use: { ...devices['Pixel 7'], baseURL: `http://localhost:${PHONE_PORT}` },
			grep: PHONE
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
		},
		{
			command: `node tests/e2e/fixtures/phone-news.mjs ${PHONE_NEWS} && npx vite preview --port ${PHONE_PORT} --strictPort`,
			url: `http://localhost:${PHONE_PORT}`,
			env: { ...LIFESTYLE_ENV, NEWS_SNAPSHOT_FIXTURE: PHONE_NEWS },
			reuseExistingServer: false
		}
	]
});
