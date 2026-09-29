import { describe, expect, it, vi } from 'vitest';
import {
	chunkFailureAction,
	createPipelineLoader,
	isChunkLoadError,
	RELOAD_CAP_MS,
	type PipelineLoaderDeps,
	type ReloadLatch
} from './news-pipeline';

const CHUNK = new TypeError(
	'Failed to fetch dynamically imported module: https://x/_app/immutable/chunks/a.js'
);
const HOUR = 3_600_000;

function deps(over: Partial<PipelineLoaderDeps<string>> = {}) {
	let latch: ReloadLatch | null = null;
	let t = 1_000_000;
	return {
		importPipeline: vi.fn(async () => 'pipeline'),
		version: 'build-1',
		readLatch: () => latch,
		writeLatch: (l: ReloadLatch) => void (latch = l),
		clearLatch: vi.fn(() => void (latch = null)),
		reload: vi.fn(),
		now: () => t,
		advance: (ms: number) => void (t += ms),
		latch: () => latch,
		...over
	};
}

describe('isChunkLoadError', () => {
	it.each([
		['Chromium', 'Failed to fetch dynamically imported module: x', true],
		['Safari', 'Importing a module script failed.', true],
		['Firefox', 'error loading dynamically imported module: x', true],
		['anything else', 'boom', false]
	])('%s', (_b, message, expected) => {
		expect(isChunkLoadError(new TypeError(message))).toBe(expected);
	});
});

describe('chunkFailureAction', () => {
	const base = { chunkError: true, latch: null, version: 'build-1', now: 10 * HOUR };
	it('reloads for the first chunk failure of an episode', () => {
		expect(chunkFailureAction(base)).toBe('reload');
	});
	it.each([
		['not a chunk error', { chunkError: false }],
		[
			'this deployment already reloaded for this episode, 1 h ago',
			{ latch: { version: 'build-1', at: 9 * HOUR } }
		],
		[
			'…even 5 h 59 m ago',
			{ latch: { version: 'build-1', at: 10 * HOUR - RELOAD_CAP_MS + 60_000 } }
		]
	])('does not reload when %s', (_l, over) => {
		expect(chunkFailureAction({ ...base, ...over })).toBe('retry-next-refresh');
	});
	it('reloads again for a different deployment, or after the 6 h cap', () => {
		expect(chunkFailureAction({ ...base, latch: { version: 'build-0', at: 10 * HOUR - 1 } })).toBe(
			'reload'
		);
		expect(
			chunkFailureAction({ ...base, latch: { version: 'build-1', at: 10 * HOUR - RELOAD_CAP_MS } })
		).toBe('reload');
	});
});

describe('createPipelineLoader', () => {
	it('retries after a non-chunk failure without reloading', async () => {
		const d = deps({
			importPipeline: vi
				.fn<() => Promise<string>>()
				.mockRejectedValueOnce(new Error('boom'))
				.mockResolvedValue('pipeline')
		});
		const load = createPipelineLoader(d);
		await expect(load()).rejects.toThrow('boom');
		expect(d.reload).not.toHaveBeenCalled();
		expect(await load()).toBe('pipeline');
	});

	it('a persistent failure reloads once, then never again for an hour of 3-minute refreshes', async () => {
		const d = deps({ importPipeline: vi.fn(async () => Promise.reject(CHUNK)) });
		const load = createPipelineLoader(d);
		for (let refresh = 0; refresh <= 20; refresh++) {
			await expect(load()).rejects.toBe(CHUNK);
			d.advance(3 * 60_000);
		}
		expect(d.reload).toHaveBeenCalledTimes(1);
	});

	it('a successful load ends the episode, so a later separate failure may recover once', async () => {
		const d = deps();
		d.writeLatch({ version: 'build-1', at: d.now() }); // the reload that just happened
		const load = createPipelineLoader(d);
		expect(await load()).toBe('pipeline');
		expect(d.latch()).toBeNull();
		expect(d.clearLatch).toHaveBeenCalledTimes(1);
	});
});
