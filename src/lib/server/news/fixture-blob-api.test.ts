// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { fileBlobApi, snapshotBlobApi } from './fixture-blob-api';
import { createMemoryBlobApi } from './memory-blob-api';
import { NEWS_SNAPSHOT_KEY } from './snapshot-store';

const FIXTURE = 'tests/e2e/fixtures/news-snapshot-producer.json';
const read = (api: ReturnType<typeof snapshotBlobApi>) =>
	api?.read(NEWS_SNAPSHOT_KEY, new AbortController().signal);

describe('snapshotBlobApi (the SSR read’s Blob)', () => {
	it('reads the fixture file when NEWS_SNAPSHOT_FIXTURE is set outside production', async () => {
		const api = snapshotBlobApi({ NEWS_SNAPSHOT_FIXTURE: FIXTURE, VERCEL_ENV: 'preview' });
		expect((await read(api))?.text).toContain('"schemaVersion"');
	});

	it('ignores the fixture in production: the Blob token decides', async () => {
		expect(
			snapshotBlobApi({ NEWS_SNAPSHOT_FIXTURE: FIXTURE, VERCEL_ENV: 'production' })
		).toBeNull();
		const blob = createMemoryBlobApi();
		const tokens: string[] = [];
		const api = snapshotBlobApi(
			{ NEWS_SNAPSHOT_FIXTURE: FIXTURE, VERCEL_ENV: 'production', BLOB_READ_WRITE_TOKEN: 'tok' },
			(token) => (tokens.push(token), blob)
		);
		expect(api).toBe(blob);
		expect(tokens).toEqual(['tok']);
	});

	it('no fixture and no token → null (not configured)', () => {
		expect(snapshotBlobApi({})).toBeNull();
	});

	it('the file api reads only the snapshot key and never writes', async () => {
		const api = fileBlobApi(FIXTURE);
		const signal = new AbortController().signal;
		expect(await api.read('news/v1/lease.json', signal)).toBeNull();
		await expect(
			api.write(NEWS_SNAPSHOT_KEY, '{}', { createOnly: true }, signal)
		).rejects.toThrow();
	});
});
