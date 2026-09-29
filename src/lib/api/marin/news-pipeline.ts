/**
 * The shared RSS/Atom pipeline, loaded on first use. It carries htmlparser2's
 * HTML entity tables (~30 KB gzip), so it stays out of the initial bundle.
 *
 * Failure policy. A failed chunk fetch cannot be retried in place: browsers
 * cache the failed module-map entry for the document (verified in Chromium:
 * a second import() of the same chunk URL rejects without refetching), and
 * after a deploy the old chunk URL no longer exists at all. So:
 * - A chunk-load error reloads the page ONCE per failure episode per
 *   deployment: a latch {version, at} in sessionStorage records the reload.
 *   While the latch matches this build's version and is younger than
 *   RELOAD_CAP_MS (6 h — the TV's own scheduled reload), no further reload
 *   happens: a persistently failing chunk never makes an unattended TV
 *   restart again and again.
 * - A successful load clears the latch — the episode is over, so a later,
 *   separate failure may recover with one reload of its own.
 * - Anything else (or a latched episode): the failure is not cached here,
 *   fetchAllFeeds rejects so the stores keep their items, and the next
 *   refresh tries again.
 * The pipeline leaves the browser entirely at G2 (snapshot reads).
 */
import { version } from '$app/environment';
import { createRetryingLoader } from '$lib/news/retrying-loader';

export const RELOAD_LATCH_KEY = 'mm_news_chunk_reload';
export const RELOAD_CAP_MS = 6 * 3_600_000;

const importPipeline = async () => {
	const [{ parseFeedXml }, { normalizeEntry }] = await Promise.all([
		import('$lib/news/feed-xml'),
		import('$lib/news/normalize')
	]);
	return { parseFeedXml, normalizeEntry };
};

export type NewsPipeline = Awaited<ReturnType<typeof importPipeline>>;

export interface ReloadLatch {
	version: string;
	at: number;
}

/** Chunk-load failures as Chromium, Firefox and Safari word them. */
export function isChunkLoadError(err: unknown): boolean {
	const message = err instanceof Error ? err.message : String(err);
	return /dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(
		message
	);
}

export function chunkFailureAction(input: {
	chunkError: boolean;
	latch: ReloadLatch | null;
	version: string;
	now: number;
}): 'reload' | 'retry-next-refresh' {
	const { chunkError, latch, version: current, now } = input;
	const latched = latch !== null && latch.version === current && now - latch.at < RELOAD_CAP_MS;
	return chunkError && !latched ? 'reload' : 'retry-next-refresh';
}

export interface PipelineLoaderDeps<T> {
	importPipeline: () => Promise<T>;
	version: string;
	readLatch: () => ReloadLatch | null;
	writeLatch: (latch: ReloadLatch) => void;
	clearLatch: () => void;
	reload: () => void;
	now: () => number;
}

export function createPipelineLoader<T>(deps: PipelineLoaderDeps<T>): () => Promise<T> {
	const load = createRetryingLoader(deps.importPipeline);
	return async () => {
		try {
			const pipeline = await load();
			if (deps.readLatch() !== null) deps.clearLatch(); // episode over
			return pipeline;
		} catch (err) {
			const now = deps.now();
			const action = chunkFailureAction({
				chunkError: isChunkLoadError(err),
				latch: deps.readLatch(),
				version: deps.version,
				now
			});
			if (action === 'reload') {
				deps.writeLatch({ version: deps.version, at: now });
				deps.reload();
			}
			throw err;
		}
	};
}

function session(): Storage | null {
	try {
		return typeof sessionStorage === 'undefined' ? null : sessionStorage;
	} catch {
		return null;
	}
}

function parseLatch(raw: string | null): ReloadLatch | null {
	try {
		const value = raw ? (JSON.parse(raw) as Partial<ReloadLatch>) : null;
		return value && typeof value.version === 'string' && typeof value.at === 'number'
			? { version: value.version, at: value.at }
			: null;
	} catch {
		return null;
	}
}

export const loadNewsPipeline = createPipelineLoader({
	importPipeline,
	version,
	// Without storage there is no latch to hold the guard, so behave as latched:
	// never reload (the next refresh retries; the TV's 6-hour reload remains).
	readLatch: () => {
		const store = session();
		return store ? parseLatch(store.getItem(RELOAD_LATCH_KEY)) : { version, at: Date.now() };
	},
	writeLatch: (latch) => session()?.setItem(RELOAD_LATCH_KEY, JSON.stringify(latch)),
	clearLatch: () => session()?.removeItem(RELOAD_LATCH_KEY),
	reload: () => location.reload(),
	now: () => Date.now()
});
