/**
 * The Blob behind the dashboard's SSR snapshot read (DASH-FLIP1).
 *
 * e2e cannot intercept a server-side Blob read, so a dedicated test server
 * points NEWS_SNAPSHOT_FIXTURE at a producer-format snapshot file. Production
 * never reads it: with VERCEL_ENV=production only the Blob token decides.
 */
import { readFile } from 'node:fs/promises';
import { abortable } from './abortable';
import { NEWS_SNAPSHOT_KEY, type BlobApi } from './snapshot-store';
import { vercelBlobApi } from './vercel-blob-api';

/** Read-only: the snapshot key is the file; every other key is absent. */
export function fileBlobApi(path: string): BlobApi {
	const readOnly = () => Promise.reject(new Error('the snapshot fixture is read-only'));
	return {
		async read(key, signal) {
			if (key !== NEWS_SNAPSHOT_KEY) return null;
			return { text: await abortable(readFile(path, 'utf8'), signal), etag: '"fixture"' };
		},
		write: readOnly,
		remove: readOnly
	};
}

export function snapshotBlobApi(
	env: Record<string, string | undefined>,
	blob: (token: string) => BlobApi = vercelBlobApi
): BlobApi | null {
	const fixture = env.NEWS_SNAPSHOT_FIXTURE;
	if (fixture && env.VERCEL_ENV !== 'production') return fileBlobApi(fixture);
	return env.BLOB_READ_WRITE_TOKEN ? blob(env.BLOB_READ_WRITE_TOKEN) : null;
}
