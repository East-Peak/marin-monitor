import { describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import type { Advisory, ParsedAlerts } from '$lib/weather/advisories';
import { createAdvisoryFeed } from './advisory-feed';

const NOW = Date.parse('2026-09-29T15:00:00Z');
const A = { id: 'a1', event: 'Wind Advisory' } as Advisory;
const parsed = (advisories: Advisory[], unreadable = 0): ParsedAlerts => ({
	advisories,
	unreadable
});

function feed(
	fetch: (signal: AbortSignal) => Promise<ParsedAlerts>,
	signal = new AbortController().signal
) {
	let clock = NOW;
	const f = createAdvisoryFeed({ fetch, signal, now: () => clock });
	return { f, tick: (ms: number) => (clock += ms) };
}

describe('createAdvisoryFeed', () => {
	it('records a successful attempt, including unreadable alerts', async () => {
		const { f } = feed(async () => parsed([A], 1));
		await f.refresh();
		expect(get(f)).toEqual({
			advisories: [A],
			unreadable: 1,
			lastAttemptAt: NOW,
			lastSuccessAt: NOW,
			lastError: null
		});
	});
	it('a failure keeps the last good advisories and records the error', async () => {
		let fail = false;
		const { f, tick } = feed(async () => {
			if (fail) throw new Error('HTTP 503');
			return parsed([A]);
		});
		await f.refresh();
		fail = true;
		tick(300_000);
		await f.refresh();
		expect(get(f)).toEqual({
			advisories: [A],
			unreadable: 0,
			lastAttemptAt: NOW + 300_000,
			lastSuccessAt: NOW,
			lastError: 'HTTP 503'
		});
	});
	it('one request at a time', async () => {
		const fetch = vi.fn(async () => parsed([A]));
		const { f } = feed(fetch);
		await Promise.all([f.refresh(), f.refresh()]);
		expect(fetch).toHaveBeenCalledTimes(1);
	});
	it('nothing is written after the owner aborts', async () => {
		const owner = new AbortController();
		let release!: (v: ParsedAlerts) => void;
		const { f } = feed(() => new Promise((r) => (release = r)), owner.signal);
		const pending = f.refresh();
		owner.abort();
		release(parsed([A]));
		await pending;
		expect(get(f).lastAttemptAt).toBeNull();
	});
});
