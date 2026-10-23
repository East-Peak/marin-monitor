import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchGgAlertsWithStatus } from './gg-alerts';

const BLOB = {
	checkedAt: '2026-10-23T14:40:00.000Z',
	lastSuccessfulScrapeAt: '2026-10-23T14:40:00.000Z',
	alerts: [{ id: '549', headline: 'DISRUPTION', routes: ['Larkspur Ferry'] }],
	lastFailure: null
};
const serve = (body: unknown) =>
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => new Response(JSON.stringify(body)))
	);

afterEach(() => vi.unstubAllGlobals());

describe('fetchGgAlertsWithStatus', () => {
	it('reads the blob from /api/data/gg-alerts', async () => {
		serve(BLOB);
		expect(await fetchGgAlertsWithStatus()).toEqual({ ok: true, data: BLOB, dataSource: 'live' });
		expect(String(vi.mocked(fetch).mock.calls[0][0])).toBe('/api/data/gg-alerts');
	});

	it('an invalid blob is a failed read, never an empty list', async () => {
		serve({ ...BLOB, alerts: [{ id: '549' }] });
		expect(await fetchGgAlertsWithStatus()).toMatchObject({ ok: false, fallback: null });
	});
});
