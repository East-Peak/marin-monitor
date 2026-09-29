import { describe, expect, it } from 'vitest';
import { processBulletin } from './bulletin';
import { extraction, incident, loadTranscription } from './fixtures';

const source = {
	docId: 42429,
	revision: 'ed6499205ab87dfae05044825b13b66e',
	bulletinUrl: 'https://storage.googleapis.com/proudcity/fairfaxca/2026/09/bulletin.pdf'
};
const ctx = { pageCount: 8, wpTitle: 'Press log Sep 16th thru 22nd, 2026' };
const second = incident({ incidentNo: '2609160011', time: '08:41', callType: 'Footbeat' });

describe('processBulletin — double read', () => {
	it('publishes when both reads are identical', () => {
		const read = extraction([incident(), second]);
		const result = processBulletin([read, structuredClone(read)], ctx, source);
		expect(result.ok && result.envelope.incidents.map((i) => i.incidentNo)).toEqual([
			'2609160009',
			'2609160011'
		]);
	});

	it('tolerates whitespace-only differences from line wrapping', () => {
		const a = extraction([incident({ disposition: 'Log Entry Only' })]);
		const b = extraction([incident({ disposition: 'Log  Entry\nOnly ' })]);
		expect(processBulletin([a, b], ctx, source).ok).toBe(true);
	});

	it.each([
		['time', { time: '07:57' }],
		['callType', { callType: 'Lost / Stolen' }],
		['disposition', { disposition: 'Report Taken' }],
		['officerInitiated', { officerInitiated: true }]
	])('rejects reads that differ in %s', (field, change) => {
		const a = extraction([incident(), second]);
		const b = extraction([incident(change), second]);
		const result = processBulletin([a, b], ctx, source);
		expect(result.ok).toBe(false);
		expect(!result.ok && result.errors).toEqual([expect.stringMatching(new RegExp(field))]);
	});

	it('publishes the same result in either read order when text differs only by wrapping', () => {
		const a = extraction([incident({ callType: 'Theft', disposition: 'Missing person located' })]);
		const b = extraction([incident({ callType: 'Theft', disposition: 'Missing\nperson located' })]);
		const ab = processBulletin([a, b], ctx, source);
		const ba = processBulletin([b, a], ctx, source);
		expect(ab).toEqual(ba);
		expect(ab.ok && ab.envelope).toMatchObject({ incidents: [], withheldCount: 1 });
	});

	it('rejects reads that differ by one incident', () => {
		const result = processBulletin(
			[extraction([incident(), second]), extraction([incident()])],
			ctx,
			source
		);
		expect(!result.ok && result.errors).toEqual([expect.stringMatching(/2609160011.*one read/)]);
	});

	it('rejects reads whose header ranges differ', () => {
		const b = extraction([incident()], { rangeEnd: '09/23/2026' });
		expect(processBulletin([extraction(), b], { pageCount: 8 }, source).ok).toBe(false);
	});

	it('rejects when either read fails validation, naming the read', () => {
		const bad = extraction([incident({ time: '25:00' })]);
		const result = processBulletin([extraction(), bad], ctx, source);
		expect(!result.ok && result.errors).toEqual([expect.stringMatching(/^read 2: .*time/)]);
	});

	it('publishes both hand-verified bulletins when read twice identically', () => {
		for (const [name, wpTitle] of [
			['bulletin-2026-09-16', 'Press log Sep 16th thru 22nd, 2026'],
			['bulletin-2026-09-09', 'Press log Sep 9th thru15th, 2026']
		]) {
			const { extraction: read, pageCount } = loadTranscription(name);
			const result = processBulletin([read, structuredClone(read)], { pageCount, wpTitle }, source);
			expect(result.ok ? [] : result.errors).toEqual([]);
			expect(result.ok && result.envelope.incidents.length + result.envelope.withheldCount).toBe(
				124
			);
		}
	});
});
