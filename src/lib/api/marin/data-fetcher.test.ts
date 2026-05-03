import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ────────────────────────────────────────────
// Mocks — must be set up before importing the module under test
// ────────────────────────────────────────────

const mockFetchWithTimeout = vi.fn<(url: string, options?: RequestInit) => Promise<Response>>();
const mockLoggerLog = vi.fn();
const mockLoggerWarn = vi.fn();

vi.mock('./fetch-helpers', () => ({
	fetchWithTimeout: (...args: unknown[]) => mockFetchWithTimeout(...(args as [string, RequestInit?]))
}));

vi.mock('$lib/config/api', () => ({
	logger: {
		log: (...args: unknown[]) => mockLoggerLog(...args),
		warn: (...args: unknown[]) => mockLoggerWarn(...args),
		error: vi.fn()
	}
}));

import { createDataFetcher, createDataFetcherWithStatus } from './data-fetcher';

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
// Tests
// ────────────────────────────────────────────

describe('createDataFetcher', () => {
	beforeEach(() => {
		mockFetchWithTimeout.mockReset();
		mockLoggerLog.mockReset();
		mockLoggerWarn.mockReset();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('returns a function', () => {
		const fetcher = createDataFetcher('/api/data/foo', 'FOO', { current: null, history: [] });
		expect(typeof fetcher).toBe('function');
	});

	it('calls the correct endpoint', async () => {
		mockFetchWithTimeout.mockResolvedValueOnce(jsonResponse({ current: 42, history: [1, 2] }));

		const fetcher = createDataFetcher('/api/data/foo', 'FOO', { current: null, history: [] });
		await fetcher();

		expect(mockFetchWithTimeout).toHaveBeenCalledOnce();
		expect(mockFetchWithTimeout).toHaveBeenCalledWith('/api/data/foo');
	});

	it('returns parsed JSON on success', async () => {
		const payload = { current: 42, history: [1, 2, 3] };
		mockFetchWithTimeout.mockResolvedValueOnce(jsonResponse(payload));

		const fetcher = createDataFetcher<{ current: number; history: number[] }>(
			'/api/data/foo',
			'FOO',
			{ current: 0, history: [] }
		);
		const result = await fetcher();

		expect(result).toEqual(payload);
	});

	it('returns fallback data on HTTP error', async () => {
		mockFetchWithTimeout.mockResolvedValueOnce(
			new Response('Internal Server Error', { status: 500 })
		);

		const fallback = { current: null, history: [] as number[] };
		const fetcher = createDataFetcher('/api/data/foo', 'FOO', fallback);
		const result = await fetcher();

		expect(result).toEqual(fallback);
	});

	it('returns fallback data on network error', async () => {
		mockFetchWithTimeout.mockRejectedValueOnce(new TypeError('Failed to fetch'));

		const fallback = { current: null, history: [] as number[] };
		const fetcher = createDataFetcher('/api/data/foo', 'FOO', fallback);
		const result = await fetcher();

		expect(result).toEqual(fallback);
	});

	it('logs success message with service ID and endpoint', async () => {
		mockFetchWithTimeout.mockResolvedValueOnce(jsonResponse({ ok: true }));

		const fetcher = createDataFetcher('/api/data/cappuccino', 'Cappuccino', {});
		await fetcher();

		expect(mockLoggerLog).toHaveBeenCalledWith(
			'Cappuccino',
			expect.stringContaining('/api/data/cappuccino')
		);
	});

	it('logs warning on HTTP error with service ID', async () => {
		mockFetchWithTimeout.mockResolvedValueOnce(
			new Response('Not Found', { status: 404 })
		);

		const fetcher = createDataFetcher('/api/data/foo', 'FOO', {});
		await fetcher();

		expect(mockLoggerWarn).toHaveBeenCalledWith(
			'FOO',
			expect.stringContaining('HTTP 404')
		);
	});

	it('logs warning on network error with service ID', async () => {
		mockFetchWithTimeout.mockRejectedValueOnce(new Error('Connection refused'));

		const fetcher = createDataFetcher('/api/data/foo', 'FOO', {});
		await fetcher();

		expect(mockLoggerWarn).toHaveBeenCalledWith(
			'FOO',
			expect.stringContaining('Connection refused')
		);
	});

	it('does not log warning on success', async () => {
		mockFetchWithTimeout.mockResolvedValueOnce(jsonResponse({ ok: true }));

		const fetcher = createDataFetcher('/api/data/foo', 'FOO', {});
		await fetcher();

		expect(mockLoggerWarn).not.toHaveBeenCalled();
	});

	it('works with array fallback', async () => {
		mockFetchWithTimeout.mockRejectedValueOnce(new Error('timeout'));

		const fetcher = createDataFetcher<string[]>('/api/data/items', 'ITEMS', []);
		const result = await fetcher();

		expect(result).toEqual([]);
	});

	it('works with null fallback', async () => {
		mockFetchWithTimeout.mockRejectedValueOnce(new Error('timeout'));

		const fetcher = createDataFetcher<null>('/api/data/thing', 'THING', null);
		const result = await fetcher();

		expect(result).toBeNull();
	});

	it('can be called multiple times independently', async () => {
		const payload1 = { value: 1 };
		const payload2 = { value: 2 };
		mockFetchWithTimeout
			.mockResolvedValueOnce(jsonResponse(payload1))
			.mockResolvedValueOnce(jsonResponse(payload2));

		const fetcher = createDataFetcher<{ value: number }>('/api/data/foo', 'FOO', { value: 0 });

		const result1 = await fetcher();
		const result2 = await fetcher();

		expect(result1).toEqual(payload1);
		expect(result2).toEqual(payload2);
		expect(mockFetchWithTimeout).toHaveBeenCalledTimes(2);
	});
});

describe('createDataFetcherWithStatus', () => {
	beforeEach(() => {
		mockFetchWithTimeout.mockReset();
		mockLoggerLog.mockReset();
		mockLoggerWarn.mockReset();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('returns { ok: true, data } on success', async () => {
		const payload = { current: 42, history: [1, 2, 3] };
		mockFetchWithTimeout.mockResolvedValueOnce(jsonResponse(payload));

		const fetcher = createDataFetcherWithStatus<{ current: number; history: number[] }>(
			'/api/data/foo',
			'FOO',
			{ current: 0, history: [] }
		);
		const result = await fetcher();

		expect(result).toEqual({ ok: true, data: payload });
	});

	it('returns { ok: false, error, fallback } on HTTP error', async () => {
		mockFetchWithTimeout.mockResolvedValueOnce(
			new Response('Internal Server Error', { status: 503 })
		);

		const fallback = { current: null, history: [] as number[] };
		const fetcher = createDataFetcherWithStatus('/api/data/foo', 'FOO', fallback);
		const result = await fetcher();

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain('503');
			expect(result.fallback).toEqual(fallback);
		}
	});

	it('returns { ok: false, error, fallback } on network error', async () => {
		mockFetchWithTimeout.mockRejectedValueOnce(new TypeError('Failed to fetch'));

		const fallback: string[] = [];
		const fetcher = createDataFetcherWithStatus<string[]>('/api/data/foo', 'FOO', fallback);
		const result = await fetcher();

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain('Failed to fetch');
			expect(result.fallback).toEqual(fallback);
		}
	});

	it('still logs warning on failure (operator visibility preserved)', async () => {
		mockFetchWithTimeout.mockRejectedValueOnce(new Error('Connection refused'));

		const fetcher = createDataFetcherWithStatus('/api/data/foo', 'FOO', {});
		await fetcher();

		expect(mockLoggerWarn).toHaveBeenCalledWith('FOO', expect.stringContaining('Connection refused'));
	});

	it('still logs success on success', async () => {
		mockFetchWithTimeout.mockResolvedValueOnce(jsonResponse({ ok: true }));

		const fetcher = createDataFetcherWithStatus('/api/data/foo', 'FOO', {});
		await fetcher();

		expect(mockLoggerLog).toHaveBeenCalledWith('FOO', expect.stringContaining('/api/data/foo'));
		expect(mockLoggerWarn).not.toHaveBeenCalled();
	});
});
