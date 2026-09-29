import { describe, expect, it } from 'vitest';
import { extraction, incident, loadTranscription } from './fixtures';
import { MAX_INCIDENTS_PER_PAGE, parseTitleRange, validateExtraction } from './validate';

const ctx = { pageCount: 8 };

function errorsOf(input: unknown, context: Parameters<typeof validateExtraction>[1] = ctx) {
	const result = validateExtraction(input, context);
	return result.ok ? [] : result.errors;
}

describe('validateExtraction — negatives', () => {
	it('rejects a malformed extraction', () => {
		expect(errorsOf({ incidents: 'nope' })).not.toEqual([]);
	});
	it('rejects an incident dated outside the header range', () => {
		expect(errorsOf(extraction([incident({ incidentNo: '2609230001' })]))).toEqual([
			expect.stringMatching(/2609230001.*outside/)
		]);
	});
	it('rejects an invalid calendar date in the incident number', () => {
		expect(errorsOf(extraction([incident({ incidentNo: '2602300001' })]))).toEqual([
			expect.stringMatching(/2602300001.*invalid date/)
		]);
	});
	it('rejects an incident number that is not ten digits', () => {
		expect(errorsOf(extraction([incident({ incidentNo: '260916009' })]))).toEqual([
			expect.stringMatching(/incident number/)
		]);
	});
	it.each(['24:05', '7:56', '12:60', ''])('rejects the time %j', (time) => {
		expect(errorsOf(extraction([incident({ time })]))).toEqual([expect.stringMatching(/time/)]);
	});
	it('rejects a duplicate incident', () => {
		expect(errorsOf(extraction([incident(), incident()]))).toContainEqual(
			expect.stringMatching(/duplicate.*2609160009/)
		);
	});
	it('rejects incidents out of ascending order', () => {
		const later = incident({ incidentNo: '2609160011', time: '08:41' });
		expect(errorsOf(extraction([later, incident()]))).toEqual([
			expect.stringMatching(/ascending.*2609160009/)
		]);
	});
	it.each([
		{ startPage: 0, endPage: 1 },
		{ startPage: 8, endPage: 9 },
		{ startPage: 3, endPage: 2 }
	])('rejects page refs out of range: %j', (pages) => {
		expect(errorsOf(extraction([incident(pages)]))).toEqual([expect.stringMatching(/page/)]);
	});
	it.each(['', '   '])('rejects a missing disposition %j', (disposition) => {
		expect(errorsOf(extraction([incident({ disposition })]))).toEqual([
			expect.stringMatching(/disposition/)
		]);
	});
	it('rejects a missing call type', () => {
		expect(errorsOf(extraction([incident({ callType: ' ' })]))).toEqual([
			expect.stringMatching(/call type/)
		]);
	});
	it('rejects an empty incident list', () => {
		expect(errorsOf(extraction([]))).toEqual([expect.stringMatching(/no incidents/)]);
	});
	it(`rejects more than ${MAX_INCIDENTS_PER_PAGE} incidents starting on one page`, () => {
		const many = Array.from({ length: MAX_INCIDENTS_PER_PAGE + 1 }, (_, i) =>
			incident({ incidentNo: `26091600${String(i + 10).padStart(2, '0')}` })
		);
		expect(errorsOf(extraction(many))).toEqual([expect.stringMatching(/page 1.*61/)]);
	});
	it.each([
		{ rangeStart: '09/22/2026', rangeEnd: '09/16/2026' },
		{ rangeStart: '09/01/2026', rangeEnd: '09/22/2026' },
		{ rangeStart: '9/16/2026', rangeEnd: '09/22/2026' },
		{ rangeStart: '02/30/2026', rangeEnd: '03/02/2026' }
	])('rejects an unusable header range %j', (range) => {
		expect(errorsOf(extraction([incident()], range))).toContainEqual(
			expect.stringMatching(/header range/)
		);
	});
	it('rejects a header range that contradicts a parseable WP title', () => {
		expect(errorsOf(extraction(), { ...ctx, wpTitle: 'Press log Sep 9th thru15th, 2026' })).toEqual(
			[expect.stringMatching(/title/)]
		);
	});
});

describe('validateExtraction — positives', () => {
	it('accepts a continuation-only last page', () => {
		const spanning = incident({ startPage: 7, endPage: 8 });
		expect(validateExtraction(extraction([spanning]), ctx).ok).toBe(true);
	});
	it('accepts a blank page (page occupancy is not a completeness signal)', () => {
		expect(validateExtraction(extraction([incident()]), { pageCount: 3 }).ok).toBe(true);
	});
	it('skips the title comparison when the WP title does not parse', () => {
		const result = validateExtraction(extraction(), { ...ctx, wpTitle: 'Press log (revised)' });
		expect(result.ok).toBe(true);
	});
	it('derives the reported date from the incident number, across a year boundary', () => {
		const result = validateExtraction(
			extraction([incident({ incidentNo: '2612310007' }), incident({ incidentNo: '2701020003' })], {
				rangeStart: '12/29/2026',
				rangeEnd: '01/04/2027'
			}),
			{ ...ctx, wpTitle: 'Press log Dec 29th thru Jan 4th, 2027' }
		);
		expect(result.ok && result.bulletin.incidents.map((i) => i.reportedDate)).toEqual([
			'2026-12-31',
			'2027-01-02'
		]);
	});
});

describe('parseTitleRange', () => {
	it.each([
		['Press log Sep 16th thru 22nd, 2026', { start: '2026-09-16', end: '2026-09-22' }],
		['Press log Sep 9th thru15th, 2026', { start: '2026-09-09', end: '2026-09-15' }],
		['Press log Jul 29th thru Aug 4th, 2026', { start: '2026-07-29', end: '2026-08-04' }],
		['Press log Dec 29th thru Jan 4th, 2027', { start: '2026-12-29', end: '2027-01-04' }],
		['Press log (revised)', null],
		['Press log Sep 31st thru Oct 6th, 2026', null]
	])('%s', (title, expected) => {
		expect(parseTitleRange(title)).toEqual(expected);
	});
});

describe('hand-verified bulletins', () => {
	it.each([
		['bulletin-2026-09-16', 'Press log Sep 16th thru 22nd, 2026'],
		['bulletin-2026-09-09', 'Press log Sep 9th thru15th, 2026']
	])('%s validates in full against its real WP title', (name, wpTitle) => {
		const { extraction: read, pageCount } = loadTranscription(name);
		const result = validateExtraction(read, { pageCount, wpTitle });
		expect(result.ok ? [] : result.errors).toEqual([]);
		expect(result.ok && result.bulletin.incidents).toHaveLength(124);
	});

	it('keeps the page-break entry 2609170031 exactly once, with its completed fields', () => {
		const { extraction: read, pageCount } = loadTranscription('bulletin-2026-09-16');
		const result = validateExtraction(read, { pageCount });
		const matches = result.ok
			? result.bulletin.incidents.filter((i) => i.incidentNo === '2609170031')
			: [];
		expect(matches).toEqual([
			{
				incidentNo: '2609170031',
				reportedDate: '2026-09-17',
				time: '13:45',
				callType: 'Footbeat',
				officerInitiated: true,
				disposition: 'Extra Patrol',
				startPage: 1,
				endPage: 2
			}
		]);
	});
});
