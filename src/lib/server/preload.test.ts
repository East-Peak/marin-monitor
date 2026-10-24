import { describe, expect, it } from 'vitest';
import { preloadAsset } from './preload';

describe('preloadAsset (what the HTML asks the browser to fetch early)', () => {
	it('keeps SvelteKit’s default: every script and stylesheet', () => {
		expect(preloadAsset({ type: 'js', path: '/_app/immutable/nodes/2.x.js' })).toBe(true);
		expect(preloadAsset({ type: 'css', path: '/_app/immutable/assets/0.x.css' })).toBe(true);
	});
	it('adds the text font, Outfit’s Latin file, so the first paint is already in it (MOBILE1)', () => {
		expect(
			preloadAsset({
				type: 'font',
				path: '/_app/immutable/assets/outfit-latin-wght-normal.Bc-8i84L.woff2'
			})
		).toBe(true);
		expect(
			preloadAsset({
				type: 'font',
				path: '/_app/immutable/assets/outfit-latin-ext-wght-normal.x.woff2'
			})
		).toBe(false);
	});
	it('nothing else', () => {
		expect(preloadAsset({ type: 'asset', path: '/_app/immutable/assets/x.png' })).toBe(false);
	});
});
