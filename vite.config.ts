import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	build: {
		// maplibre-gl is already isolated into its own dynamic vendor chunk and
		// legitimately lands above Vite's default 500 kB warning threshold.
		chunkSizeWarningLimit: 900
	}
});
