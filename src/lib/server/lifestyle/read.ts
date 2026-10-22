/**
 * Reading the Lifestyle Index for display (LIFE2), behind a server-side flag.
 *
 * The flag is off in production until Stuart's look: the card, the household
 * page and the TV hero then don't exist, and the old composite stays the
 * public view. e2e cannot intercept a server-side Blob read, so outside
 * production LIFESTYLE_FIXTURE may point at a producer-format file instead.
 */
import { readFile } from 'node:fs/promises';
import type { HouseholdSheet } from '$lib/lifestyle/model';
import { householdSummary, type LifestyleCard } from '$lib/lifestyle/view';
import { abortable } from '$lib/server/news/abortable';
import type { BlobApi } from '$lib/server/news/snapshot-store';
import { vercelBlobApi } from '$lib/server/news/vercel-blob-api';
import { LIFESTYLE_KEY, type LifestyleSnapshot } from './producer';

type Env = Readonly<Record<string, string | undefined>>;

export const lifestyleOn = (env: Env) => env.LIFESTYLE_INDEX === 'on';

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

/** The fields the card and the household page read from a budget. */
function isBudget(b: unknown): boolean {
	return (
		isObject(b) &&
		typeof b.town === 'string' &&
		typeof b.pricedAt === 'string' &&
		typeof b.burnMonthly === 'number' &&
		typeof b.complete === 'boolean' &&
		Array.isArray(b.lines) &&
		b.lines.every((l) => isObject(l) && typeof l.id === 'string' && Array.isArray(l.inputs)) &&
		isObject(b.sections) &&
		isObject(b.personaShare) &&
		(b.breakEven === null || isObject(b.breakEven))
	);
}

/** The current snapshot, or null: a missing, failed or malformed read is never an empty index. */
export async function readLifestyle(
	api: BlobApi,
	signal: AbortSignal
): Promise<LifestyleSnapshot | null> {
	try {
		const stored = await api.read(LIFESTYLE_KEY, signal);
		if (!stored) return null;
		const doc = JSON.parse(stored.text) as unknown;
		const current = isObject(doc) ? doc.current : null;
		if (!isObject(current) || current.schema !== 1 || typeof current.computedAt !== 'string')
			return null;
		if (!Array.isArray(current.budgets) || !current.budgets.every(isBudget)) return null;
		return current as unknown as LifestyleSnapshot;
	} catch {
		return null;
	}
}

/** One summary per household on a sheet we ship, in sheet order. */
export function lifestyleCard(
	snapshot: LifestyleSnapshot,
	sheets: readonly HouseholdSheet[]
): LifestyleCard {
	return {
		computedAt: snapshot.computedAt,
		lastSuccessfulScrapeAt: snapshot.lastSuccessfulScrapeAt,
		households: sheets.flatMap((sheet) => {
			const b = snapshot.budgets.find((x) => x.town === sheet.id);
			return b ? [householdSummary(b, sheet)] : [];
		})
	};
}
