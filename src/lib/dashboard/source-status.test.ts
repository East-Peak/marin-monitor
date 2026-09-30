import { describe, expect, it } from 'vitest';
import {
	coverageDetails,
	describePresentation,
	effectiveState,
	parseObservedAt,
	presentSection,
	type SourceStatusEntry
} from './source-status';

const NOW = Date.parse('2026-09-29T18:00:00Z');
const MIN = 60_000;

function entry(id: string, over: Partial<SourceStatusEntry> = {}): SourceStatusEntry {
	return {
		id,
		name: `Source ${id}`,
		state: 'ok',
		observedAt: NOW - MIN,
		maxAgeMs: 45 * MIN,
		detail: null,
		...over
	};
}

describe('effectiveState (clock-driven, never a persisted ok)', () => {
	it('an ok source past its max age reads stale; inside it reads ok', () => {
		expect(effectiveState(entry('a', { observedAt: NOW - 44 * MIN }), NOW)).toBe('ok');
		expect(effectiveState(entry('a', { observedAt: NOW - 46 * MIN }), NOW)).toBe('stale');
	});
	it('an ok source with an age rule but no observation time is unknown', () => {
		expect(effectiveState(entry('a', { observedAt: null }), NOW)).toBe('unknown');
	});
	it('an observation more than 5 minutes in the future is unknown', () => {
		expect(effectiveState(entry('a', { observedAt: NOW + 6 * MIN }), NOW)).toBe('unknown');
		expect(effectiveState(entry('a', { observedAt: NOW + 4 * MIN }), NOW)).toBe('ok');
	});
	it('fails closed on a non-finite observation or limit (Codex r1 #6)', () => {
		expect(effectiveState(entry('a', { observedAt: Number.NaN }), NOW)).toBe('unknown');
		expect(effectiveState(entry('a', { maxAgeMs: Number.NaN }), NOW)).toBe('unknown');
	});
	it('parseObservedAt accepts only zoned date-times; everything else is unknown (null), never NaN', () => {
		expect(parseObservedAt('2026-09-29T17:59:00.000Z')).toBe(NOW - MIN);
		expect(parseObservedAt('2026-09-29T10:59:00-07:00')).toBe(NOW - MIN);
		for (const bad of [
			null,
			undefined,
			'',
			'yesterday',
			'2026-09-29T17:59:00',
			'2026-02-30T00:00:00Z',
			42
		]) {
			expect(parseObservedAt(bad)).toBeNull();
		}
	});
	it('no age rule, or a non-ok state, passes through', () => {
		expect(effectiveState(entry('a', { maxAgeMs: null, observedAt: null }), NOW)).toBe('ok');
		expect(effectiveState(entry('a', { state: 'reference', observedAt: null }), NOW)).toBe(
			'reference'
		);
		expect(effectiveState(entry('a', { state: 'loading' }), NOW)).toBe('loading');
	});
});

describe('presentSection precedence (Decision 2)', () => {
	const ok = entry('ok');
	const stale = entry('stale', { state: 'stale', observedAt: NOW - 3 * 3_600_000 });
	const down = entry('down', { state: 'unavailable', detail: 'HTTP 503' });
	const unknown = entry('unk', { state: 'unknown', observedAt: null });
	const loading = entry('load', { state: 'loading', observedAt: null });

	it.each([
		['1 no sources', [], { total: 0, matching: 0 }, 'unknown'],
		['2 content, nothing failing', [ok, loading], { total: 3, matching: 3 }, 'ok'],
		['3 content, only stale sources', [stale], { total: 2, matching: 2 }, 'stale'],
		['4 content, mixed', [ok, stale, down, unknown], { total: 5, matching: 5 }, 'partial'],
		[
			'4 content, stale plus loading is still partial',
			[stale, loading],
			{ total: 1, matching: 1 },
			'partial'
		],
		['5 nothing yet, something loading', [loading, down], { total: 0, matching: 0 }, 'loading'],
		['6 items exist, none for the town', [ok], { total: 4, matching: 0 }, 'no-match'],
		['7 successful-empty', [ok, down], { total: 0, matching: 0 }, 'empty'],
		[
			'8 all failing, one unavailable',
			[stale, down, unknown],
			{ total: 0, matching: 0 },
			'unavailable'
		],
		['8 all failing, stale only', [stale], { total: 0, matching: 0 }, 'stale'],
		['8 all failing, unknown only', [unknown], { total: 0, matching: 0 }, 'unknown']
	] as const)('%s', (_label, entries, counts, expected) => {
		expect(presentSection([...entries], counts, NOW).state).toBe(expected);
	});

	it('names failing sources in input order, even when the section is ok enough to show content', () => {
		const p = presentSection([ok, down, unknown], { total: 2, matching: 2 }, NOW);
		expect(p.failing.map((e) => e.id)).toEqual(['down', 'unk']);
	});
	it('an ok source that aged past its limit counts as failing (clock, not stored state)', () => {
		const aged = entry('aged', { observedAt: NOW - 2 * 3_600_000 });
		const p = presentSection([aged], { total: 1, matching: 1 }, NOW);
		expect(p.state).toBe('stale');
		expect(p.asOf).toBe(NOW - 2 * 3_600_000);
	});
	it('"as of" is the oldest stale observation, or null when any is unknown', () => {
		const older = entry('older', { state: 'stale', observedAt: NOW - 5 * 3_600_000 });
		expect(presentSection([stale, older], { total: 1, matching: 1 }, NOW).asOf).toBe(
			NOW - 5 * 3_600_000
		);
		const blind = entry('blind', { state: 'stale', observedAt: null });
		expect(presentSection([stale, blind], { total: 1, matching: 1 }, NOW).asOf).toBeNull();
	});
});

describe('describePresentation', () => {
	it('says nothing for ok and names the failing sources for partial', () => {
		const down = entry('down', { name: 'Marin IJ', state: 'unavailable' });
		expect(
			describePresentation(presentSection([entry('a')], { total: 1, matching: 1 }, NOW), NOW)
		).toBeNull();
		expect(
			describePresentation(presentSection([entry('a'), down], { total: 1, matching: 1 }, NOW), NOW)
		).toBe('Partial coverage · Marin IJ unavailable');
	});
	it('stale says "As of" with an absolute time; nothing ever says LIVE or just now', () => {
		const stale = entry('s', { state: 'stale', observedAt: Date.parse('2026-09-29T14:53:00Z') });
		const text = describePresentation(presentSection([stale], { total: 1, matching: 1 }, NOW), NOW);
		expect(text).toBe('As of 7:53 AM · Source s out of date');
		expect(text).not.toMatch(/live|just now/i);
	});
	it('lists at most three names, then a count', () => {
		const many = ['A', 'B', 'C', 'D', 'E'].map((n) =>
			entry(n, { name: n, state: 'unknown', observedAt: null })
		);
		const p = presentSection([entry('ok'), ...many], { total: 1, matching: 1 }, NOW);
		expect(describePresentation(p, NOW)).toBe('Partial coverage · A, B, C +2 more unverified');
	});
	it('loading, empty, no-match, unavailable and unknown each read distinctly', () => {
		const texts = [
			presentSection([entry('l', { state: 'loading' })], { total: 0, matching: 0 }, NOW),
			presentSection([entry('a')], { total: 0, matching: 0 }, NOW),
			presentSection([entry('a')], { total: 3, matching: 0 }, NOW),
			presentSection(
				[entry('d', { name: 'NWS', state: 'unavailable' })],
				{ total: 0, matching: 0 },
				NOW
			),
			presentSection([], { total: 0, matching: 0 }, NOW)
		].map((p) => describePresentation(p, NOW));
		expect(texts).toEqual([
			'Loading…',
			'Nothing new',
			'Nothing for this town',
			'Source unavailable · NWS',
			'Status unknown · no source reports'
		]);
	});
	it('a town filter or an empty result never hides a failure (Codex r1 #7)', () => {
		const down = entry('d', { name: 'Marin IJ', state: 'unavailable', detail: 'HTTP 503' });
		const unk = entry('u', {
			name: 'Transit alerts',
			state: 'unknown',
			observedAt: null,
			detail: 'failures not reported by this source'
		});
		const cases: [SourceStatusEntry[], { total: number; matching: number }, string][] = [
			[
				[entry('a'), down],
				{ total: 4, matching: 0 },
				'Nothing for this town · Marin IJ unavailable'
			],
			[[entry('a'), unk], { total: 0, matching: 0 }, 'Nothing new · Transit alerts unverified'],
			[[unk], { total: 0, matching: 0 }, 'Status unknown · Transit alerts unverified'],
			[
				[entry('l', { state: 'loading' }), down],
				{ total: 0, matching: 0 },
				'Loading… · Marin IJ unavailable'
			]
		];
		for (const [entries, counts, text] of cases) {
			expect(describePresentation(presentSection(entries, counts, NOW), NOW)).toBe(text);
		}
	});
	it('coverageDetails gives each failing source with its reason', () => {
		const down = entry('d', { name: 'Marin IJ', state: 'unavailable', detail: 'HTTP 503' });
		const unk = entry('u', {
			name: 'Transit alerts',
			state: 'unknown',
			observedAt: null,
			detail: null
		});
		expect(
			coverageDetails(presentSection([entry('a'), down, unk], { total: 1, matching: 1 }, NOW))
		).toEqual(['Marin IJ: unavailable (HTTP 503)', 'Transit alerts: unverified']);
	});
});
