import { afterEach, describe, expect, it, vi } from 'vitest';
import { scrapePolice } from './police';

const HONEST_USER_AGENT = 'MarinMonitor/2.0 (+https://marinmonitor.com; stuart@eastpeak.cc)';
const FAIRFAX_URL =
	'https://townoffairfaxca.gov/wp-json/wp/v2/documents?search=Press%20log&per_page=8&_fields=id,date,title,link,meta';
const BELVEDERE_URL =
	'https://cityofbelvedere.gov/wp-json/wp/v2/posts?per_page=40&_fields=id,date,link,title,excerpt,content';

async function recordPoliceFetches(): Promise<Array<{ url: string; userAgent: string | null }>> {
	const fetchMock = vi.fn<typeof fetch>(async () => new Response('[]', { status: 200 }));
	vi.stubGlobal('fetch', fetchMock);
	await scrapePolice();
	return fetchMock.mock.calls.map(([input, init]) => ({
		url: String(input),
		userAgent: new Headers(init?.headers).get('user-agent')
	}));
}

describe('scrapePolice agency requests', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('fetches Fairfax press logs and Belvedere posts from their current hosts', async () => {
		const urls = (await recordPoliceFetches()).map((call) => call.url);
		expect(urls).toContain(FAIRFAX_URL);
		expect(urls).toContain(BELVEDERE_URL);
	});

	it('identifies itself honestly to every Fairfax and Belvedere request', async () => {
		const calls = (await recordPoliceFetches()).filter((call) =>
			/townoffairfaxca\.gov|cityofbelvedere\.(gov|org)/.test(new URL(call.url).hostname)
		);
		expect(calls.length).toBeGreaterThanOrEqual(2);
		for (const call of calls) expect(call.userAgent).toBe(HONEST_USER_AGENT);
	});
});
