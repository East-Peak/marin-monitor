// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryBlobApi, type MemoryBlobApi } from '$lib/server/news/memory-blob-api';
import { isEmailItem } from '$lib/email-intake';
import { FAKE_INBOUND, fixture } from './fixtures';
import { parsePostmark } from './postmark';
import {
	EMAIL_PREFIX,
	ingestEmail,
	itemPath,
	lastEmailReceived,
	messageKey,
	readEmailIntake
} from './store';

let api: MemoryBlobApi;
const signal = new AbortController().signal;
const NOW = '2026-11-14T12:00:00.000Z';
const deps = () => ({ api, inbound: FAKE_INBOUND, now: () => new Date(), signal });
const ingest = (name: string, over: Record<string, unknown> = {}) =>
	ingestEmail(parsePostmark({ ...fixture(name), ...over })!, deps());
const keys = async () => (await api.list(EMAIL_PREFIX, signal)).map((b) => b.key);
const stored = async () =>
	Promise.all((await keys()).map(async (k) => JSON.parse(api.peek(k)!) as Record<string, unknown>));

beforeEach(() => {
	api = createMemoryBlobApi();
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(new Date(NOW));
});

describe('ingestEmail', () => {
	it('stores one sanitised item under its sent date and Message-ID digest', async () => {
		expect(await ingest('transit-route-580')).toEqual({
			outcome: 'stored',
			rule: 'gg-transit-alert',
			destination: 'transit'
		});
		const key = messageKey('<fixture-transit-route-580@us-west-2.messagingfabric.com>');
		expect(await keys()).toEqual([itemPath('2026-11-13T18:09:29.000Z', key)]);
		expect(itemPath('2026-11-13T18:09:29.000Z', key)).toBe(`${EMAIL_PREFIX}2026-11-13/${key}.json`);
		const [item] = await stored();
		expect(isEmailItem(item)).toBe(true);
		expect(item).toEqual({
			v: 1,
			key,
			sender: 'goldengate@service.govdelivery.com',
			rule: 'gg-transit-alert',
			destination: 'transit',
			subject:
				'Rider Alert Route GGTransit Route 580 Sunday, 11/15, WB Richmond-San Rafael Bridge Closure',
			sentAt: '2026-11-13T18:09:29.000Z',
			receivedAt: NOW,
			description: expect.stringMatching(/^The Richmond-San Rafael Bridge will be closed/),
			permalink: 'https://content.govdelivery.com/accounts/CAGOLDEN/bulletins/432b85f',
			topics: ['Route 580']
		});
	});

	it('never stores the payload: no headers, no body, no address', async () => {
		await ingest('ferry-larkspur-1104-updated');
		const text = api.peek((await keys())[0])!;
		for (const bad of [
			'Received',
			'DKIM',
			'Headers',
			'TextBody',
			'maps.app.goo.gl',
			FAKE_INBOUND,
			'subscriber'
		])
			expect(text).not.toContain(bad);
	});

	it.each(['account-welcome', 'account-subscription-change'])(
		'drops account mail (%s) and stores nothing',
		async (name) => {
			expect(await ingest(name)).toEqual({
				outcome: 'dropped',
				rule: 'gg-account',
				destination: 'dropped'
			});
			expect(await keys()).toEqual([]);
		}
	);

	it('holds an unknown subject privately', async () => {
		expect(
			await ingest('transit-route-580', { Subject: 'Valkyries Parade Service Notice' })
		).toMatchObject({
			outcome: 'stored',
			rule: 'unknown',
			destination: 'held'
		});
		expect((await stored())[0]).toMatchObject({ destination: 'held', rule: 'unknown' });
	});

	it('stores nothing at all when a field would carry a subscriber value', async () => {
		const raw = fixture('transit-route-580');
		raw.TextBody = `See https://x.example/?verification=5.abc today.\n\n${raw.TextBody}`;
		expect(await ingestEmail(parsePostmark(raw)!, deps())).toEqual({
			outcome: 'dropped',
			rule: 'gg-unsafe',
			destination: 'dropped'
		});
		expect(await keys()).toEqual([]);
	});

	it('a re-delivery is idempotent: one blob per Message-ID', async () => {
		await ingest('transit-route-580');
		expect(await ingest('transit-route-580')).toMatchObject({ outcome: 'duplicate' });
		expect(await keys()).toHaveLength(1);
	});

	it('concurrent deliveries all land, identical ones once', async () => {
		const results = await Promise.all([
			ingest('transit-route-580'),
			ingest('transit-route-580'),
			ingest('transit-king-tides'),
			ingest('bridge-sidewalk-detour-reminder')
		]);
		expect(results.map((r) => r.outcome).sort()).toEqual([
			'duplicate',
			'stored',
			'stored',
			'stored'
		]);
		expect(await keys()).toHaveLength(3);
	});

	it('a failed write throws, so the webhook is not answered 200', async () => {
		api.before = (op) => {
			if (op === 'write') throw new Error('blob down');
		};
		await expect(ingest('transit-route-580')).rejects.toThrow('blob down');
	});
});

describe('readEmailIntake', () => {
	const read = () => readEmailIntake({ api, now: () => new Date(), signal });

	it('serves shown items from the last 14 days, revisions collapsed, held never', async () => {
		vi.setSystemTime(new Date('2026-11-14T12:00:00.000Z'));
		for (const name of [
			'ferry-larkspur-1104',
			'ferry-larkspur-1104-updated',
			'bridge-sidewalk-detour',
			'bridge-sidewalk-detour-reminder',
			'bridge-marathon',
			'transit-route-580',
			'transit-king-tides',
			'newsletter-october',
			'public-meeting-reminder'
		])
			await ingest(name);
		await ingest('transit-route-580', {
			Subject: 'Valkyries Parade Service Notice',
			Headers: fixture('transit-route-580').Headers.map((h: { Name: string; Value: string }) =>
				h.Name === 'Message-ID' ? { Name: h.Name, Value: '<held@x>' } : h
			)
		});
		const out = await read();
		// The newsletter (Oct 31, 00:01 UTC) and the marathon alert (Oct 28) are past 14 days.
		expect(out.checkedAt).toBe('2026-11-14T12:00:00.000Z');
		expect(out.items.map((i) => [i.rule, i.subject])).toEqual([
			[
				'gg-bridge-alert',
				'REMINDER! ALERT GGBRIDGE 11/16-11/20 OVERNIGHT EAST SIDEWALK CYCLIST DETOUR'
			],
			['gg-transit-alert', 'Rider Alert GGTransit King Tides & Ongoing Flooding'],
			[
				'gg-transit-alert',
				'Rider Alert Route GGTransit Route 580 Sunday, 11/15, WB Richmond-San Rafael Bridge Closure'
			],
			['gg-ferry-alert', '[Updated 1:00PM] Rider Alert 11/4 Golden Gate Ferry Larkspur'],
			['gg-public-meeting', expect.stringMatching(/^Reminder! Join our Nov. 5 Public Meeting/)]
		]);
	});

	it('an item past 14 days leaves the read', async () => {
		vi.setSystemTime(new Date('2026-11-06T00:00:00.000Z'));
		await ingest('bridge-marathon'); // sent Oct 28
		vi.setSystemTime(new Date('2026-11-11T17:06:17.000Z'));
		expect((await read()).items).toEqual([]);
	});

	it('a failed read fails the whole read, never an empty list', async () => {
		await ingest('transit-route-580');
		api.before = (op) => {
			if (op === 'read') throw new Error('blob down');
		};
		await expect(read()).rejects.toThrow('blob down');
	});

	it('an invalid stored blob fails the read', async () => {
		await ingest('transit-route-580');
		const key = (await keys())[0];
		const current = await api.read(key, signal);
		await api.write(key, '{"v":1}', { ifMatch: current!.etag }, signal);
		await expect(read()).rejects.toThrow(/invalid/);
	});
});

describe('lastEmailReceived', () => {
	it('is the newest stored upload, held included; null before any', async () => {
		expect(await lastEmailReceived(api, signal)).toBeNull();
		await ingest('transit-route-580');
		vi.setSystemTime(new Date('2026-11-14T13:00:00.000Z'));
		await ingest('transit-route-580', {
			Subject: 'Valkyries Parade Service Notice',
			Headers: [
				...fixture('transit-route-580').Headers.filter(
					(h: { Name: string }) => h.Name !== 'Message-ID'
				),
				{ Name: 'Message-ID', Value: '<held@x>' }
			]
		});
		expect(await lastEmailReceived(api, signal)).toBe('2026-11-14T13:00:00.000Z');
	});
});
