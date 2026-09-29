// src/lib/components/tv/camera-preload.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clusterForScreen, framesToPreload, preloadScreenFrames } from './camera-preload';
import { lastGoodFrame, priorFailures, resetFrameCache, versionedFrameUrl } from './camera-frame';
import { CAMERAS } from '$lib/config/cameras';

const NOW = Date.parse('2026-09-28T20:00:05.000Z');
beforeEach(() => resetFrameCache());

describe('camera preload', () => {
	it('maps camera screens to clusters and everything else to null', () => {
		expect(clusterForScreen('cameras-tam-coast')).toBe('tam-coast');
		expect(clusterForScreen('cameras-central-highway')).toBe('central-highway');
		expect(clusterForScreen('cameras-west-north')).toBe('west-north');
		expect(clusterForScreen('map-county')).toBeNull();
	});

	it('returns the exact versioned URLs the tiles will request, image cameras only, max 8', () => {
		const frames = framesToPreload('cameras-west-north', NOW);
		const expected = CAMERAS.filter((c) => c.tvCluster === 'west-north' && c.type === 'image')
			.slice(0, 8)
			.map((c) => ({ camId: c.id, url: versionedFrameUrl(c.url, c.refreshInterval, NOW) }));
		expect(frames).toEqual(expected);
		expect(frames.length).toBeLessThanOrEqual(8);
	});

	it('returns nothing for non-camera screens', () => {
		expect(framesToPreload('news-wire', NOW)).toEqual([]);
	});

	it('remembers only successfully decoded frames', async () => {
		const frames = framesToPreload('cameras-west-north', NOW);
		const decoded = new Map<string, HTMLImageElement>();
		const preload = vi.fn(async (url: string) => {
			if (url === frames[0].url) return null;
			const img = document.createElement('img');
			decoded.set(url, img);
			return img;
		});
		const ok = await preloadScreenFrames('cameras-west-north', NOW, preload);
		expect(ok).toBe(frames.length - 1);
		expect(lastGoodFrame(frames[0].camId)).toBeNull();
		expect(priorFailures(frames[0].camId)).toBe(1);
		expect(lastGoodFrame(frames[1].camId)?.url).toBe(frames[1].url);
		// The warmed element itself is retained so the tile can mount it without a refetch.
		expect(lastGoodFrame(frames[1].camId)?.img).toBe(decoded.get(frames[1].url));
	});
});
