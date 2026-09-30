import { afterEach, describe, expect, it, vi } from 'vitest';
import { boundedOp } from './bounded-op';

afterEach(() => vi.useRealTimers());

describe('boundedOp', () => {
	it('passes a result through', async () => {
		expect(await boundedOp('x', async () => 42)).toBe(42);
	});
	it('a body that never arrives settles by the deadline, and the operation signal aborts', async () => {
		vi.useFakeTimers();
		let opSignal!: AbortSignal;
		const pending = boundedOp(
			'dataset gas',
			(signal) => {
				opSignal = signal;
				return new Promise<never>(() => {});
			},
			{ timeoutMs: 1_000 }
		);
		const expectation = expect(pending).rejects.toThrow('dataset gas: timed out after 1000 ms');
		await vi.advanceTimersByTimeAsync(1_000);
		await expectation;
		expect(opSignal.aborted).toBe(true);
	});
	it("the owner's abort settles it at once and aborts the operation", async () => {
		const owner = new AbortController();
		let opSignal!: AbortSignal;
		const pending = boundedOp(
			'brief hourly',
			(signal) => {
				opSignal = signal;
				return new Promise<never>(() => {});
			},
			{ owner: owner.signal }
		);
		owner.abort();
		await expect(pending).rejects.toThrow('brief hourly: aborted');
		expect(opSignal.aborted).toBe(true);
	});
	it('never starts work for an owner that is already gone', async () => {
		const owner = new AbortController();
		owner.abort();
		const run = vi.fn(async () => 1);
		await expect(boundedOp('x', run, { owner: owner.signal })).rejects.toThrow('x: aborted');
		expect(run).not.toHaveBeenCalled();
	});
});
