import { describe, expect, it } from 'vitest';
import { CITED } from './sources';
import { SHEETS } from './sheets';
import { readLive } from '$lib/server/lifestyle/live';
import { LIVE_BLOBS } from '$lib/server/lifestyle/live';

/** The SF-area grocery index counts movement, not dollars: it is context, never an input (COSTDATA-2). */
describe('the BLS index is in no household total', () => {
	it('no sheet line takes a BLS, CPI or inflation input, live or cited', () => {
		for (const sheet of SHEETS)
			for (const line of sheet.lines)
				for (const spec of Object.values(line.inputs)) {
					const id = spec.class === 'cited' ? spec.cite : spec.class === 'live' ? spec.live : '';
					expect(id).not.toMatch(/bls|cpi|inflation/i);
				}
	});

	it('the live reads and the cited catalogue hold no index', () => {
		expect(Object.values(LIVE_BLOBS).join(' ')).not.toMatch(/bls/i);
		expect(Object.keys(CITED).join(' ')).not.toMatch(/bls|cpi|inflation/i);
		const none = Object.fromEntries(Object.keys(LIVE_BLOBS).map((k) => [k, null]));
		expect(Object.keys(readLive(none as never, new Date())).join(' ')).not.toMatch(
			/bls|cpi|inflation/i
		);
	});
});
