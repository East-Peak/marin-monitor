import { beforeEach, describe, expect, it, vi } from 'vitest';

const { put, head, scrapeEvCharging } = vi.hoisted(() => ({
	put: vi.fn(),
	head: vi.fn(),
	scrapeEvCharging: vi.fn()
}));
vi.mock('@vercel/blob', () => ({ put, head }));
vi.mock('$env/dynamic/private', () => ({ env: { BLOB_READ_WRITE_TOKEN: 'test-token' } }));
vi.mock('$lib/server/cron-auth', () => ({ verifyCronAuth: () => null }));
vi.mock('$lib/server/scrapers/ev-charging', () => ({ scrapeEvCharging }));

const { GET } = await import('./+server');
const call = () =>
	GET({ request: new Request('https://marinmonitor.com/api/cron/sync-ev-charging') } as never);

describe('GET /api/cron/sync-ev-charging', () => {
	beforeEach(() => {
		put.mockReset();
		head.mockReset().mockRejectedValue(new Error('not found'));
		scrapeEvCharging.mockReset();
		vi.spyOn(console, 'error').mockImplementation(() => {});
	});

	it('keeps the last-good blob untouched and fails loudly when the scrape fails', async () => {
		scrapeEvCharging.mockRejectedValue(new Error('NREL tile fetches failed'));
		const res = await call();
		expect(res.status).toBe(500);
		expect(put).not.toHaveBeenCalled();
	});

	it('writes the snapshot and reports the station count on success', async () => {
		scrapeEvCharging.mockResolvedValue({
			timestamp: '2026-09-29T12:00:00.000Z',
			lastSuccessfulScrapeAt: '2026-09-29T12:00:00.000Z',
			stationCount: 238,
			dcFastStationCount: 40,
			level2StationCount: 200,
			totalPorts: 700,
			networkBreakdown: {},
			connectorBreakdown: {},
			stations: []
		});
		const res = await call();
		expect(res.status).toBe(200);
		expect(await res.json()).toMatchObject({ ok: true, stationCount: 238 });
		expect(put).toHaveBeenCalledTimes(1);
	});
});
