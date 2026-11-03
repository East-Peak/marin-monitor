/**
 * Server-side housing data scraper: Marin County, all residential, monthly,
 * from Redfin's Data Center `all_counties.csv` (the old
 * `county_market_tracker.tsv000.gz` returns 403 since 2026-11). The file is
 * ~150 MB, so it is streamed line by line and only Marin's rows are kept.
 *
 * The blob carries the source's own period: health measures the data's age
 * from `periodEnd`, never from the upload, so a re-read of an old month is
 * still old.
 */
import { Readable } from 'node:stream';
import { createInterface } from 'node:readline';
import { fetchWithTimeout } from '$lib/server/fetch-utils';
import type { HousingMetric } from '$lib/api/marin/housing';

export const REDFIN_COUNTIES_URL =
	'https://redfin-public-data.s3.us-west-2.amazonaws.com/redfin_data_center/housing_market/monthly/all_counties.csv';

export interface HousingDoc {
	/** Our read. */
	readonly lastSuccessfulScrapeAt: string;
	/** The last day of the newest month in the file (UTC midnight). */
	readonly periodEnd: string;
	/** Oldest first; at most 24. */
	readonly months: readonly HousingMetric[];
}

const REGION = 'Marin County, CA';
const COLUMNS = {
	frequency: 'FREQUENCY',
	begin: 'PERIOD BEGIN',
	end: 'PERIOD END',
	region: 'REGION NAME',
	medianPrice: 'MEDIAN SALE PRICE NSA ($)',
	medianPpsf: 'MEDIAN SALE PRICE PER SQ.FT. ($)',
	inventory: 'INVENTORY',
	daysOnMarket: 'MEDIAN DAYS ON MARKET (DAYS)',
	homesSold: 'HOMES SOLD'
} as const;

/** One CSV record (RFC 4180, no embedded newlines). */
export function splitCsvLine(line: string): string[] {
	const out: string[] = [];
	let field = '';
	let quoted = false;
	for (let i = 0; i < line.length; i++) {
		const c = line[i];
		if (quoted) {
			if (c === '"' && line[i + 1] === '"') {
				field += '"';
				i++;
			} else if (c === '"') quoted = false;
			else field += c;
		} else if (c === '"') quoted = true;
		else if (c === ',') {
			out.push(field);
			field = '';
		} else field += c;
	}
	out.push(field);
	return out;
}

const num = (v: string | undefined): number | null => {
	if (v === undefined || v === '' || v === 'NA') return null;
	const n = Number(v);
	return Number.isFinite(n) ? n : null;
};

/** Marin's months from the file's lines; throws on anything we cannot vouch for. */
export function parseCountyCsv(lines: Iterable<string>, now: Date): HousingDoc {
	let index: Record<keyof typeof COLUMNS, number> | undefined;
	const rows: { begin: string; end: string; metric: HousingMetric }[] = [];
	for (const line of lines) {
		if (!line) continue;
		if (index === undefined) {
			const header = splitCsvLine(line);
			index = Object.fromEntries(
				Object.entries(COLUMNS).map(([key, name]) => {
					const i = header.indexOf(name);
					if (i < 0) throw new Error(`Redfin counties file has no "${name}" column`);
					return [key, i];
				})
			) as Record<keyof typeof COLUMNS, number>;
			continue;
		}
		// Cheap filter before the full split: Marin's region name is quoted in the row.
		if (!line.includes(`"${REGION}"`)) continue;
		const cols = splitCsvLine(line);
		if (cols[index.region] !== REGION) continue;
		if (cols[index.frequency] !== 'Monthly') {
			throw new Error(`Redfin row for ${cols[index.begin]} is not monthly`);
		}
		rows.push({
			begin: cols[index.begin],
			end: cols[index.end],
			metric: {
				month: cols[index.begin],
				medianPrice: num(cols[index.medianPrice]),
				medianPpsf: num(cols[index.medianPpsf]),
				inventory: num(cols[index.inventory]),
				daysOnMarket: num(cols[index.daysOnMarket]),
				homesSold: num(cols[index.homesSold])
			}
		});
	}
	if (rows.length === 0) throw new Error('Redfin counties file has no Marin County rows');
	rows.sort((a, b) => a.begin.localeCompare(b.begin));
	const end = rows[rows.length - 1].end;
	if (!/^\d{4}-\d{2}-\d{2}$/.test(end)) throw new Error(`Redfin period end "${end}" is not a date`);
	return {
		lastSuccessfulScrapeAt: now.toISOString(),
		periodEnd: `${end}T00:00:00.000Z`,
		months: rows.slice(-24).map((r) => r.metric)
	};
}

/** A streamed body, line by line. */
async function* bodyLines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
	const readable = Readable.fromWeb(body as import('stream/web').ReadableStream);
	yield* createInterface({ input: readable, crlfDelay: Infinity });
}

export async function scrapeHousing(now = new Date()): Promise<HousingDoc> {
	const response = await fetchWithTimeout(
		REDFIN_COUNTIES_URL,
		{ headers: { 'User-Agent': 'Mozilla/5.0' } },
		30000
	);
	if (!response.ok) throw new Error(`Redfin fetch failed: ${response.status}`);
	if (!response.body) throw new Error('Redfin response has no body');
	// Keep the header and Marin's lines only; the parse then runs on a few hundred.
	const kept: string[] = [];
	for await (const line of bodyLines(response.body)) {
		if (kept.length === 0 || line.includes(`"${REGION}"`)) kept.push(line);
	}
	return parseCountyCsv(kept, now);
}

/** The months, from either blob shape: the old bare array or a HousingDoc. */
export function housingMonths(blob: unknown): HousingMetric[] | null {
	if (Array.isArray(blob)) return blob as HousingMetric[];
	if (typeof blob === 'object' && blob !== null && Array.isArray((blob as HousingDoc).months)) {
		return [...(blob as HousingDoc).months];
	}
	return null;
}
