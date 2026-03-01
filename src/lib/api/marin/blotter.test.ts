import { describe, expect, it } from 'vitest';
import { translateSheriffCrimeLabel, type SheriffCrimeRecord } from './blotter';

function makeRecord(overrides: Partial<SheriffCrimeRecord>): SheriffCrimeRecord {
	return {
		unique_id: 'SO260000001',
		incident_date_time: '2026-02-27T12:00:00.000',
		crime: 'THEFT',
		crime_class: 'THEFT',
		...overrides
	};
}

describe('translateSheriffCrimeLabel', () => {
	it('translates common sheriff shorthand codes', () => {
		expect(
			translateSheriffCrimeLabel(
				makeRecord({ crime: 'WARR ARR', crime_class: 'ALL OTHER - CRIMINAL' })
			)
		).toBe('Warrant arrest');
		expect(
			translateSheriffCrimeLabel(
				makeRecord({ crime: 'MISC PC', crime_class: 'ALL OTHER - CRIMINAL' })
			)
		).toBe('Misc. Penal Code violation');
		expect(
			translateSheriffCrimeLabel(
				makeRecord({ crime: 'HS', crime_class: 'DRUGS / NARCOTICS VIOLATION' })
			)
		).toBe('Health & Safety Code violation');
	});

	it('falls back to crime class when it is more human-readable', () => {
		expect(
			translateSheriffCrimeLabel(
				makeRecord({ crime: 'UNKNOWN', crime_class: 'BURGLARY - COMMERCIAL' })
			)
		).toBe('Burglary - Commercial');
	});

	it('falls back to a title-cased version of the raw code', () => {
		expect(
			translateSheriffCrimeLabel(
				makeRecord({ crime: 'CURFEW VIOL', crime_class: 'ALL OTHER - CRIMINAL' })
			)
		).toBe('Curfew Viol');
	});
});
