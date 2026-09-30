import { describe, it, expect, vi, beforeEach } from 'vitest';

// The request phase is the mock; the body-inclusive helper reads its response.
vi.mock('./fetch-helpers', () => {
	const fetchWithTimeout = vi.fn();
	return {
		fetchWithTimeout,
		fetchAndRead: (url: string, options: RequestInit, read: (r: Response) => Promise<unknown>) =>
			fetchWithTimeout(url, options).then(read)
	};
});

import { getGridPoint } from './nws-common';
import { fetchWithTimeout } from './fetch-helpers';

const mockFetch = vi.mocked(fetchWithTimeout);

beforeEach(() => {
	mockFetch.mockReset();
	mockFetch.mockResolvedValue({
		ok: true,
		json: () => Promise.resolve({ properties: { gridId: 'MTR', gridX: 1, gridY: 2 } })
	} as Response);
});

describe('getGridPoint owner signal (Codex PR1 C1)', () => {
	it('passes the owner signal to the /points request', async () => {
		const owner = new AbortController();
		await getGridPoint(37.1, -122.1, owner.signal);
		const [, init] = mockFetch.mock.calls[0];
		expect(init?.signal).toBe(owner.signal);
	});

	it('starts no /points request when the owner has already aborted', async () => {
		const owner = new AbortController();
		owner.abort();
		await expect(getGridPoint(37.2, -122.2, owner.signal)).rejects.toThrow();
		expect(mockFetch).not.toHaveBeenCalled();
	});
});
