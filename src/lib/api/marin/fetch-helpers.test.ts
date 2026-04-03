import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchJson, fetchWithTimeout } from './fetch-helpers';

// ────────────────────────────────────────────
// Global mocks
// ────────────────────────────────────────────

const mockFetch = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();

beforeEach(() => {
	mockFetch.mockReset();
	vi.stubGlobal('fetch', mockFetch);
	vi.useFakeTimers();
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.useRealTimers();
});

// ────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

// ────────────────────────────────────────────
// fetchJson
// ────────────────────────────────────────────

describe('fetchJson', () => {
	it('returns parsed JSON on a successful response', async () => {
		const payload = { temperature: 72, unit: 'F' };
		mockFetch.mockResolvedValueOnce(jsonResponse(payload));

		const result = await fetchJson<{ temperature: number; unit: string }>('https://api.example.com/weather');

		expect(result).toEqual(payload);
		expect(mockFetch).toHaveBeenCalledOnce();
	});

	it('throws an error with HTTP status on non-OK response', async () => {
		mockFetch.mockResolvedValueOnce(new Response('Not Found', { status: 404 }));

		await expect(fetchJson('https://api.example.com/missing')).rejects.toThrow('HTTP 404');
	});

	it('throws on 500 server error', async () => {
		mockFetch.mockResolvedValueOnce(new Response('Internal Server Error', { status: 500 }));

		await expect(fetchJson('https://api.example.com/broken')).rejects.toThrow('HTTP 500');
	});

	it('passes options through to fetch', async () => {
		mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }));

		await fetchJson('https://api.example.com/data', {
			method: 'POST',
			headers: { 'X-Custom': 'value' },
			body: JSON.stringify({ key: 'val' })
		});

		const [, init] = mockFetch.mock.calls[0];
		expect(init?.method).toBe('POST');
		expect((init?.headers as Record<string, string>)['X-Custom']).toBe('value');
		expect(init?.body).toBe(JSON.stringify({ key: 'val' }));
	});

	it('attaches an AbortController signal to the fetch call', async () => {
		mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }));

		await fetchJson('https://api.example.com/data');

		const [, init] = mockFetch.mock.calls[0];
		expect(init?.signal).toBeInstanceOf(AbortSignal);
	});

	it('uses the default timeout of 10000ms', async () => {
		// fetch that never resolves — simulates a hanging request
		mockFetch.mockImplementationOnce(
			(_url, init) =>
				new Promise((_resolve, reject) => {
					init?.signal?.addEventListener('abort', () => {
						reject(new DOMException('The operation was aborted.', 'AbortError'));
					});
				})
		);

		const promise = fetchJson('https://api.example.com/slow');

		// Advance to just before the default timeout
		vi.advanceTimersByTime(9999);
		// The promise should still be pending (no rejection yet)

		// Advance past the timeout
		vi.advanceTimersByTime(1);

		await expect(promise).rejects.toThrow('aborted');
	});

	it('respects a custom timeout', async () => {
		mockFetch.mockImplementationOnce(
			(_url, init) =>
				new Promise((_resolve, reject) => {
					init?.signal?.addEventListener('abort', () => {
						reject(new DOMException('The operation was aborted.', 'AbortError'));
					});
				})
		);

		const promise = fetchJson('https://api.example.com/slow', undefined, 3000);

		// Should not have timed out at 2999ms
		vi.advanceTimersByTime(2999);

		// Should time out at 3000ms
		vi.advanceTimersByTime(1);

		await expect(promise).rejects.toThrow('aborted');
	});

	it('clears the timeout after a successful response', async () => {
		const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
		mockFetch.mockResolvedValueOnce(jsonResponse({ data: 1 }));

		await fetchJson('https://api.example.com/fast');

		expect(clearTimeoutSpy).toHaveBeenCalled();
	});

	it('clears the timeout after a failed response', async () => {
		const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
		mockFetch.mockResolvedValueOnce(new Response('Error', { status: 503 }));

		await expect(fetchJson('https://api.example.com/error')).rejects.toThrow('HTTP 503');

		expect(clearTimeoutSpy).toHaveBeenCalled();
	});

	it('propagates network errors from fetch', async () => {
		mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

		await expect(fetchJson('https://api.example.com/down')).rejects.toThrow('Failed to fetch');
	});

	it('does not merge signal when no options are provided', async () => {
		mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }));

		await fetchJson('https://api.example.com/data');

		const [url, init] = mockFetch.mock.calls[0];
		expect(url).toBe('https://api.example.com/data');
		// signal should still be present from the AbortController
		expect(init?.signal).toBeDefined();
	});
});

// ────────────────────────────────────────────
// fetchWithTimeout
// ────────────────────────────────────────────

describe('fetchWithTimeout', () => {
	it('returns the raw Response on success', async () => {
		const resp = jsonResponse({ status: 'ok' });
		mockFetch.mockResolvedValueOnce(resp);

		const result = await fetchWithTimeout('https://api.example.com/health');

		expect(result).toBe(resp);
	});

	it('returns non-OK responses without throwing', async () => {
		const resp = new Response('Bad Request', { status: 400 });
		mockFetch.mockResolvedValueOnce(resp);

		const result = await fetchWithTimeout('https://api.example.com/bad');

		expect(result.status).toBe(400);
		expect(result.ok).toBe(false);
	});

	it('attaches an AbortController signal', async () => {
		mockFetch.mockResolvedValueOnce(new Response('ok'));

		await fetchWithTimeout('https://api.example.com/data');

		const [, init] = mockFetch.mock.calls[0];
		expect(init?.signal).toBeInstanceOf(AbortSignal);
	});

	it('aborts after default 10000ms timeout', async () => {
		mockFetch.mockImplementationOnce(
			(_url, init) =>
				new Promise((_resolve, reject) => {
					init?.signal?.addEventListener('abort', () => {
						reject(new DOMException('The operation was aborted.', 'AbortError'));
					});
				})
		);

		const promise = fetchWithTimeout('https://api.example.com/slow');

		vi.advanceTimersByTime(10000);

		await expect(promise).rejects.toThrow('aborted');
	});

	it('respects a custom timeout', async () => {
		mockFetch.mockImplementationOnce(
			(_url, init) =>
				new Promise((_resolve, reject) => {
					init?.signal?.addEventListener('abort', () => {
						reject(new DOMException('The operation was aborted.', 'AbortError'));
					});
				})
		);

		const promise = fetchWithTimeout('https://api.example.com/slow', undefined, 5000);

		vi.advanceTimersByTime(4999);
		// not yet

		vi.advanceTimersByTime(1);

		await expect(promise).rejects.toThrow('aborted');
	});

	it('passes options through to fetch', async () => {
		mockFetch.mockResolvedValueOnce(new Response('ok'));

		await fetchWithTimeout('https://api.example.com/data', {
			method: 'PUT',
			headers: { Authorization: 'Bearer token' }
		});

		const [, init] = mockFetch.mock.calls[0];
		expect(init?.method).toBe('PUT');
		expect((init?.headers as Record<string, string>)['Authorization']).toBe('Bearer token');
	});

	it('clears the timeout after success', async () => {
		const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
		mockFetch.mockResolvedValueOnce(new Response('ok'));

		await fetchWithTimeout('https://api.example.com/fast');

		expect(clearTimeoutSpy).toHaveBeenCalled();
	});

	it('clears the timeout after fetch failure', async () => {
		const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
		mockFetch.mockRejectedValueOnce(new TypeError('Network error'));

		await expect(fetchWithTimeout('https://api.example.com/down')).rejects.toThrow(
			'Network error'
		);

		expect(clearTimeoutSpy).toHaveBeenCalled();
	});

	it('propagates network errors from fetch', async () => {
		mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

		await expect(fetchWithTimeout('https://api.example.com/down')).rejects.toThrow(
			'Failed to fetch'
		);
	});
});
