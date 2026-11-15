import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchEmailIntakeWithStatus } from './email-intake';

const READ = {
	checkedAt: '2026-11-14T12:00:00.000Z',
	items: [
		{
			v: 1,
			key: 'a'.repeat(32),
			sender: 'goldengate@service.govdelivery.com',
			rule: 'gg-transit-alert',
			destination: 'transit',
			subject: 'Rider Alert Route 580',
			sentAt: '2026-11-13T18:09:29.000Z',
			receivedAt: '2026-11-13T18:09:30.000Z',
			description: null,
			permalink: 'https://content.govdelivery.com/accounts/CAGOLDEN/bulletins/432b85f',
			topics: ['Route 580']
		}
	]
};
const serve = (body: unknown) =>
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => new Response(JSON.stringify(body)))
	);

afterEach(() => vi.unstubAllGlobals());

describe('fetchEmailIntakeWithStatus', () => {
	it('reads /api/data/email-intake', async () => {
		serve(READ);
		expect(await fetchEmailIntakeWithStatus()).toEqual({
			ok: true,
			data: READ,
			dataSource: 'live'
		});
		expect(String(vi.mocked(fetch).mock.calls[0][0])).toBe('/api/data/email-intake');
	});

	it('an invalid body is a failed read, never an empty list', async () => {
		serve({ ...READ, items: [{ key: 'x' }] });
		expect(await fetchEmailIntakeWithStatus()).toMatchObject({ ok: false, fallback: null });
	});
});
