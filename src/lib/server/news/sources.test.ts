import { describe, expect, it } from 'vitest';
import { FEEDS } from '$lib/config/feeds';
import { NEWS_ALLOWED_HOSTS, NEWS_SOURCES } from './sources';

describe('NEWS_SOURCES', () => {
	it('covers every non-broken configured feed exactly once', () => {
		const configured = Object.values(FEEDS)
			.flat()
			.filter((f) => !f.broken)
			.map((f) => f.url);
		expect(NEWS_SOURCES.map((s) => s.url)).toEqual(configured);
	});
	it('has unique ids and urls', () => {
		expect(new Set(NEWS_SOURCES.map((s) => s.id)).size).toBe(NEWS_SOURCES.length);
		expect(new Set(NEWS_SOURCES.map((s) => s.url)).size).toBe(NEWS_SOURCES.length);
	});
	it('only uses https', () => {
		for (const s of NEWS_SOURCES) expect(new URL(s.url).protocol).toBe('https:');
	});
	it('carries a declared time zone through to the producer', () => {
		const nbc = NEWS_SOURCES.find((s) => s.id === 'nbc-bay-area-marin');
		expect(nbc?.assumedTimeZone).toBe('America/Los_Angeles');
	});
	it('carries the Granicus event-start date meaning through to the producer', () => {
		for (const id of ['marin-county-bos-agendas', 'marin-county-bos-minutes']) {
			expect(NEWS_SOURCES.find((s) => s.id === id)?.pubDateMeaning).toBe('event-start');
		}
	});
	it('priorities follow config order', () => {
		expect(NEWS_SOURCES.map((s) => s.priority)).toEqual(NEWS_SOURCES.map((_, i) => i));
	});
	it('allowlists exactly the configured hosts', () => {
		expect([...NEWS_ALLOWED_HOSTS].sort()).toEqual(
			[...new Set(NEWS_SOURCES.map((s) => new URL(s.url).hostname))].sort()
		);
		expect(NEWS_ALLOWED_HOSTS.has('www.marinij.com')).toBe(true);
		expect(NEWS_ALLOWED_HOSTS.has('cityofbelvedere.gov')).toBe(true);
	});
});
