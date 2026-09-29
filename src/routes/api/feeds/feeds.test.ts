import { describe, expect, it, vi } from 'vitest';

const { fetchWithTimeout } = vi.hoisted(() => ({ fetchWithTimeout: vi.fn() }));
vi.mock('$lib/server/fetch-utils', () => ({ fetchWithTimeout }));

const { GET } = await import('./+server');
const { FEEDS } = await import('$lib/config/feeds');

const MARIN_LATELY = 'https://marinlately.substack.com/feed';
const get = (feedUrl: string) =>
	GET({
		url: new URL(`https://marinmonitor.com/api/feeds?url=${encodeURIComponent(feedUrl)}`)
	} as never);

describe('Marin Lately feed', () => {
	it('is configured at its Substack feed (marinlately.com redirects to a dead page)', () => {
		expect(FEEDS.satire.map((f) => [f.name, f.url])).toEqual([['Marin Lately', MARIN_LATELY]]);
	});

	it('is accepted by the feed proxy', async () => {
		fetchWithTimeout.mockResolvedValueOnce(
			new Response('<rss><channel><item><title>t</title></item></channel></rss>', {
				headers: { 'content-type': 'application/xml' }
			})
		);
		const res = await get(MARIN_LATELY);
		expect(res.status).toBe(200);
		expect(fetchWithTimeout.mock.calls[0][0]).toBe(MARIN_LATELY);
	});

	it('no longer proxies the retired marinlately.com feed', async () => {
		await expect(get('https://marinlately.com/feed/')).rejects.toMatchObject({ status: 400 });
	});
});

describe('Marin IJ local news feed', () => {
	it('no longer configures the retired breaking-news and emergency tags (empty all year)', () => {
		const urls = Object.values(FEEDS).flatMap((feeds) => feeds.map((f) => f.url));
		expect(urls.filter((u) => /marinij\.com\/tag\/(breaking-news|emergency)\//.test(u))).toEqual(
			[]
		);
	});

	it('reads the populated marin-county tag (tag/news has returned 0 items since 2026)', () => {
		const ij = FEEDS.local.find((f) => f.name === 'Marin Independent Journal');
		expect(ij?.url).toBe('https://www.marinij.com/tag/marin-county/feed/');
	});
});

describe('SiteGround-captcha feeds', () => {
	it('no longer configures MMWD or Marin Humane (every /feed/ request gets an sgcaptcha page)', () => {
		const urls = Object.values(FEEDS).flatMap((feeds) => feeds.map((f) => f.url));
		expect(urls.filter((u) => /(marinwater|marinhumane)\.org/.test(u))).toEqual([]);
	});
});

describe('City of Belvedere feed', () => {
	it('is a civic feed on its .gov host (replaces the retired Belvedere police-source posts)', () => {
		expect(FEEDS.civic.find((f) => f.name === 'City of Belvedere')).toMatchObject({
			url: 'https://cityofbelvedere.gov/feed/',
			verification: 'official',
			confirmed: true
		});
	});
});
