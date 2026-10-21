/**
 * Our own reads, as the Lifestyle Index's live inputs. Each carries the
 * upstream observation time (the last successful read), never the time a blob
 * was written. A fallback, default or reference price is never `ok`; a value
 * we cannot vouch for is `unavailable`, never a substitute.
 */
import type { Availability, LiveKey, LiveRead, LiveReads } from '$lib/lifestyle/model';
import { FUTURE_TOLERANCE_MS, parseTimestamp } from '$lib/server/health/evaluate';
import { SOURCE_INVENTORY } from '$lib/server/health/inventory';

/** The blobs the live inputs come from. */
export const LIVE_BLOBS = {
	gas: 'marin-gas-prices.json',
	cappuccino: 'marin-cappuccino.json',
	grocery: 'marin-grocery-basket.json',
	ikon: 'marin-ikon-pass.json',
	rivian: 'marin-rivian-lease.json'
} as const;
export type LiveBlobName = keyof typeof LIVE_BLOBS;
/** Parsed blob JSON, or null when the blob could not be read. */
export type RawLiveBlobs = Record<LiveBlobName, unknown>;

const GROCERY_ITEMS = {
	'grocery.collagen': 'vital-proteins-collagen',
	'grocery.manuka': 'manuka-honey',
	'grocery.kombucha': 'marin-kombucha',
	'grocery.oatMilk': 'oatly-oatmilk',
	'grocery.silverOak': 'silver-oak-cabernet'
} as const;

const DAY_MS = 86_400_000;

type Json = Record<string, unknown>;
const isRecord = (v: unknown): v is Json =>
	typeof v === 'object' && v !== null && !Array.isArray(v);
const record = (v: unknown): Json | null => (isRecord(v) ? v : null);
const amount = (v: unknown): number | null =>
	typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function maxAgeDays(blob: LiveBlobName): number {
	const policy = SOURCE_INVENTORY.find((s) => s.blobKey === LIVE_BLOBS[blob]);
	if (!policy) throw new Error(`${LIVE_BLOBS[blob]} is not in the health inventory`);
	return policy.maxAgeDays;
}

const unavailable = (blob: LiveBlobName, source: string, reason: string): LiveRead => ({
	availability: 'unavailable',
	value: null,
	observedAt: null,
	maxAgeDays: maxAgeDays(blob),
	source,
	reason
});

/** A value observed at `at`: ok inside the source's max age, else stale. */
function observed(
	blob: LiveBlobName,
	source: string,
	value: number | null,
	at: unknown,
	now: Date,
	fallbackReason?: string
): LiveRead {
	if (value === null) return unavailable(blob, source, 'no value');
	const ms = parseTimestamp(at);
	if (ms === null) return unavailable(blob, source, 'no successful read');
	if (ms > now.getTime() + FUTURE_TOLERANCE_MS)
		return unavailable(blob, source, 'read time in the future');
	const observedAt = new Date(ms).toISOString();
	const tooOld = now.getTime() - ms > maxAgeDays(blob) * DAY_MS;
	const availability: Availability = fallbackReason || tooOld ? 'stale' : 'ok';
	const reason = fallbackReason ?? (tooOld ? `older than ${maxAgeDays(blob)}d` : undefined);
	const maxAge = maxAgeDays(blob);
	return {
		availability,
		value,
		observedAt,
		maxAgeDays: maxAge,
		source,
		...(reason ? { reason } : {})
	};
}

const median = (xs: number[]) => {
	const s = [...xs].sort((a, b) => a - b);
	const mid = Math.floor(s.length / 2);
	return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const iso = (ms: number) => new Date(ms).toISOString();

/** A price with its own upstream observation time, or nothing we can vouch for. */
function dated(price: unknown, at: unknown, now: Date): { price: number; ms: number } | null {
	const p = amount(price);
	const ms = parseTimestamp(at);
	if (p === null || ms === null || ms > now.getTime() + FUTURE_TOLERANCE_MS) return null;
	return { price: p, ms };
}

/**
 * Each station's regular price carries Google's own observation time. The
 * read averages the prices observed inside the max age and is dated by the
 * oldest of them; if none is that fresh, it averages what there is, stale.
 */
function gas(raw: unknown, now: Date): LiveRead {
	const current = record(record(raw)?.current);
	const prices = list(current?.stations).flatMap((st) =>
		list(record(st)?.fuelPrices)
			.map(record)
			.filter((f) => f?.type === 'REGULAR_UNLEADED')
			.map((f) => dated(f?.price, f?.updateTime, now))
			.filter((d): d is { price: number; ms: number } => d !== null)
	);
	const fresh = prices.filter((d) => now.getTime() - d.ms <= maxAgeDays('gas') * DAY_MS);
	const used = fresh.length ? fresh : prices;
	const source = `Marin average regular, ${used.length} station prices (Google Places)`;
	if (used.length === 0) return unavailable('gas', source, 'no dated regular price');
	const at = fresh.length ? Math.min(...used.map((d) => d.ms)) : Math.max(...used.map((d) => d.ms));
	return observed('gas', source, mean(used.map((d) => d.price)), iso(at), now);
}

/**
 * Only menus read live (not hardcoded, fallback or stale) count, each dated by
 * its own read; the median is dated by the oldest menu in it.
 */
function cappuccino(raw: unknown, now: Date): LiveRead {
	const current = record(record(raw)?.current);
	const menus = list(current?.shops)
		.map(record)
		.filter((s) => s?.priceSource === 'live' && s.isStale !== true)
		.map((s) => dated(s?.price, s?.updateTime, now))
		.filter((d): d is { price: number; ms: number } => d !== null);
	const source = `Marin cappuccino median, ${menus.length} live menus (Toast)`;
	if (menus.length === 0) return unavailable('cappuccino', source, 'no live menu');
	const at = Math.min(...menus.map((d) => d.ms));
	return observed('cappuccino', source, median(menus.map((d) => d.price)), iso(at), now);
}

/**
 * A grocery price is a read only from a run that itself succeeded (its own
 * time is the last success): a blocked run writes reference prices under
 * plain store names. Inside a good run, an item marked "(ref)" fell back.
 */
function groceryItem(raw: unknown, itemId: string, now: Date): LiveRead {
	const source = `Instacart, cheapest Marin store (${itemId})`;
	const current = record(record(raw)?.current);
	if (!current) return unavailable('grocery', source, 'no snapshot');
	const ran = parseTimestamp(current.timestamp);
	if (ran === null || ran !== parseTimestamp(current.lastSuccessfulScrapeAt)) {
		return unavailable('grocery', source, 'the latest run was not a successful read');
	}
	const found = list(current.items)
		.map(record)
		.find((i) => i?.itemId === itemId);
	if (!found) return unavailable('grocery', source, 'item not in the basket');
	const store = typeof found.cheapestStore === 'string' ? found.cheapestStore : '';
	const reference = store.endsWith('(ref)') ? 'reference price, not read this run' : undefined;
	return observed('grocery', source, amount(found.cheapest), iso(ran), now, reference);
}

/** sync-rivian-lease.mjs writes this lease when its lease scrape fails. */
const RIVIAN_DEFAULT_LEASE = 899;

/**
 * The monthly syncs write a default (Rivian) or the previous price (Ikon) when
 * a scrape fails, so the value is the newest snapshot whose own field was read.
 */
function lastScraped(
	blob: 'ikon' | 'rivian',
	raw: unknown,
	field: string,
	source: string,
	now: Date
): LiveRead {
	const root = record(raw);
	const snapshots = [root?.current, ...list(root?.history)].map(record);
	const read = (s: Json | null): s is Json => {
		if (s?.scraped !== true || amount(s[field]) === null) return false;
		if (blob !== 'rivian') return true;
		// `scraped` also covers an MSRP-only read; older snapshots predate `leaseScraped`.
		return s.leaseScraped === undefined
			? s[field] !== RIVIAN_DEFAULT_LEASE
			: s.leaseScraped === true;
	};
	const hit = snapshots.find(read);
	if (!hit) return unavailable(blob, source, 'never read');
	return observed(
		blob,
		source,
		amount(hit[field]),
		hit.lastSuccessfulScrapeAt ?? hit.timestamp,
		now
	);
}

export function readLive(blobs: RawLiveBlobs, now: Date): LiveReads {
	const reads: Record<LiveKey, LiveRead> = {
		'gas.regular': gas(blobs.gas, now),
		'coffee.cappuccino': cappuccino(blobs.cappuccino, now),
		'grocery.collagen': groceryItem(blobs.grocery, GROCERY_ITEMS['grocery.collagen'], now),
		'grocery.manuka': groceryItem(blobs.grocery, GROCERY_ITEMS['grocery.manuka'], now),
		'grocery.kombucha': groceryItem(blobs.grocery, GROCERY_ITEMS['grocery.kombucha'], now),
		'grocery.oatMilk': groceryItem(blobs.grocery, GROCERY_ITEMS['grocery.oatMilk'], now),
		'grocery.silverOak': groceryItem(blobs.grocery, GROCERY_ITEMS['grocery.silverOak'], now),
		'ikon.adult': lastScraped(
			'ikon',
			blobs.ikon,
			'adultPrice',
			'Ikon Pass adult, ikonpass.com',
			now
		),
		'rivian.lease': lastScraped(
			'rivian',
			blobs.rivian,
			'leaseMonthly',
			'Rivian R1S lease, rivian.com',
			now
		)
	};
	return reads;
}
