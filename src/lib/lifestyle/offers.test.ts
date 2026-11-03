import { describe, expect, it } from 'vitest';
import {
	USDA_KEYS,
	PGE_EV2_KEYS,
	REDFIN_KEYS,
	type LiveKey,
	type LiveRead,
	type LiveReads
} from './model';
import { offerCacheControl, withOfferEnds } from './offers';
import { priceSheet } from './price';
import { SHEETS } from './sheets';

const RUN = new Date('2026-10-26T14:30:00.000Z');
const ross = SHEETS.find((s) => s.id === 'ross')!;
const ok = (value: number, extra: Partial<LiveRead> = {}): LiveRead => ({
	availability: 'ok',
	value,
	observedAt: '2026-10-26T12:00:00.000Z',
	maxAgeDays: 10,
	source: 'test',
	...extra
});
const offer = { period: 'offer, deliveries by Nov 2, 2026', validUntil: '2026-11-02' };
const reads = {
	'gas.regular': ok(6.2),
	'coffee.cappuccino': ok(5),
	'ikon.adult': ok(1529),
	...Object.fromEntries(USDA_KEYS.map((k) => [k, ok(400)])),
	...Object.fromEntries(PGE_EV2_KEYS.map((k) => [k, ok(0.3)])),
	...Object.fromEntries(REDFIN_KEYS.map((k) => [k, ok(3000000)])),
	'rangeRover.lease': ok(999, offer),
	'rangeRover.dueAtSigning': ok(8995, offer)
} as Record<LiveKey, LiveRead> as LiveReads;

const lease = (b: ReturnType<typeof priceSheet>) =>
	b.lines.find((l) => l.id === 'ross.car.rangeRover.lease')!;

describe('an offer past its end, between runs (Codex R2 P1)', () => {
	const stored = priceSheet(ross, reads, RUN);

	it('is priced while the offer runs, and left alone', () => {
		expect(lease(stored).availability).toBe('ok');
		expect(withOfferEnds([stored], SHEETS, new Date('2026-11-02T20:00:00.000Z'))[0]).toBe(stored);
	});

	it('reads unavailable once the clock passes its end, with no producer run', () => {
		const [read] = withOfferEnds([stored], SHEETS, new Date('2026-11-03T08:00:00.000Z'));
		expect(lease(read)).toMatchObject({ monthly: null, availability: 'unavailable' });
		expect(lease(read).inputs.find((i) => i.name === 'pay')).toMatchObject({
			value: null,
			reason: 'offer ended 2026-11-02'
		});
		// Exactly what the engine says for that read, priced as of the stored run.
		const expired = { ...offer, availability: 'unavailable', value: null, observedAt: null };
		const engine = priceSheet(
			ross,
			{
				...reads,
				'rangeRover.lease': {
					...reads['rangeRover.lease'],
					...expired,
					reason: 'offer ended 2026-11-02'
				},
				'rangeRover.dueAtSigning': {
					...reads['rangeRover.dueAtSigning'],
					...expired,
					reason: 'offer ended 2026-11-02'
				}
			} as LiveReads,
			RUN
		);
		expect(read).toEqual(engine);
		expect(read.complete).toBe(false);
		expect(read.breakEven).toBeNull();
		expect(read.burnMonthly).toBeCloseTo(stored.burnMonthly - lease(stored).monthly!, 6);
	});

	it('still drops the lease when the stored budget predates the sheet in code', () => {
		const older = { ...stored, sheetVersion: 'an older sheet' };
		const [read] = withOfferEnds([older], SHEETS, new Date('2026-11-03T08:00:00.000Z'));
		expect(lease(read)).toMatchObject({ monthly: null, availability: 'unavailable' });
		expect(read).toMatchObject({ complete: false, breakEven: null });
		expect(read.burnMonthly).toBeCloseTo(stored.burnMonthly - lease(stored).monthly!, 6);
		expect(read.sections.cars).toBeCloseTo(stored.sections.cars! - lease(stored).monthly!, 6);
	});
});

describe('a cached page never outlives an offer (Codex)', () => {
	const stored = priceSheet(ross, reads, RUN);

	it('caches as asked when no offer ends inside the window', () => {
		const early = new Date('2026-10-27T00:00:00.000Z');
		expect(offerCacheControl([stored], early, 600, 3600)).toBe(
			'public, s-maxage=600, stale-while-revalidate=3600'
		);
	});

	it('caps freshness and staleness at the offer’s end', () => {
		// 2026-11-02T23:59:59.999Z is the offer's last instant: 1,200 s after this.
		const near = new Date('2026-11-02T23:40:00.000Z');
		expect(offerCacheControl([stored], near, 600, 3600)).toBe(
			'public, s-maxage=600, stale-while-revalidate=599'
		);
		const nearer = new Date('2026-11-02T23:55:00.000Z');
		expect(offerCacheControl([stored], nearer, 600, 3600)).toBe(
			'public, s-maxage=299, stale-while-revalidate=0'
		);
	});
});
