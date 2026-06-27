/* eslint-disable @typescript-eslint/no-explicit-any -- SvelteKit RequestEvent mocks; handler uses a subset */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockScrapePolice = vi.fn();
const mockScrapeActivity = vi.fn();
const mockScrapeHousing = vi.fn();
const mockScrapeGasPrices = vi.fn();
const mockScrapeEvCharging = vi.fn();

vi.mock('$env/dynamic/private', () => ({
	env: { CRON_SECRET: 'test-cron-secret' }
}));
vi.mock('$lib/server/scrapers/police', () => ({ scrapePolice: mockScrapePolice }));
vi.mock('$lib/server/scrapers/activity', () => ({ scrapeActivity: mockScrapeActivity }));
vi.mock('$lib/server/scrapers/housing', () => ({ scrapeHousing: mockScrapeHousing }));
vi.mock('$lib/server/scrapers/gas-prices', () => ({ scrapeGasPrices: mockScrapeGasPrices }));
vi.mock('$lib/server/scrapers/ev-charging', () => ({ scrapeEvCharging: mockScrapeEvCharging }));

const { GET: getRunAll } = await import('./run-all/+server');

function authedEvent() {
	const headers = new Headers();
	headers.set('authorization', 'Bearer test-cron-secret');
	return { request: new Request('https://localhost/api/cron/run-all', { headers }) } as any;
}

describe('/api/cron/run-all', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.spyOn(console, 'log').mockImplementation(() => {});
		mockScrapePolice.mockResolvedValue([]);
		mockScrapeActivity.mockResolvedValue([]);
		mockScrapeHousing.mockResolvedValue([]);
		mockScrapeGasPrices.mockResolvedValue({ stationCount: 0 });
		mockScrapeEvCharging.mockResolvedValue({ stationCount: 0 });
	});

	it('does not leak the internal error detail when a scraper throws', async () => {
		mockScrapePolice.mockRejectedValue(new Error('connect ECONNREFUSED secret-db-host:5432'));
		const res = await getRunAll(authedEvent());
		expect(res.status).toBe(207); // partial failure
		const body = await res.json();
		expect(JSON.stringify(body)).not.toContain('ECONNREFUSED');
		expect(JSON.stringify(body)).not.toContain('secret-db-host');
		const police = body.results.find((r: { name: string }) => r.name === 'police');
		expect(police.ok).toBe(false);
		expect(police.error).toBe('sync failed');
	});

	it('rejects unauthenticated requests', async () => {
		const res = await getRunAll({
			request: new Request('https://localhost/api/cron/run-all')
		} as any);
		expect(res.status).toBe(401);
	});
});
