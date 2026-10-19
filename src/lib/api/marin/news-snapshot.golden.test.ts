import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { parseNewsSnapshotResponse } from '$lib/news/snapshot';
import { snapshotItemToNewsItem } from './news-snapshot';

/**
 * NEWSPIN2's guard: headline places are v2's own reading, so today's real snapshot reads and
 * converts exactly as before. The golden was written by the reader and converter as they stood.
 */
it('today’s snapshot reads and converts byte for byte as before (golden)', async () => {
	const body = JSON.parse(
		readFileSync(join(__dirname, '../../news/__fixtures__/snapshot-2026-10-19.json'), 'utf8')
	);
	const read = parseNewsSnapshotResponse(body);
	// The strict reader accepts today's body whole and hands it on as published.
	expect(read).toEqual(body);
	if (read?.status !== 'ok') throw new Error('not read');
	const converted = read.snapshot.items.map(snapshotItemToNewsItem);
	await expect(JSON.stringify(converted, null, 1)).toMatchFileSnapshot(
		'../../news/__fixtures__/snapshot-2026-10-19.golden.json'
	);
});
