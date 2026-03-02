import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),

	kit: {
		// Vercel adapter for server-backed API routes and secure key handling
		adapter: adapter({ runtime: 'nodejs22.x' }),
		paths: {
			base: process.env.BASE_PATH || ''
		},
		alias: {
			$lib: 'src/lib',
			$components: 'src/lib/components',
			$stores: 'src/lib/stores',
			$services: 'src/lib/services',
			$config: 'src/lib/config',
			$types: 'src/lib/types'
		}
	}
};

export default config;
