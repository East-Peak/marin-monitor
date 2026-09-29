import { describe, expect, it } from 'vitest';
import { incidentTimestamp } from './timestamp';

const utc = (iso: string) => Date.parse(iso);

describe('incidentTimestamp (America/Los_Angeles)', () => {
	it('reads a summer time as PDT', () => {
		expect(incidentTimestamp('2026-09-16', '07:56')).toBe(utc('2026-09-16T14:56:00Z'));
	});
	it('reads a winter time as PST', () => {
		expect(incidentTimestamp('2026-12-01', '08:00')).toBe(utc('2026-12-01T16:00:00Z'));
	});
	it('takes the earlier instant for an ambiguous fall-back time', () => {
		expect(incidentTimestamp('2026-11-01', '01:30')).toBe(utc('2026-11-01T08:30:00Z'));
	});
	it('reads the hour after fall-back as PST', () => {
		expect(incidentTimestamp('2026-11-01', '02:30')).toBe(utc('2026-11-01T10:30:00Z'));
	});
	it('shifts a nonexistent spring-forward time forward', () => {
		expect(incidentTimestamp('2027-03-14', '02:30')).toBe(utc('2027-03-14T10:30:00Z'));
	});
	it('reads the minute before spring-forward as PST', () => {
		expect(incidentTimestamp('2027-03-14', '01:59')).toBe(utc('2027-03-14T09:59:00Z'));
	});
	it('crosses the year boundary', () => {
		expect(incidentTimestamp('2026-12-31', '23:59')).toBe(utc('2027-01-01T07:59:00Z'));
		expect(incidentTimestamp('2027-01-01', '00:01')).toBe(utc('2027-01-01T08:01:00Z'));
	});
});
