import { beforeEach, describe, expect, it, vi } from 'vitest';

const { put, head, computeDrivewaySnapshot } = vi.hoisted(() => ({
	put: vi.fn(),
	head: vi.fn(),
	computeDrivewaySnapshot: vi.fn()
}));
vi.mock('@vercel/blob', () => ({ put, head }));
vi.mock('$env/dynamic/private', () => ({ env: { BLOB_READ_WRITE_TOKEN: 'test-token' } }));
vi.mock('$lib/server/cron-auth', () => ({ verifyCronAuth: () => null }));
vi.mock('$lib/server/scrapers/driveway', () => ({ computeDrivewaySnapshot }));

const { GET } = await import('./+server');
const call = () =>
	GET({ request: new Request('https://marinmonitor.com/api/cron/sync-driveway') } as never);

describe('GET /api/cron/sync-driveway', () => {
	beforeEach(() => {
		put.mockReset();
		head.mockReset().mockRejectedValue(new Error('not found'));
		computeDrivewaySnapshot.mockReset();
		vi.spyOn(console, 'error').mockImplementation(() => {});
	});

	it('keeps the last-good blob untouched and fails loudly when the scrape fails', async () => {
		computeDrivewaySnapshot.mockRejectedValue(new Error('CKAN package_show: HTTP 503'));
		const res = await call();
		expect(res.status).toBe(500);
		expect(put).not.toHaveBeenCalled();
	});

	it('writes the live snapshot on success', async () => {
		computeDrivewaySnapshot.mockResolvedValue({
			timestamp: '2026-09-29T12:00:00.000Z',
			lastSuccessfulScrapeAt: '2026-09-29T12:00:00.000Z',
			dataYear: 2026,
			totalVehicles: 210427,
			topMakes: [{ make: 'Toyota', count: 27246 }],
			fuelBreakdown: [],
			funStats: { rivian: 581, lucid: 12, porsche: 823, tesla: 8795, hydrogen: 52 }
		});
		const res = await call();
		expect(res.status).toBe(200);
		expect(await res.json()).toMatchObject({ ok: true, dataYear: 2026, totalVehicles: 210427 });
		expect(put).toHaveBeenCalledTimes(1);
	});
});
