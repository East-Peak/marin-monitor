/**
 * In-memory BlobApi with the same conditional-write semantics as Vercel Blob
 * (createOnly fails if present; ifMatch fails on a moved or missing ETag) and
 * the same cancellation contract (every call rejects once its signal aborts).
 * Test double for the snapshot store, producer, health and cron route tests.
 */
import { abortable } from './abortable';
import { BlobWriteConflict, type BlobApi, type WriteCondition } from './snapshot-store';

type Op = 'read' | 'write' | 'remove';

export interface MemoryBlobApi extends BlobApi {
	peek(key: string): string | undefined;
	/** Runs before an operation takes effect — delay, stall, fail, or interleave a competing writer. */
	before?: (op: Op, key: string) => Promise<void> | void;
}

export function createMemoryBlobApi(initial: Record<string, string> = {}): MemoryBlobApi {
	let counter = 0;
	const blobs = new Map<string, { text: string; etag: string }>(
		Object.entries(initial).map(([k, text]) => [k, { text, etag: `"e${++counter}"` }])
	);
	const run = <T>(op: Op, key: string, signal: AbortSignal, effect: () => T): Promise<T> =>
		abortable(
			(async () => {
				await api.before?.(op, key);
				signal.throwIfAborted(); // a write that lost its deadline does not land
				return effect();
			})(),
			signal
		);
	const api: MemoryBlobApi = {
		peek: (key) => blobs.get(key)?.text,
		read: (key, signal) =>
			run('read', key, signal, () => {
				const blob = blobs.get(key);
				return blob ? { ...blob } : null;
			}),
		write: (key, text, condition: WriteCondition, signal) =>
			run('write', key, signal, () => {
				const existing = blobs.get(key);
				if ('createOnly' in condition && existing) throw new BlobWriteConflict('exists');
				if ('ifMatch' in condition && existing?.etag !== condition.ifMatch) {
					throw new BlobWriteConflict('etag moved');
				}
				const etag = `"e${++counter}"`;
				blobs.set(key, { text, etag });
				return { etag };
			}),
		remove: (key, ifMatch, signal) =>
			run('remove', key, signal, () => {
				if (blobs.get(key)?.etag !== ifMatch) throw new BlobWriteConflict('etag moved');
				blobs.delete(key);
			})
	};
	return api;
}
