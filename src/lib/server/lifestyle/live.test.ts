import { describe, expect, it } from 'vitest';
import { readLive, type RawLiveBlobs } from './live';

const NOW = new Date('2026-10-20T18:00:00.000Z');

const station = (price: number, updateTime: string | undefined, type = 'REGULAR_UNLEADED') => ({
	fuelPrices: [{ type, price, ...(updateTime ? { updateTime } : {}) }]
});
const gas = (
	at: string | null,
	stations: object[] = [
		station(6.2, '2026-10-20T04:38:21Z'),
		station(6.214, '2026-10-20T10:00:00Z')
	]
) => ({
	current: {
		timestamp: '2026-10-20T16:00:00.000Z',
		lastSuccessfulScrapeAt: at,
		avgRegular: 6.207,
		stations
	},
	history: []
});

const shop = (
	price: number | null,
	priceSource: string,
	isStale = false,
	updateTime = '2026-10-19T10:40:04.266Z'
) => ({ price, priceSource, isStale, updateTime });
const cappuccino = (shops: object[], at = '2026-10-19T10:40:39.208Z') => ({
	current: { timestamp: at, lastSuccessfulScrapeAt: at, medianPrice: 5, shops },
	history: []
});

const item = (itemId: string, cheapest: number | null, cheapestStore: string | null) => ({
	itemId,
	cheapest,
	cheapestStore
});
const grocery = (items: object[], at = '2026-10-18T16:11:03.844Z') => ({
	current: { timestamp: at, lastSuccessfulScrapeAt: at, items },
	history: []
});

/** The shape the monthly Ikon and Rivian syncs write. */
const monthly = (
	field: string,
	entries: { timestamp: string; value: number; scraped: boolean }[]
) => {
	const snaps = entries.map((e) => ({
		timestamp: e.timestamp,
		[field]: e.value,
		scraped: e.scraped,
		lastSuccessfulScrapeAt: e.scraped ? e.timestamp : null
	}));
	return { current: snaps[0], history: snaps };
};

const healthy = (): RawLiveBlobs => ({
	gas: gas('2026-10-20T12:00:00.000Z'),
	cappuccino: cappuccino([shop(5, 'live'), shop(4.85, 'live'), shop(5, 'live')]),
	grocery: grocery([
		item('vital-proteins-collagen', 13.47, 'Walmart'),
		item('manuka-honey', 10.99, 'Sprouts Farmers Market'),
		item('marin-kombucha', 4.79, 'Whole Foods'),
		item('oatly-oatmilk', 3.99, 'FoodMaxx'),
		item('silver-oak-cabernet', 83.49, 'Total Wine & More')
	]),
	ikon: monthly('adultPrice', [
		{ timestamp: '2026-10-02T19:10:39.582Z', value: 1529, scraped: true }
	]),
	rivian: monthly('leaseMonthly', [
		{ timestamp: '2026-10-04T16:15:33.243Z', value: 1209, scraped: true }
	])
});

describe('readLive', () => {
	it('reads every input ok from fresh, successful reads, with their observation times', () => {
		const live = readLive(healthy(), NOW);
		expect(live['gas.regular']).toMatchObject({
			availability: 'ok',
			observedAt: '2026-10-20T04:38:21.000Z'
		});
		expect(live['gas.regular'].value).toBeCloseTo(6.207, 6);
		expect(live['grocery.silverOak']).toMatchObject({ availability: 'ok', value: 83.49 });
		expect(live['ikon.adult']).toMatchObject({ availability: 'ok', value: 1529 });
		expect(live['rivian.lease']).toMatchObject({ availability: 'ok', value: 1209 });
		for (const read of Object.values(live)) expect(read.availability).toBe('ok');
		// Each read carries its source's max age from the health inventory, so pricing can re-check it.
		expect([live['gas.regular'].maxAgeDays, live['ikon.adult'].maxAgeDays]).toEqual([2, 45]);
	});

	it('uses the upstream observation time, never the blob write time', () => {
		const blobs = healthy();
		// Fetched today, but Google last saw these prices four days ago.
		blobs.gas = gas('2026-10-20T12:00:00.000Z', [station(6.1, '2026-10-16T08:00:00Z')]);
		expect(readLive(blobs, NOW)['gas.regular']).toMatchObject({
			availability: 'stale',
			value: 6.1,
			observedAt: '2026-10-16T08:00:00.000Z'
		});
	});

	it('averages only the regular prices observed inside the max age, dated by the oldest of them', () => {
		const blobs = healthy();
		blobs.gas = gas('2026-10-20T12:00:00.000Z', [
			station(6.0, '2026-10-19T20:00:00Z'),
			station(7.0, '2026-10-20T10:00:00Z'),
			station(9.9, '2026-09-01T00:00:00Z'),
			station(8.8, undefined),
			station(5.5, '2026-10-20T10:00:00Z', 'DIESEL')
		]);
		const read = readLive(blobs, NOW)['gas.regular'];
		expect(read).toMatchObject({ availability: 'ok', observedAt: '2026-10-19T20:00:00.000Z' });
		expect(read.value).toBeCloseTo(6.5, 6);
	});

	it('dates the cappuccino median by its own menus, not the run’s coverage flag', () => {
		const blobs = healthy();
		blobs.cappuccino = cappuccino(
			[
				shop(5, 'live', false, '2026-10-19T10:40:04.266Z'),
				shop(4.5, 'live', false, '2026-10-18T09:00:00.000Z')
			],
			'2026-09-01T00:00:00.000Z'
		);
		expect(readLive(blobs, NOW)['coffee.cappuccino']).toMatchObject({
			availability: 'ok',
			value: 4.75,
			observedAt: '2026-10-18T09:00:00.000Z'
		});
	});

	it('reads no grocery price from a run that did not itself succeed', () => {
		const blobs = healthy();
		// A blocked run writes reference prices without "(ref)" and keeps the last success time.
		blobs.grocery = {
			current: {
				timestamp: '2026-10-19T16:00:00.000Z',
				lastSuccessfulScrapeAt: '2026-10-18T16:11:03.844Z',
				items: [item('silver-oak-cabernet', 89.99, 'Total Wine & More')]
			},
			history: []
		};
		expect(readLive(blobs, NOW)['grocery.silverOak']).toMatchObject({
			availability: 'unavailable',
			value: null
		});
	});

	it('trusts a Rivian lease only when the lease itself was read', () => {
		const blobs = healthy();
		const snap = (over: object) => ({
			current: {
				timestamp: '2026-10-04T16:15:33.243Z',
				lastSuccessfulScrapeAt: '2026-10-04T16:15:33.243Z',
				scraped: true,
				...over
			},
			history: []
		});
		blobs.rivian = snap({ leaseMonthly: 899, leaseScraped: false });
		expect(readLive(blobs, NOW)['rivian.lease'].availability).toBe('unavailable');
		blobs.rivian = snap({ leaseMonthly: 899 }); // legacy entry: $899 is the writer's default
		expect(readLive(blobs, NOW)['rivian.lease'].availability).toBe('unavailable');
		blobs.rivian = snap({ leaseMonthly: 1209 }); // legacy entry with a real price
		expect(readLive(blobs, NOW)['rivian.lease']).toMatchObject({ availability: 'ok', value: 1209 });
		blobs.rivian = snap({ leaseMonthly: 899, leaseScraped: true });
		expect(readLive(blobs, NOW)['rivian.lease']).toMatchObject({ availability: 'ok', value: 899 });
	});

	it('marks a missing blob, a missing value or a write with no successful read unavailable', () => {
		const blobs = healthy();
		blobs.gas = null;
		expect(readLive(blobs, NOW)['gas.regular']).toMatchObject({
			availability: 'unavailable',
			value: null
		});
		blobs.gas = gas('2026-10-20T12:00:00.000Z', []);
		expect(readLive(blobs, NOW)['gas.regular'].availability).toBe('unavailable');
		blobs.gas = gas('2026-10-20T12:00:00.000Z', [station(6.2, undefined)]);
		expect(readLive(blobs, NOW)['gas.regular'].availability).toBe('unavailable');
		blobs.gas = { not: 'a snapshot' };
		expect(readLive(blobs, NOW)['gas.regular'].availability).toBe('unavailable');
	});

	it('does not vouch for a timestamp in the future or a malformed one', () => {
		const blobs = healthy();
		blobs.gas = gas('2026-10-20T12:00:00.000Z', [station(6.2, '2026-10-21T12:00:00Z')]);
		expect(readLive(blobs, NOW)['gas.regular'].availability).toBe('unavailable');
		blobs.gas = gas('2026-10-20T12:00:00.000Z', [station(6.2, '2026-02-30T12:00:00Z')]);
		expect(readLive(blobs, NOW)['gas.regular'].availability).toBe('unavailable');
	});

	it('takes the cappuccino median over live menus only: hardcoded and stale menus are not reads', () => {
		const blobs = healthy();
		blobs.cappuccino = cappuccino([
			shop(3.75, 'live'),
			shop(4.85, 'live'),
			shop(5, 'live'),
			shop(5.5, 'hardcoded'),
			shop(5.5, 'hardcoded'),
			shop(9, 'live', true),
			shop(null, 'live')
		]);
		expect(readLive(blobs, NOW)['coffee.cappuccino']).toMatchObject({
			availability: 'ok',
			value: 4.85
		});
		blobs.cappuccino = cappuccino([shop(5.5, 'hardcoded'), shop(5, 'fallback')]);
		expect(readLive(blobs, NOW)['coffee.cappuccino']).toMatchObject({
			availability: 'unavailable',
			value: null
		});
	});

	it('never calls a grocery reference price ok', () => {
		const blobs = healthy();
		blobs.grocery = grocery([item('marin-kombucha', 4.79, "Driver's Market (ref)")]);
		const read = readLive(blobs, NOW)['grocery.kombucha'];
		expect(read.availability).toBe('stale');
		expect(read.value).toBe(4.79);
		expect(read.reason).toMatch(/reference/);
		expect(readLive(blobs, NOW)['grocery.collagen'].availability).toBe('unavailable');
	});

	it('reads a monthly sync’s last successful scrape, not the default a failed run wrote', () => {
		const blobs = healthy();
		blobs.rivian = monthly('leaseMonthly', [
			{ timestamp: '2026-10-04T16:15:33.243Z', value: 899, scraped: false },
			{ timestamp: '2026-09-24T12:14:11.069Z', value: 1239, scraped: true }
		]);
		expect(readLive(blobs, NOW)['rivian.lease']).toMatchObject({
			availability: 'ok',
			value: 1239,
			observedAt: '2026-09-24T12:14:11.069Z'
		});
	});

	it('marks a monthly sync that never scraped unavailable: a default is never a read', () => {
		const blobs = healthy();
		blobs.ikon = monthly('adultPrice', [
			{ timestamp: '2026-10-02T19:10:39.582Z', value: 1399, scraped: false },
			{ timestamp: '2026-09-02T16:11:40.159Z', value: 1399, scraped: false }
		]);
		expect(readLive(blobs, NOW)['ikon.adult']).toMatchObject({
			availability: 'unavailable',
			value: null
		});
	});

	it('goes stale past the source’s max age in the health inventory', () => {
		const blobs = healthy();
		blobs.ikon = monthly('adultPrice', [
			{ timestamp: '2026-08-01T00:00:00.000Z', value: 1449, scraped: true }
		]);
		expect(readLive(blobs, NOW)['ikon.adult']).toMatchObject({
			availability: 'stale',
			value: 1449
		});
	});
});
