import { env } from '$env/dynamic/private';
import type { NewsSnapshotView } from '$lib/news/snapshot';
import { snapshotBlobApi } from './fixture-blob-api';
import { readNewsSnapshot } from './read-snapshot';

/** The first paint never waits longer than this for news (DASH-FLIP1). */
const SNAPSHOT_DEADLINE_MS = 1_200;

/** The reader's validated view, or null for a timeout, unavailable, unknown or a throw. */
export async function readSnapshotForFirstPaint(): Promise<NewsSnapshotView | null> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const deadline = new Promise<null>((resolve) => {
		timer = setTimeout(() => resolve(null), SNAPSHOT_DEADLINE_MS);
	});
	try {
		const body = await Promise.race([
			readNewsSnapshot(snapshotBlobApi(env), SNAPSHOT_DEADLINE_MS),
			deadline
		]);
		return body?.status === 'ok' ? body.snapshot : null;
	} catch {
		return null;
	} finally {
		clearTimeout(timer);
	}
}
