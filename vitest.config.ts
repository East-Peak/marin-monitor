import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(
	viteConfig,
	defineConfig({
		resolve: {
			conditions: ['browser']
		},
		test: {
			include: ['src/**/*.{test,spec}.{js,ts}'],
			environment: 'jsdom',
			globals: true,
			setupFiles: ['./vitest.setup.ts']
		}
	})
);
