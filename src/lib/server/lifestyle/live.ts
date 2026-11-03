/**
 * Our own reads, as the Lifestyle Index's live inputs. Each carries the
 * upstream observation time (the last successful read), never the time a blob
 * was written. A fallback, default or reference price is never `ok`; a value
 * we cannot vouch for is `unavailable`, never a substitute.
 */
import {
	PGE_EV2_KEYS,
	RANGE_ROVER_KEYS,
	REDFIN_KEYS,
	USDA_KEYS,
	type LiveKey,
	type LiveRead,
	type LiveReads
} from '$lib/lifestyle/model';
import { FUTURE_TOLERANCE_MS, parseTimestamp } from '$lib/server/health/evaluate';
import { SOURCE_INVENTORY } from '$lib/server/health/inventory';

/** The blobs the live inputs come from. */
export const LIVE_BLOBS = {
	gas: 'marin-gas-prices.json',
	cappuccino: 'marin-cappuccino.json',
	ikon: 'marin-ikon-pass.json',
	usda: 'marin-usda-food-plans.json',
	pge: 'marin-pge-ev2.json',
	rangeRover: 'marin-range-rover-lease.json',
	redfin: 'marin-redfin-cities.json'
} as const;
export type LiveBlobName = keyof typeof LIVE_BLOBS;
/** Parsed blob JSON, or null when the blob could not be read. */
export type RawLiveBlobs = Record<LiveBlobName, unknown>;

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
	now: Date
): LiveRead {
	if (value === null) return unavailable(blob, source, 'no value');
	const ms = parseTimestamp(at);
	if (ms === null) return unavailable(blob, source, 'no successful read');
	if (ms > now.getTime() + FUTURE_TOLERANCE_MS)
		return unavailable(blob, source, 'read time in the future');
	const maxAge = maxAgeDays(blob);
	const tooOld = now.getTime() - ms > maxAge * DAY_MS;
	return {
		availability: tooOld ? 'stale' : 'ok',
		value,
		observedAt: new Date(ms).toISOString(),
		maxAgeDays: maxAge,
		source,
		...(tooOld ? { reason: `older than ${maxAge}d` } : {})
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
 * The Ikon sync writes the previous price when a scrape fails, so the value is
 * the newest snapshot whose own field was read.
 */
function lastScraped(raw: unknown, field: string, source: string, now: Date): LiveRead {
	const root = record(raw);
	const snapshots = [root?.current, ...list(root?.history)].map(record);
	const hit = snapshots.find((s): s is Json => s?.scraped === true && amount(s[field]) !== null);
	if (!hit) return unavailable('ikon', source, 'never read');
	return observed(
		'ikon',
		source,
		amount(hit[field]),
		hit.lastSuccessfulScrapeAt ?? hit.timestamp,
		now
	);
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

/**
 * A published series (scripts/sync-*.mjs, COSTDATA-1): one value per key in
 * `current.values`, with three times kept apart. `observedAt` is what ages it:
 * the report's period end where the source has periods, our check where the
 * figure is "in effect" (a tariff, an offer). Fetching again never refreshes an
 * old period; an offer's own end rides along to be enforced wherever it is read.
 */
function published(
	blob: LiveBlobName,
	raw: unknown,
	key: string,
	measure: 'period' | 'checked',
	source: (period: string | undefined) => string,
	now: Date
): LiveRead {
	const current = record(record(raw)?.current);
	const period = str(current?.period);
	const label = source(period);
	if (!current) return unavailable(blob, label, 'no snapshot');
	const checked = parseTimestamp(current.lastSuccessfulScrapeAt);
	const at = measure === 'period' ? current.periodEnd : current.lastSuccessfulScrapeAt;
	const read = observed(blob, label, amount(record(current.values)?.[key]), at, now);
	const validUntil = str(current.validUntil);
	return {
		...read,
		...(period ? { period } : {}),
		...(measure === 'period' && checked !== null ? { checkedAt: iso(checked) } : {}),
		...(validUntil ? { validUntil } : {})
	};
}

const usdaSource = (period: string | undefined) =>
	`USDA Liberal food plan${period ? `, ${period}` : ''} (fna.usda.gov)`;

const ev2Source = (period: string | undefined) =>
	`PG&E Schedule EV2, winter${period ? `, ${period}` : ''} (pge.com)`;

const rangeRoverSource = (period: string | undefined) =>
	`Range Rover Sport P360 SE lease, 24 mo, US${period ? `, ${period}` : ''} (rangerover.com)`;

const TOWNS: Record<(typeof REDFIN_KEYS)[number], string> = {
	'redfin.larkspur.latest': 'Larkspur',
	'redfin.millValley.latest': 'Mill Valley',
	'redfin.ross.latest': 'Ross'
};
/** Q3: labelled as what it is, with its sale count beside its period (Ross's handful swings). */
function redfin(raw: unknown, key: (typeof REDFIN_KEYS)[number], now: Date): LiveRead {
	const read = published(
		'redfin',
		raw,
		key,
		'period',
		() => `${TOWNS[key]} median sale, all residential, Redfin`,
		now
	);
	const sold = record(record(record(raw)?.current)?.sales)?.[key];
	return typeof sold === 'number' && read.period
		? { ...read, period: `${read.period}, ${sold} sale${sold === 1 ? '' : 's'}` }
		: read;
}

export function readLive(blobs: RawLiveBlobs, now: Date): LiveReads {
	const reads: Record<LiveKey, LiveRead> = {
		'gas.regular': gas(blobs.gas, now),
		'coffee.cappuccino': cappuccino(blobs.cappuccino, now),
		'ikon.adult': lastScraped(blobs.ikon, 'adultPrice', 'Ikon Pass adult, ikonpass.com', now),
		...(Object.fromEntries(
			USDA_KEYS.map((key) => [key, published('usda', blobs.usda, key, 'period', usdaSource, now)])
		) as Record<(typeof USDA_KEYS)[number], LiveRead>),
		// A tariff is the rate in effect: our check ages it, its effective date rides along.
		...(Object.fromEntries(
			PGE_EV2_KEYS.map((key) => [key, published('pge', blobs.pge, key, 'checked', ev2Source, now)])
		) as Record<(typeof PGE_EV2_KEYS)[number], LiveRead>),
		// One offer: both parts from the same read, and both end with it (validUntil).
		...(Object.fromEntries(
			RANGE_ROVER_KEYS.map((key) => [
				key,
				published('rangeRover', blobs.rangeRover, key, 'checked', rangeRoverSource, now)
			])
		) as Record<(typeof RANGE_ROVER_KEYS)[number], LiveRead>),
		...(Object.fromEntries(
			REDFIN_KEYS.map((key) => [key, redfin(blobs.redfin, key, now)])
		) as Record<(typeof REDFIN_KEYS)[number], LiveRead>)
	};
	return reads;
}
