import { describe, expect, it } from 'vitest';
import { dropAlertPrefix, sourceSentenceCase } from './source-case';

const GG = 'goldengate.org';

describe('sourceSentenceCase (rule 4: a named source’s ALL CAPS, read as a sentence)', () => {
	it.each([
		// Names (places, agencies) kept as names.
		['MANZANITA PARK & RIDE MAY FLOOD', 'Manzanita Park & Ride may flood'],
		[
			'11/5 COMMUNITY MEETING ON LARKSPUR FERRY SERVICE EXPANSION & PARKING STUDY',
			'11/5 Community meeting on Larkspur Ferry service expansion & parking study'
		],
		['DELAYS AT SAN RAFAEL TRANSIT CENTER', 'Delays at San Rafael Transit Center'],
		['SF CUSTOMERS BUY TICKETS FROM GATE C', 'SF customers buy tickets from gate C'],
		// Routes and route identifiers kept.
		['ROUTE 101X DETOUR IN NOVATO', 'Route 101X detour in Novato'],
		['ROUTES 114 AND 120 REROUTED', 'Routes 114 and 120 rerouted'],
		// Dates kept: numeric ranges as written, a month before a day capitalised.
		[
			'10/19-10/23 GGFERRY WEEKDAY SERVICE DISRUPTIONS ON ALL ROUTES',
			'10/19-10/23 GGFERRY weekday service disruptions on all routes'
		],
		['NO SERVICE MAY 26', 'No service May 26'],
		['SCHEDULE CHANGE STARTS OCT 27', 'Schedule change starts Oct 27'],
		['NB STOP CLOSED AT 6 PM', 'NB stop closed at 6 PM']
	])('%s → %s', (raw, shown) => {
		expect(sourceSentenceCase(raw, GG)).toBe(shown);
	});

	it('"MAY" is a verb unless a day follows it', () => {
		expect(sourceSentenceCase('STOPS MAY CLOSE', GG)).toBe('Stops may close');
		expect(sourceSentenceCase('STOPS CLOSE MAY 3', GG)).toBe('Stops close May 3');
	});

	it('a token it can’t place keeps the original, whole', () => {
		expect(sourceSentenceCase('STOP 4B2 CLOSED', GG)).toBe('STOP 4B2 CLOSED');
		expect(sourceSentenceCase('USE GATE #3A-7', GG)).toBe('USE GATE #3A-7');
	});

	it('a word it doesn’t know (an unlisted place or acronym) keeps the original, whole (Codex 1a #1)', () => {
		expect(sourceSentenceCase('DELAYS AT SFO', GG)).toBe('DELAYS AT SFO');
		expect(sourceSentenceCase('SERVICE TO RICHMOND', GG)).toBe('SERVICE TO RICHMOND');
	});

	it('plurals and tenses of a known word are known', () => {
		expect(sourceSentenceCase('STOPS CLOSED, SAILINGS CANCELLED', GG)).toBe(
			'Stops closed, sailings cancelled'
		);
	});

	it('only text that is entirely capitals, and only from a named source', () => {
		expect(sourceSentenceCase('Coastal Flood Advisory', GG)).toBe('Coastal Flood Advisory');
		expect(sourceSentenceCase('MANZANITA Park & Ride', GG)).toBe('MANZANITA Park & Ride');
		expect(sourceSentenceCase('MANZANITA PARK & RIDE MAY FLOOD', '511')).toBe(
			'MANZANITA PARK & RIDE MAY FLOOD'
		);
		expect(sourceSentenceCase('11/5', GG)).toBe('11/5');
	});
});

describe('dropAlertPrefix (Stuart 2026-10-28: rows drop goldengate.org’s leading "ALERT")', () => {
	it('drops a leading ALERT word, with or without a colon', () => {
		expect(dropAlertPrefix('ALERT MANZANITA PARK & RIDE MAY FLOOD')).toBe(
			'MANZANITA PARK & RIDE MAY FLOOD'
		);
		expect(dropAlertPrefix('ALERT: ROUTE 30 DETOUR')).toBe('ROUTE 30 DETOUR');
	});
	it('keeps ALERT anywhere else, a word that only starts with it, or a headline that is only ALERT', () => {
		expect(dropAlertPrefix('ROUTE 30 ALERT')).toBe('ROUTE 30 ALERT');
		expect(dropAlertPrefix('ALERTS FOR ROUTE 30')).toBe('ALERTS FOR ROUTE 30');
		expect(dropAlertPrefix('ALERT')).toBe('ALERT');
	});
});
