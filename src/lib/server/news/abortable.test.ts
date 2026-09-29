// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { abortable, createDeadline } from './abortable';

describe('abortable', () => {
	it('returns the work when it finishes first', async () => {
		expect(await abortable(Promise.resolve(7), new AbortController().signal)).toBe(7);
	});
	it('rejects when the signal aborts before a never-settling operation', async () => {
		await expect(abortable(new Promise(() => {}), AbortSignal.timeout(20))).rejects.toThrow(
			'Aborted'
		);
	});
	it('rejects immediately for an already-aborted signal', async () => {
		await expect(abortable(Promise.resolve(1), AbortSignal.abort())).rejects.toThrow();
	});
});

describe('createDeadline', () => {
	it('caps each operation by the time left minus a reserve', () => {
		let t = 1_000;
		const d = createDeadline(2_000, () => t);
		expect(d.remaining()).toBe(1_000);
		expect(d.signal(8_000, 900).aborted).toBe(false);
		t = 1_950;
		expect(d.signal(8_000, 100).aborted).toBe(true); // nothing left after the reserve
	});
});
