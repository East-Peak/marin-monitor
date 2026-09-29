/**
 * BlobApi over @vercel/blob (private store). Every call carries the caller's
 * AbortSignal into the SDK (which stops retrying once it aborts) AND races
 * it, so neither the SDK's internal retries (up to 10 by default) nor a
 * stalled request can outlive the producer's deadline. Reads bypass the CDN
 * cache (useCache: false) so ETag and body belong to the same revision, and
 * are capped at MAX_SNAPSHOT_BYTES.
 */
import { BlobPreconditionFailedError, del, get, put } from '@vercel/blob';
import { abortable } from './abortable';
import { readStreamCapped } from './bounded-fetch';
import { BlobWriteConflict, MAX_SNAPSHOT_BYTES, type BlobApi } from './snapshot-store';

export function vercelBlobApi(token: string): BlobApi {
	const api: BlobApi = {
		async read(key, signal) {
			const result = await abortable(
				get(key, { access: 'private', useCache: false, token, abortSignal: signal }),
				signal
			);
			if (!result || result.statusCode !== 200) return null;
			const body = await readStreamCapped(result.stream, MAX_SNAPSHOT_BYTES, signal);
			if (body === null) throw new Error(`blob ${key} exceeds ${MAX_SNAPSHOT_BYTES} bytes`);
			// A compressed read reports the validator weak (W/"…"); put/del ifMatch
			// accept only the strong form, and the opaque tag is the same.
			return { text: body.text, etag: result.blob.etag.replace(/^W\//, '') };
		},

		async write(key, body, condition, signal) {
			try {
				const result = await abortable(
					put(key, body, {
						access: 'private',
						contentType: 'application/json',
						addRandomSuffix: false,
						cacheControlMaxAge: 60,
						token,
						abortSignal: signal,
						...('ifMatch' in condition ? { ifMatch: condition.ifMatch } : { allowOverwrite: false })
					}),
					signal
				);
				return { etag: result.etag };
			} catch (err) {
				if (err instanceof BlobPreconditionFailedError) throw new BlobWriteConflict('etag moved');
				// A createOnly write that lost the race fails with a generic BlobError;
				// decide by looking, not by parsing the message.
				if (
					'createOnly' in condition &&
					!signal.aborted &&
					(await api.read(key, signal)) !== null
				) {
					throw new BlobWriteConflict('already exists');
				}
				throw err;
			}
		},

		async remove(key, ifMatch, signal) {
			try {
				await abortable(del(key, { ifMatch, token, abortSignal: signal }), signal);
			} catch (err) {
				if (err instanceof BlobPreconditionFailedError) throw new BlobWriteConflict('etag moved');
				throw err;
			}
		}
	};
	return api;
}
