// src/lib/components/tv/image-preload.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { preloadImage } from './image-preload';

class FakeImage {
	static last: FakeImage;
	onload: (() => void) | null = null;
	onerror: (() => void) | null = null;
	src = '';
	decodeResult: Promise<void> = Promise.resolve();
	constructor() {
		FakeImage.last = this;
	}
	decode() {
		return this.decodeResult;
	}
}

beforeEach(() => {
	vi.useFakeTimers();
	vi.stubGlobal('Image', FakeImage);
});
afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe('preloadImage', () => {
	it('resolves the decoded element itself after load and decode', async () => {
		const p = preloadImage('https://x/a.jpg', 1_000);
		expect(FakeImage.last.src).toBe('https://x/a.jpg');
		FakeImage.last.onload?.();
		await expect(p).resolves.toBe(FakeImage.last);
	});
	it('resolves null on error', async () => {
		const p = preloadImage('https://x/a.jpg', 1_000);
		FakeImage.last.onerror?.();
		await expect(p).resolves.toBeNull();
	});
	it('resolves null when decode rejects', async () => {
		const p = preloadImage('https://x/a.jpg', 1_000);
		FakeImage.last.decodeResult = Promise.reject(new Error('bad'));
		FakeImage.last.onload?.();
		await expect(p).resolves.toBeNull();
	});
	it('resolves null on timeout and ignores a late load', async () => {
		const p = preloadImage('https://x/a.jpg', 1_000);
		const img = FakeImage.last;
		vi.advanceTimersByTime(1_001);
		await expect(p).resolves.toBeNull();
		expect(() => img.onload?.()).not.toThrow();
	});
	it('an abort resolves null, stops the download and ignores a late load (v2 Cams strip)', async () => {
		const life = new AbortController();
		const p = preloadImage('https://x/a.jpg', 1_000, life.signal);
		const img = FakeImage.last;
		life.abort();
		await expect(p).resolves.toBeNull();
		expect(img.src).toBe('');
		expect(img.onload).toBeNull();
	});
	it('with a signal, a timeout also stops the download; without one (TV) the src is left as is', async () => {
		const life = new AbortController();
		const strip = preloadImage('https://x/s.jpg', 1_000, life.signal);
		const stripImg = FakeImage.last;
		const tv = preloadImage('https://x/t.jpg', 1_000);
		const tvImg = FakeImage.last;
		vi.advanceTimersByTime(1_001);
		await expect(strip).resolves.toBeNull();
		await expect(tv).resolves.toBeNull();
		expect(stripImg.src).toBe('');
		expect(tvImg.src).toBe('https://x/t.jpg');
	});
	it('an already-aborted signal starts no download', async () => {
		const life = new AbortController();
		life.abort();
		const before = FakeImage.last;
		await expect(preloadImage('https://x/b.jpg', 1_000, life.signal)).resolves.toBeNull();
		expect(FakeImage.last).toBe(before);
	});
});
