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
	it('resolves true after load and decode', async () => {
		const p = preloadImage('https://x/a.jpg', 1_000);
		expect(FakeImage.last.src).toBe('https://x/a.jpg');
		FakeImage.last.onload?.();
		await expect(p).resolves.toBe(true);
	});
	it('resolves false on error', async () => {
		const p = preloadImage('https://x/a.jpg', 1_000);
		FakeImage.last.onerror?.();
		await expect(p).resolves.toBe(false);
	});
	it('resolves false when decode rejects', async () => {
		const p = preloadImage('https://x/a.jpg', 1_000);
		FakeImage.last.decodeResult = Promise.reject(new Error('bad'));
		FakeImage.last.onload?.();
		await expect(p).resolves.toBe(false);
	});
	it('resolves false on timeout and ignores a late load', async () => {
		const p = preloadImage('https://x/a.jpg', 1_000);
		const img = FakeImage.last;
		vi.advanceTimersByTime(1_001);
		await expect(p).resolves.toBe(false);
		expect(() => img.onload?.()).not.toThrow();
	});
});
