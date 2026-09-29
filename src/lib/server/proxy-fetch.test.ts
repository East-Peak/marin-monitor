import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { proxyFetch } from '../../../scripts/shared/proxy-fetch.mjs';

const TARGET = 'https://plumpjackwines.com/collections/red/products.json';

function envelope(status: number, data: string) {
	return new Response(JSON.stringify({ status, data, headers: {} }), { status: 200 });
}

describe('proxyFetch', () => {
	const fetchMock = vi.fn();

	beforeEach(() => {
		vi.stubGlobal('fetch', fetchMock);
		vi.stubEnv('SCRAPE_PROXY_URL', 'https://proxy.example');
		vi.stubEnv('SCRAPE_PROXY_SECRET', 's3cret');
	});
	afterEach(() => {
		fetchMock.mockReset();
		vi.unstubAllGlobals();
		vi.unstubAllEnvs();
	});

	it('returns the upstream response carried in the proxy envelope', async () => {
		fetchMock.mockResolvedValueOnce(envelope(200, '{"products":[]}'));
		const res = await proxyFetch(TARGET);
		expect(res.status).toBe(200);
		expect(await res.text()).toBe('{"products":[]}');
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock.mock.calls[0][0]).toBe('https://proxy.example/proxy');
	});

	it('tags every proxied request with a request id the proxy can log', async () => {
		fetchMock.mockResolvedValueOnce(envelope(200, ''));
		await proxyFetch(TARGET);
		const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
		expect(headers['X-Request-Id']).toMatch(/^[0-9a-f-]{36}$/);
	});

	it('logs the request id and upstream status of every proxied call, so a run correlates with the proxy log', async () => {
		const log = vi.spyOn(console, 'log').mockImplementation(() => {});
		fetchMock.mockResolvedValueOnce(envelope(403, 'blocked'));
		await proxyFetch(TARGET);
		const id = (fetchMock.mock.calls[0][1].headers as Record<string, string>)['X-Request-Id'];
		expect(log).toHaveBeenCalledWith(`[proxy ${id}] plumpjackwines.com -> 403`);
		log.mockRestore();
	});

	it('throws instead of fetching direct when the proxy is unreachable', async () => {
		fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
		await expect(proxyFetch(TARGET)).rejects.toThrow(/proxy/i);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('throws instead of fetching direct when the proxy rejects the call', async () => {
		fetchMock.mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }));
		await expect(proxyFetch(TARGET)).rejects.toThrow(/401/);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('refuses a half-configured proxy rather than silently going direct', async () => {
		vi.stubEnv('SCRAPE_PROXY_SECRET', '');
		await expect(proxyFetch(TARGET)).rejects.toThrow(/SCRAPE_PROXY/);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('fetches direct only when no proxy is configured at all', async () => {
		vi.stubEnv('SCRAPE_PROXY_URL', '');
		vi.stubEnv('SCRAPE_PROXY_SECRET', '');
		fetchMock.mockResolvedValueOnce(new Response('ok'));
		await proxyFetch(TARGET);
		expect(fetchMock.mock.calls[0][0]).toBe(TARGET);
	});
});
