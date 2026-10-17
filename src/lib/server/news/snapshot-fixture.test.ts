// @vitest-environment node
import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { latestReportingView } from '$lib/dashboard/latest-reporting';
import { seededSnapshotEntries } from '$lib/dashboard/source-adapters';
import { NOW } from '$lib/news/feed-fixtures';
import { fileBlobApi } from './fixture-blob-api';
import { readNewsSnapshot } from './read-snapshot';
import { marinReportingSnapshot } from './snapshot-fixture';

const FIXTURE = 'tests/e2e/fixtures/news-snapshot-producer.json';

describe('the SSR e2e seed (DASH-FLIP1)', () => {
	it('is written from the producer factory, the strict reader accepts it, and it yields five Latest-reporting rows', async () => {
		const text = `${JSON.stringify(marinReportingSnapshot(), null, '\t')}\n`;
		let current: string | null = null;
		try {
			current = readFileSync(FIXTURE, 'utf8');
		} catch {
			// first run: no file yet
		}
		if (current !== text) writeFileSync(FIXTURE, text);

		const body = await readNewsSnapshot(fileBlobApi(FIXTURE));
		expect(body.status).toBe('ok');
		if (body.status !== 'ok') return;
		const view = latestReportingView({
			view: body.snapshot,
			sources: seededSnapshotEntries(body.snapshot),
			town: null,
			now: NOW
		});
		expect(view.coverage.kind).toBe('value');
		if (view.coverage.kind === 'value') expect(view.coverage.value).toHaveLength(5);
	});
});
