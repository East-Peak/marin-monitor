import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as policeShared from '$lib/config/police.shared.js';
import { scrapePolice } from './police';

const HONEST_USER_AGENT = 'MarinMonitor/2.0 (+https://marinmonitor.com; stuart@eastpeak.cc)';
const FAIRFAX_URL =
	'https://townoffairfaxca.gov/wp-json/wp/v2/documents?search=Press%20log&per_page=8&_fields=id,date,title,link,meta';

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

	it('fetches Fairfax press logs from their current host', async () => {
		const urls = (await recordPoliceFetches()).map((call) => call.url);
		expect(urls).toContain(FAIRFAX_URL);
	});

	it('identifies itself honestly to every Fairfax request', async () => {
		const calls = (await recordPoliceFetches()).filter((call) =>
			/townoffairfaxca\.gov/.test(new URL(call.url).hostname)
		);
		expect(calls.length).toBeGreaterThanOrEqual(1);
		for (const call of calls) expect(call.userAgent).toBe(HONEST_USER_AGENT);
	});
});

// Belvedere's "public safety" posts were keyword-matched city news (an
// AlertMarin test, a preparedness event), not police logs. City news now
// comes from the City of Belvedere feed in the news producer.
describe('Belvedere is not a police source', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('never requests a Belvedere host', async () => {
		const hosts = (await recordPoliceFetches()).map((call) => new URL(call.url).hostname);
		expect(hosts.filter((host) => /belvedere/i.test(host))).toEqual([]);
	});

	it('shares no Belvedere endpoint with the local police script', async () => {
		expect(Object.keys(policeShared).filter((key) => /belvedere/i.test(key))).toEqual([]);
		const script = await readFile('scripts/extract-police-logs.mjs', 'utf8');
		expect(script).not.toMatch(/belvedere/i);
	});

	it('is absent from the bundled fallback /api/data/police-logs serves when Blob is unreadable', async () => {
		const items = JSON.parse(
			await readFile('static/data/marin-police-logs.json', 'utf8')
		) as Array<{ source: string; townSlug?: string }>;
		expect(
			items.filter(
				(item) => item.source === 'Belvedere Public Safety' || item.townSlug === 'belvedere'
			)
		).toEqual([]);
	});
});
