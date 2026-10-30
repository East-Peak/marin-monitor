/**
 * Reading the Lifestyle Index for display (LIFE2), behind a server-side flag.
 *
 * The flag is off in production until Stuart's look: the card, the household
 * page and the TV hero then don't exist, and the old composite stays the
 * public view. e2e cannot intercept a server-side Blob read, so outside
 * production LIFESTYLE_FIXTURE may point at a producer-format file instead.
 */
import { readFile } from 'node:fs/promises';
import type { Anchor } from '$lib/lifestyle/anchors';
import { renderHighlight, type Highlight } from '$lib/lifestyle/highlight-copy';
import { highlightFacts } from '$lib/lifestyle/highlights';
import type { HistoryEntry } from '$lib/lifestyle/history';
import { SECTIONS, type HouseholdSheet } from '$lib/lifestyle/model';
import { budgetsAgainstSheets, householdSummary, type LifestyleCard } from '$lib/lifestyle/view';
import { abortable } from '$lib/server/news/abortable';
import type { BlobApi } from '$lib/server/news/snapshot-store';
import { vercelBlobApi } from '$lib/server/news/vercel-blob-api';
import { isEntry, LIFESTYLE_KEY, type LifestyleSnapshot } from './producer';

type Env = Readonly<Record<string, string | undefined>>;

export const lifestyleOn = (env: Env) => env.LIFESTYLE_INDEX === 'on';

/** The highlights (LIFE3) have their own flag, under the index's: off in production until Stuart's review. */
export const highlightsOn = (env: Env) => lifestyleOn(env) && env.LIFESTYLE_HIGHLIGHTS === 'on';

export function lifestyleBlobApi(
	env: Env,
	blob: (token: string) => BlobApi = vercelBlobApi
): BlobApi | null {
	const fixture = env.LIFESTYLE_FIXTURE;
	if (fixture && env.VERCEL_ENV !== 'production') {
		const readOnly = () => Promise.reject(new Error('the lifestyle fixture is read-only'));
		return {
			async read(key, signal) {
				if (key !== LIFESTYLE_KEY) return null;
				return { text: await abortable(readFile(fixture, 'utf8'), signal), etag: '"fixture"' };
			},
			write: readOnly,
			remove: readOnly
		};
	}
	return env.BLOB_READ_WRITE_TOKEN ? blob(env.BLOB_READ_WRITE_TOKEN) : null;
}

const isObject = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v);

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';

const CLASSES: ReadonlySet<unknown> = new Set(['live', 'cited', 'persona']);
const AVAILABILITY: ReadonlySet<unknown> = new Set(['ok', 'stale', 'unavailable']);
const isStrOrNull = (v: unknown) => v === null || isStr(v);
const SECTION_SET: ReadonlySet<unknown> = new Set(SECTIONS);

function isInput(i: unknown): boolean {
	return (
		isObject(i) &&
		isStr(i.name) &&
		isStr(i.label) &&
		CLASSES.has(i.class) &&
		AVAILABILITY.has(i.availability) &&
		(i.value === null || isNum(i.value)) &&
		isStrOrNull(i.asOf) &&
		isStrOrNull(i.source) &&
		(i.reason === undefined || isStr(i.reason))
	);
}

/** Every number the break-even equation reads. */
function isTaxes(t: unknown): boolean {
	return (
		isObject(t) &&
		isNum(t.gross) &&
		isNum(t.agi) &&
		isNum(t.takeHome) &&
		isObject(t.federal) &&
		isNum(t.federal.tax) &&
		isObject(t.california) &&
		isNum(t.california.tax) &&
		isObject(t.payroll) &&
		isNum(t.payroll.socialSecurity) &&
		isNum(t.payroll.medicare) &&
		isNum(t.payroll.sdi)
	);
}

function isLine(l: unknown): boolean {
	return (
		isObject(l) &&
		isStr(l.id) &&
		isStr(l.label) &&
		SECTION_SET.has(l.section) &&
		typeof l.required === 'boolean' &&
		(l.note === undefined || isStr(l.note)) &&
		(l.reason === undefined || isStr(l.reason)) &&
		AVAILABILITY.has(l.availability) &&
		Array.isArray(l.classes) &&
		l.classes.every((c) => CLASSES.has(c)) &&
		(l.monthly === null || isNum(l.monthly)) &&
		Array.isArray(l.inputs) &&
		l.inputs.every(isInput)
	);
}

/** The fields the card and the household page read from a budget, nested ones included. */
function isBudget(b: unknown): boolean {
	if (!isObject(b)) return false;
	const be = b.breakEven;
	return (
		isStr(b.town) &&
		isNum(b.taxYear) &&
		isStr(b.pricedAt) &&
		isNum(b.burnMonthly) &&
		typeof b.complete === 'boolean' &&
		Array.isArray(b.lines) &&
		b.lines.every(isLine) &&
		isObject(b.sections) &&
		Object.values(b.sections).every(isNum) &&
		isObject(b.personaShare) &&
		isNum(b.personaShare.only) &&
		isInput(b.marketTracker) &&
		(be === null || (isObject(be) && isNum(be.gross) && isTaxes(be.taxes)))
	);
}

const UNITS: ReadonlySet<unknown> = new Set([
	'gross household',
	'net individual',
	'gross individual'
]);

function isAnchor(a: unknown): a is Anchor {
	return (
		isObject(a) &&
		isStr(a.id) &&
		isStr(a.label) &&
		UNITS.has(a.units) &&
		isNum(a.value) &&
		AVAILABILITY.has(a.availability) &&
		Array.isArray(a.inputs) &&
		a.inputs.every(isInput)
	);
}

/** What movers read from an entry, besides its model identity. */
function isHistoryEntry(e: unknown): e is HistoryEntry {
	return (
		isEntry(e) &&
		e.lines.every(
			(l) =>
				(l.monthly === null || isNum(l.monthly)) &&
				Object.values(l.inputs).every(
					(v) => Array.isArray(v) && (v[0] === null || isNum(v[0])) && isStrOrNull(v[1])
				)
		) &&
		Object.values(e.quantities).every(isStr)
	);
}

export interface LifestyleRead {
	readonly current: LifestyleSnapshot;
	/** Null when it can't be read: never an empty history, which would say "no history". */
	readonly history: readonly HistoryEntry[] | null;
}

/**
 * The current snapshot and its history, or null: a missing, failed or malformed
 * snapshot is never an empty index. Malformed anchors are none, so nothing is
 * compared against them.
 */
export async function readLifestyleDoc(
	api: BlobApi,
	signal: AbortSignal
): Promise<LifestyleRead | null> {
	try {
		const stored = await api.read(LIFESTYLE_KEY, signal);
		if (!stored) return null;
		const doc = JSON.parse(stored.text) as unknown;
		const current = isObject(doc) ? doc.current : null;
		if (!isObject(current) || current.schema !== 1 || !isStr(current.computedAt)) return null;
		if (!isStrOrNull(current.lastSuccessfulScrapeAt)) return null;
		if (!Array.isArray(current.budgets) || !current.budgets.every(isBudget)) return null;
		const anchors =
			Array.isArray(current.anchors) && current.anchors.every(isAnchor) ? current.anchors : [];
		const history = isObject(doc) && Array.isArray(doc.history) ? doc.history : null;
		return {
			current: { ...current, anchors } as unknown as LifestyleSnapshot,
			history: history?.every(isHistoryEntry) ? history : null
		};
	} catch {
		return null;
	}
}

/** The current snapshot, or null: a missing, failed or malformed read is never an empty index. */
export async function readLifestyle(
	api: BlobApi,
	signal: AbortSignal
): Promise<LifestyleSnapshot | null> {
	return (await readLifestyleDoc(api, signal))?.current ?? null;
}

/** Each complete household's highlights, rendered, by sheet id. */
export function lifestyleHighlights(
	read: LifestyleRead,
	sheets: readonly HouseholdSheet[]
): Readonly<Record<string, readonly Highlight[]>> {
	const facts = highlightFacts({
		runId: read.current.runId,
		budgets: budgetsAgainstSheets(read.current.budgets, sheets),
		anchors: read.current.anchors,
		history: read.history,
		sheets
	});
	return Object.fromEntries(
		Object.entries(facts).map(([town, fs]) => [town, fs.map(renderHighlight)])
	);
}

/** One summary per household on a sheet we ship, in sheet order, with its highlights when given them. */
export function lifestyleCard(
	snapshot: LifestyleSnapshot,
	sheets: readonly HouseholdSheet[],
	highlights?: Readonly<Record<string, readonly Highlight[]>>
): LifestyleCard {
	return {
		computedAt: snapshot.computedAt,
		lastSuccessfulScrapeAt: snapshot.lastSuccessfulScrapeAt,
		households: sheets.flatMap((sheet) => {
			const b = snapshot.budgets.find((x) => x.town === sheet.id);
			if (!b) return [];
			const summary = householdSummary(b, sheet);
			return [highlights ? { ...summary, highlights: highlights[sheet.id] ?? [] } : summary];
		})
	};
}
