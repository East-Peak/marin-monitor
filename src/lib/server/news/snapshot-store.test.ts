// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { NEWS_SNAPSHOT_SCHEMA_VERSION, type NewsSnapshot } from '$lib/news/snapshot';
import { createMemoryBlobApi } from './memory-blob-api';
import {
	createSnapshotStore,
	MAX_SNAPSHOT_BYTES,
	NEWS_LEASE_KEY,
	NEWS_SNAPSHOT_KEY
} from './snapshot-store';

const T0 = Date.parse('2026-09-28T20:00:00.000Z');
const go = () => new AbortController().signal;

function snapshot(revision: number): NewsSnapshot {
	return {
		schemaVersion: NEWS_SNAPSHOT_SCHEMA_VERSION,
		revision,
		generatedAt: new Date(T0).toISOString(),
		lastSuccessfulScrapeAt: null,
		sources: [],
		items: []
	};
}

describe('snapshot store — publication', () => {
	it('reads nothing from an empty store', async () => {
		const store = createSnapshotStore(createMemoryBlobApi());
		expect(await store.read(go())).toEqual({ snapshot: null, etag: null, revision: 0 });
	});

	it('creates the first snapshot, then only replaces the revision it read', async () => {
		const api = createMemoryBlobApi();
		const store = createSnapshotStore(api);
		expect(await store.publish(snapshot(1), null, go())).toBe('published');
		const first = await store.read(go());
		expect(first).toMatchObject({ revision: 1 });
		expect(await store.publish(snapshot(2), first.etag, go())).toBe('published');
		expect(await store.publish(snapshot(3), first.etag, go())).toBe('conflict');
		expect(JSON.parse(api.peek(NEWS_SNAPSHOT_KEY) as string).revision).toBe(2);
	});

	it('refuses a createOnly publish when a snapshot already exists', async () => {
		const store = createSnapshotStore(
			createMemoryBlobApi({ [NEWS_SNAPSHOT_KEY]: JSON.stringify(snapshot(5)) })
		);
		expect(await store.publish(snapshot(1), null, go())).toBe('conflict');
	});

	it('returns the etag and salvaged revision of an invalid blob so it can be replaced monotonically', async () => {
		const store = createSnapshotStore(
			createMemoryBlobApi({ [NEWS_SNAPSHOT_KEY]: '{"schemaVersion":99,"revision":57}' })
		);
		const found = await store.read(go());
		expect(found).toMatchObject({ snapshot: null, revision: 57 });
		expect(found.etag).not.toBeNull();
		expect(await store.publish(snapshot(58), found.etag, go())).toBe('published');
	});

	it('refuses to publish a snapshot over the size ceiling', async () => {
		const store = createSnapshotStore(createMemoryBlobApi());
		const huge = { ...snapshot(1), generatedAt: 'x'.repeat(MAX_SNAPSHOT_BYTES) };
		await expect(store.publish(huge, null, go())).rejects.toThrow(/max/);
	});

	it('abandons a stalled write when its signal aborts, and the write never lands', async () => {
		const api = createMemoryBlobApi();
		api.before = (op) =>
			op === 'write' ? new Promise<void>((r) => setTimeout(r, 200)) : undefined;
		const store = createSnapshotStore(api);
		const started = Date.now();
		await expect(store.publish(snapshot(1), null, AbortSignal.timeout(30))).rejects.toThrow();
		expect(Date.now() - started).toBeLessThan(150);
		await new Promise((r) => setTimeout(r, 250));
		expect(api.peek(NEWS_SNAPSHOT_KEY)).toBeUndefined();
	});
});

describe('snapshot store — lease', () => {
	it('grants one lease at a time', async () => {
		const store = createSnapshotStore(createMemoryBlobApi());
		expect(await store.acquireLease('a', T0, 120_000, go())).toBe(true);
		expect(await store.acquireLease('b', T0 + 1_000, 120_000, go())).toBe(false);
	});

	it('lets exactly one of two simultaneous callers win', async () => {
		const store = createSnapshotStore(createMemoryBlobApi());
		const results = await Promise.all([
			store.acquireLease('a', T0, 120_000, go()),
			store.acquireLease('b', T0, 120_000, go())
		]);
		expect(results.filter(Boolean)).toHaveLength(1);
	});

	it('takes over an expired lease (a crashed run cannot wedge the producer)', async () => {
		const store = createSnapshotStore(createMemoryBlobApi());
		await store.acquireLease('crashed', T0, 120_000, go());
		expect(await store.acquireLease('next', T0 + 120_001, 120_000, go())).toBe(true);
	});

	it('takes over an unreadable lease', async () => {
		const store = createSnapshotStore(createMemoryBlobApi({ [NEWS_LEASE_KEY]: 'garbage' }));
		expect(await store.acquireLease('a', T0, 120_000, go())).toBe(true);
	});

	it('releases only its own lease', async () => {
		const api = createMemoryBlobApi();
		const store = createSnapshotStore(api);
		await store.acquireLease('a', T0, 120_000, go());
		await store.releaseLease('someone-else', go());
		expect(api.peek(NEWS_LEASE_KEY)).toBeDefined();
		await store.releaseLease('a', go());
		expect(api.peek(NEWS_LEASE_KEY)).toBeUndefined();
	});

	it('never deletes a lease taken over while its old owner was releasing', async () => {
		const api = createMemoryBlobApi();
		const store = createSnapshotStore(api);
		await store.acquireLease('old', T0, 1_000, go());
		// The old owner reads its lease to release it; before its delete lands,
		// the lease expires and a new run takes it over.
		api.before = async (op) => {
			if (op !== 'remove') return;
			api.before = undefined;
			expect(await store.acquireLease('new', T0 + 1_001, 120_000, go())).toBe(true);
		};
		await store.releaseLease('old', go());
		expect(JSON.parse(api.peek(NEWS_LEASE_KEY) as string).runId).toBe('new');
	});
});
