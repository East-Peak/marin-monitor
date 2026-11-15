/**
 * In-memory BlobApi with the same conditional-write semantics as Vercel Blob
 * (createOnly fails if present; ifMatch fails on a moved or missing ETag) and
 * the same cancellation contract (every call rejects once its signal aborts).
 * Test double for the snapshot store, producer, health and cron route tests.
 */
import { abortable } from './abortable';
import { BlobWriteConflict, type BlobApi, type WriteCondition } from './snapshot-store';

type Op = 'read' | 'write' | 'remove' | 'list';

export interface MemoryBlobApi extends BlobApi {
	peek(key: string): string | undefined;
	/** Every key under a prefix, in pathname order, with its upload time (Vercel Blob's list). */
	list(prefix: string, signal: AbortSignal): Promise<{ key: string; uploadedAt: string }[]>;
	/** Runs before an operation takes effect — delay, stall, fail, or interleave a competing writer. */
	before?: (op: Op, key: string) => Promise<void> | void;
}

export function createMemoryBlobApi(initial: Record<string, string> = {}): MemoryBlobApi {
	let counter = 0;
	const blobs = new Map<string, { text: string; etag: string; uploadedAt: string }>(
		Object.entries(initial).map(([k, text]) => [
			k,
			{ text, etag: `"e${++counter}"`, uploadedAt: new Date().toISOString() }
		])
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
				return blob ? { text: blob.text, etag: blob.etag } : null;
			}),
		write: (key, text, condition: WriteCondition, signal) =>
			run('write', key, signal, () => {
				const existing = blobs.get(key);
				if ('createOnly' in condition && existing) throw new BlobWriteConflict('exists');
				if ('ifMatch' in condition && existing?.etag !== condition.ifMatch) {
					throw new BlobWriteConflict('etag moved');
				}
				const etag = `"e${++counter}"`;
				blobs.set(key, { text, etag, uploadedAt: new Date().toISOString() });
				return { etag };
			}),
		list: (prefix, signal) =>
			run('list', prefix, signal, () =>
				[...blobs.entries()]
					.filter(([k]) => k.startsWith(prefix))
					.sort(([a], [b]) => (a < b ? -1 : 1))
					.map(([key, b]) => ({ key, uploadedAt: b.uploadedAt }))
			),
		remove: (key, ifMatch, signal) =>
			run('remove', key, signal, () => {
				if (blobs.get(key)?.etag !== ifMatch) throw new BlobWriteConflict('etag moved');
				blobs.delete(key);
			})
	};
	return api;
}
