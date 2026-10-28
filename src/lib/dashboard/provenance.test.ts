import { describe, expect, it } from 'vitest';
import { measuredLoading, measuredUnavailable, measuredUnknown, measuredValue } from './measured';
import { provenance } from './provenance';

const NOW = Date.parse('2026-10-28T18:00:00Z'); // 11:00 AM PDT

describe('provenance (rule 3: a source and its time, never a bare value)', () => {
	it('a current value: source and its time with its verb; no attention, so no colour (Stuart 2026-10-28)', () => {
		expect(provenance({ measured: measuredValue(1, 'AirNow', NOW - 60 * 60_000) }, NOW)).toEqual({
			text: 'AirNow · as of 10:00 AM',
			attention: false
		});
		expect(
			provenance(
				{ measured: measuredValue(1, 'CAL FIRE + NIFC', NOW - 60_000), verb: 'checked' },
				NOW
			)
		).toEqual({ text: 'CAL FIRE + NIFC · checked 10:59 AM', attention: false });
	});

	it('a value without a time says why; a kept value says it is out of date, and needs attention', () => {
		expect(
			provenance(
				{ measured: measuredValue(1, 'NOAA', null), untimed: 'astronomical prediction' },
				NOW
			)
		).toEqual({ text: 'NOAA · astronomical prediction', attention: false });
		expect(
			provenance(
				{ measured: measuredValue(1, 'AirNow', NOW - 3_600_000, 'the source returned an error') },
				NOW
			)
		).toEqual({
			text: 'AirNow · as of 10:00 AM · out of date (the source returned an error)',
			attention: true
		});
	});

	it('loading, unknown and unavailable: their words; failures need attention', () => {
		expect(provenance({ measured: measuredLoading('USGS') }, NOW)).toEqual({
			text: 'USGS · loading…',
			attention: false
		});
		expect(provenance({ measured: measuredUnknown('USGS', 'no value') }, NOW)).toEqual({
			text: 'USGS · unverified (no value)',
			attention: true
		});
		expect(
			provenance({ measured: measuredUnavailable('AirNow', 'the source returned an error') }, NOW)
		).toEqual({ text: 'AirNow · unavailable (the source returned an error)', attention: true });
	});

	it('a muted line (no freshness claim) never needs attention while it holds a value', () => {
		expect(
			provenance({ measured: measuredValue(1, 'Our estimate', null), muted: true }, NOW).attention
		).toBe(false);
	});
});
