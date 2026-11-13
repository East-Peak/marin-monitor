import { describe, expect, it } from 'vitest';
import {
	RIVIAN_OFFER,
	rivianSheetDue,
	validateRivianOffer,
	type RivianOffer
} from './rivian-offer';
import { CITED } from './sources';
import { priceInput, priceSheet } from './price';
import { SHEETS } from './sheets';
import { offerCacheControl, withOfferEnds } from './offers';
import { USDA_KEYS, PGE_EV2_KEYS, REDFIN_KEYS, type LiveRead, type LiveReads } from './model';

const good: RivianOffer = {
	...RIVIAN_OFFER,
	dueIncludesFirstPayment: false,
	validUntil: '2026-12-02',
	checkedAt: '2026-11-20'
};

describe('one dated record per Rivian offer, every part from the one offer', () => {
	it('the record on file is valid, and is the example offer that ended 2026-11-02', () => {
		expect(validateRivianOffer(RIVIAN_OFFER)).toEqual([]);
		expect(RIVIAN_OFFER).toMatchObject({
			monthlyPayment: 1209,
			dueAtSigning: 9104,
			termMonths: 36,
			validUntil: '2026-11-02',
			url: 'https://rivian.com/r1s'
		});
	});

	it('holds trim, region, payment, due, term, mileage, end, source, disclosure and the first-payment flag', () => {
		for (const k of [
			'trim',
			'region',
			'monthlyPayment',
			'dueAtSigning',
			'termMonths',
			'milesPerYear',
			'validUntil',
			'url',
			'disclosure',
			'dueIncludesFirstPayment',
			'checkedAt'
		])
			expect(RIVIAN_OFFER).toHaveProperty(k);
	});

	it('rejects parts that are not one offer', () => {
		expect(validateRivianOffer({ ...good, monthlyPayment: 1109 })).toEqual(
			expect.arrayContaining([expect.stringMatching(/disclosure.*\$1,109/)])
		);
		expect(validateRivianOffer({ ...good, dueAtSigning: 7604 })).toEqual(
			expect.arrayContaining([expect.stringMatching(/disclosure.*\$7,604/)])
		);
		expect(validateRivianOffer({ ...good, termMonths: 24 })).toEqual(
			expect.arrayContaining([expect.stringMatching(/disclosure.*24/)])
		);
	});

	it('rejects a malformed record', () => {
		expect(validateRivianOffer({ ...good, validUntil: 'soon' }).length).toBeGreaterThan(0);
		expect(validateRivianOffer({ ...good, region: '' }).length).toBeGreaterThan(0);
		expect(validateRivianOffer({ ...good, url: 'https://example.com/r1s' }).length).toBeGreaterThan(
			0
		);
		expect(validateRivianOffer({ ...good, termMonths: 0 }).length).toBeGreaterThan(0);
		expect(
			validateRivianOffer({ ...good, dueIncludesFirstPayment: true, dueAtSigning: 1000 }).length
		).toBeGreaterThan(0);
	});

	it('never counts the first payment twice', () => {
		// The sheet adds the monthly payment for every month, so a due-at-signing that already holds the first one gives it up.
		expect(rivianSheetDue({ ...good, dueIncludesFirstPayment: true })).toBe(9104 - 1209);
		expect(rivianSheetDue({ ...good, dueIncludesFirstPayment: false })).toBe(9104);
	});
});

describe('the sheet reads the record, and its end is enforced at read time', () => {
	it('the cited Rivian figures are the record’s, with its end and no change to the maths', () => {
		expect(CITED['rivian.lease']).toMatchObject({ figure: 1209, validUntil: '2026-11-02' });
		expect(CITED['rivian.dueAtSigning']).toMatchObject({ figure: 9104, validUntil: '2026-11-02' });
	});

	it('an ended offer reads stale, with the figure kept, never fresh', () => {
		const spec = { class: 'cited', cite: 'rivian.lease' } as const;
		const priced = priceInput('pay', spec, {} as LiveReads, new Date('2026-11-13T12:00:00Z'));
		expect(priced).toMatchObject({
			availability: 'stale',
			value: 1209,
			reason: 'past 2026-11-02'
		});
	});

	const ok = (value: number): LiveRead => ({
		availability: 'ok',
		value,
		observedAt: '2026-10-26T12:00:00.000Z',
		maxAgeDays: 10,
		source: 'test'
	});
	const reads = {
		'gas.regular': ok(6.2),
		'coffee.cappuccino': ok(5),
		'ikon.adult': ok(1529),
		...Object.fromEntries(USDA_KEYS.map((k) => [k, ok(400)])),
		...Object.fromEntries(PGE_EV2_KEYS.map((k) => [k, ok(0.3)])),
		...Object.fromEntries(REDFIN_KEYS.map((k) => [k, ok(3000000)])),
		'rangeRover.lease': ok(999),
		'rangeRover.dueAtSigning': ok(8995)
	} as unknown as LiveReads;
	const larkspur = SHEETS.find((s) => s.id === 'larkspur')!;
	const lease = (b: ReturnType<typeof priceSheet>) =>
		b.lines.find((l) => l.id === 'larkspur.car.rivian.lease')!;

	it('a stored budget priced while the offer ran reads stale once its end passes, with no producer run', () => {
		// Priced Nov 1, when the offer still ran; read Nov 3, after it ended.
		const stored = priceSheet(larkspur, reads, new Date('2026-11-01T14:30:00Z'));
		expect(lease(stored).availability).toBe('ok');
		const [read] = withOfferEnds([stored], SHEETS, new Date('2026-11-03T08:00:00Z'));
		expect(lease(read)).toMatchObject({ availability: 'stale' });
		expect(lease(read).monthly).toBe(lease(stored).monthly);
		expect(lease(read).inputs.find((i) => i.name === 'pay')).toMatchObject({
			availability: 'stale',
			reason: 'past 2026-11-02'
		});
	});

	it('a cached page is capped at the offer’s end', () => {
		const stored = priceSheet(larkspur, reads, new Date('2026-11-01T14:30:00Z'));
		const near = new Date('2026-11-02T23:55:00.000Z');
		expect(offerCacheControl([stored], near, 600, 3600)).toBe(
			'public, s-maxage=299, stale-while-revalidate=0'
		);
	});
});

describe('repricing a stored budget whose Silver Oak line used the live read', () => {
	it('keeps the live price when an offer ends between runs, rather than falling back to the citation', () => {
		const ok = (value: number, extra: Partial<LiveRead> = {}): LiveRead => ({
			availability: 'ok',
			value,
			observedAt: '2026-10-26T12:00:00.000Z',
			maxAgeDays: 10,
			source: 'test',
			...extra
		});
		const ross = SHEETS.find((s) => s.id === 'ross')!;
		const offer = { validUntil: '2026-11-02' };
		const reads = {
			'gas.regular': ok(6.2),
			'coffee.cappuccino': ok(5),
			'ikon.adult': ok(1529),
			...Object.fromEntries(USDA_KEYS.map((k) => [k, ok(400)])),
			...Object.fromEntries(PGE_EV2_KEYS.map((k) => [k, ok(0.3)])),
			...Object.fromEntries(REDFIN_KEYS.map((k) => [k, ok(3000000)])),
			'rangeRover.lease': ok(999, offer),
			'rangeRover.dueAtSigning': ok(8995, offer),
			'wine.silverOak.av2022': ok(87.5)
		} as unknown as LiveReads;
		const stored = priceSheet(ross, reads, new Date('2026-10-26T14:30:00Z'));
		const price = (b: typeof stored) =>
			b.lines.find((l) => l.id === 'ross.food.wine')!.inputs.find((i) => i.name === 'price')!;
		expect(price(stored)).toMatchObject({ class: 'live', value: 87.5 });
		const [read] = withOfferEnds([stored], SHEETS, new Date('2026-11-03T08:00:00Z'));
		expect(price(read)).toMatchObject({ class: 'live', value: 87.5 });
	});
});
