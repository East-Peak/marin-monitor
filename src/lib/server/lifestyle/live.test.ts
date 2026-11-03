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

/** The shape the monthly Ikon sync writes. */
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

/** The shape the published-series syncs write (scripts/sync-usda-food-plans.mjs and kin). */
const usda = (periodEnd = '2026-09-30T00:00:00.000Z', checked = '2026-10-19T12:00:00.000Z') => ({
	current: {
		timestamp: checked,
		lastSuccessfulScrapeAt: checked,
		url: 'https://www.fna.usda.gov/x.pdf',
		period: 'September 2026',
		periodEnd,
		values: { 'usda.liberal.m19to50': 486.8, 'usda.liberal.f19to50': 429.6 }
	}
});

const ev2 = (checked = '2026-10-19T12:00:00.000Z') => ({
	current: {
		timestamp: checked,
		lastSuccessfulScrapeAt: checked,
		url: 'https://www.pge.com/tariffs/x.pdf',
		period: 'effective Jun 1, 2026',
		effective: '2026-06-01',
		values: { 'pge.ev2a.peak': 0.41099, 'pge.ev2a.offPeak': 0.22558 }
	}
});

const rangeRover = (validUntil = '2026-11-30') => ({
	current: {
		timestamp: '2026-10-19T12:00:00.000Z',
		lastSuccessfulScrapeAt: '2026-10-19T12:00:00.000Z',
		url: 'https://www.rangerover.com/x.html',
		period: 'offer, deliveries by Nov 30, 2026',
		validUntil,
		trim: '2026 Range Rover Sport P360 SE',
		months: 24,
		region: 'US',
		values: { 'rangeRover.lease': 999, 'rangeRover.dueAtSigning': 8995 }
	}
});

const healthy = (): RawLiveBlobs => ({
	usda: usda(),
	pge: ev2(),
	rangeRover: rangeRover(),
	gas: gas('2026-10-20T12:00:00.000Z'),
	cappuccino: cappuccino([shop(5, 'live'), shop(4.85, 'live'), shop(5, 'live')]),
	ikon: monthly('adultPrice', [
		{ timestamp: '2026-10-02T19:10:39.582Z', value: 1529, scraped: true }
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
		expect(live['ikon.adult']).toMatchObject({ availability: 'ok', value: 1529 });
		for (const read of [
			live['gas.regular'],
			live['coffee.cappuccino'],
			live['ikon.adult'],
			live['usda.liberal.m19to50']
		])
			expect(read.availability).toBe('ok');
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

	it('reads a monthly sync’s last successful scrape, not the price a failed run carried over', () => {
		const blobs = healthy();
		blobs.ikon = monthly('adultPrice', [
			{ timestamp: '2026-10-02T19:10:39.582Z', value: 1399, scraped: false },
			{ timestamp: '2026-09-10T16:11:40.159Z', value: 1529, scraped: true }
		]);
		expect(readLive(blobs, NOW)['ikon.adult']).toMatchObject({
			availability: 'ok',
			value: 1529,
			observedAt: '2026-09-10T16:11:40.159Z'
		});
	});

	it('reads a USDA figure dated by its report month, with our check beside it', () => {
		expect(readLive(healthy(), NOW)['usda.liberal.m19to50']).toEqual({
			availability: 'ok',
			value: 486.8,
			observedAt: '2026-09-30T00:00:00.000Z',
			maxAgeDays: 75,
			source: 'USDA Liberal food plan, September 2026 (fna.usda.gov)',
			period: 'September 2026',
			checkedAt: '2026-10-19T12:00:00.000Z'
		});
	});

	it('keeps an old report stale even when it was fetched again today', () => {
		const blobs = {
			...healthy(),
			usda: usda('2026-07-31T00:00:00.000Z', '2026-10-20T12:00:00.000Z')
		};
		expect(readLive(blobs, NOW)['usda.liberal.m19to50']).toMatchObject({
			availability: 'stale',
			value: 486.8,
			reason: 'older than 75d'
		});
	});

	it('marks a figure missing from the report, or a missing blob, unavailable', () => {
		expect(readLive(healthy(), NOW)['usda.liberal.c6to8']).toMatchObject({
			availability: 'unavailable',
			value: null
		});
		expect(readLive({ ...healthy(), usda: null }, NOW)['usda.liberal.m19to50'].availability).toBe(
			'unavailable'
		);
	});

	it('reads the EV2 winter rate as the rate in effect at our check, with its effective date', () => {
		expect(readLive(healthy(), NOW)['pge.ev2a.offPeak']).toEqual({
			availability: 'ok',
			value: 0.22558,
			observedAt: '2026-10-19T12:00:00.000Z',
			maxAgeDays: 10,
			source: 'PG&E Schedule EV2, winter, effective Jun 1, 2026 (pge.com)',
			period: 'effective Jun 1, 2026'
		});
		const old = { ...healthy(), pge: ev2('2026-10-01T12:00:00.000Z') };
		expect(readLive(old, NOW)['pge.ev2a.peak'].availability).toBe('stale');
	});

	it('reads both lease parts from the one offer, each carrying its end', () => {
		const live = readLive(healthy(), NOW);
		for (const [key, value] of [
			['rangeRover.lease', 999],
			['rangeRover.dueAtSigning', 8995]
		] as const) {
			expect(live[key]).toMatchObject({
				availability: 'ok',
				value,
				observedAt: '2026-10-19T12:00:00.000Z',
				validUntil: '2026-11-30',
				period: 'offer, deliveries by Nov 30, 2026'
			});
		}
	});

	it('has no grocery or Rivian reads: those scrapes stopped (COSTDATA Q1)', () => {
		const keys = Object.keys(readLive(healthy(), NOW));
		expect(keys.filter((k) => k.startsWith('grocery.') || k.startsWith('rivian.'))).toEqual([]);
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
