import { describe, expect, it, vi } from 'vitest';
import { createRetryingLoader } from './retrying-loader';

describe('createRetryingLoader', () => {
	it('loads once and shares the result', async () => {
		const load = vi.fn(async () => 'ok');
		const get = createRetryingLoader(load);
		expect(await Promise.all([get(), get()])).toEqual(['ok', 'ok']);
		expect(await get()).toBe('ok');
		expect(load).toHaveBeenCalledTimes(1);
	});
	it('forgets a failure so the next call retries and recovers', async () => {
		const load = vi
			.fn<() => Promise<string>>()
			.mockRejectedValueOnce(new Error('Failed to fetch dynamically imported module'))
			.mockResolvedValue('ok');
		const get = createRetryingLoader(load);
		await expect(get()).rejects.toThrow('dynamically imported');
		expect(await get()).toBe('ok');
		expect(load).toHaveBeenCalledTimes(2);
	});
});
