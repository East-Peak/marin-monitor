import { describe, it, expect } from 'vitest';
import { normalizeConnectorType, haversineDistance } from './ev-charging';

describe('normalizeConnectorType', () => {
	it('maps J1772 to J1772', () => {
		expect(normalizeConnectorType('J1772')).toBe('J1772');
	});

	it('maps J1772COMBO to CCS', () => {
		expect(normalizeConnectorType('J1772COMBO')).toBe('CCS');
	});

	it('maps CCS to CCS', () => {
		expect(normalizeConnectorType('CCS')).toBe('CCS');
	});

	it('maps CHADEMO to CHAdeMO', () => {
		expect(normalizeConnectorType('CHADEMO')).toBe('CHAdeMO');
	});

	it('maps TESLA to NACS', () => {
		expect(normalizeConnectorType('TESLA')).toBe('NACS');
	});

	it('maps NACS to NACS', () => {
		expect(normalizeConnectorType('NACS')).toBe('NACS');
	});

	it('maps unknown types to OTHER', () => {
		expect(normalizeConnectorType('SOME_FUTURE_TYPE')).toBe('OTHER');
	});

	it('is case-insensitive', () => {
		expect(normalizeConnectorType('j1772combo')).toBe('CCS');
		expect(normalizeConnectorType('chademo')).toBe('CHAdeMO');
		expect(normalizeConnectorType('tesla')).toBe('NACS');
	});
});

describe('haversineDistance', () => {
	it('returns 0 for same point', () => {
		expect(haversineDistance(37.97, -122.53, 37.97, -122.53)).toBe(0);
	});

	it('computes distance between two known points', () => {
		// San Rafael to Novato — roughly 16km
		const dist = haversineDistance(37.97, -122.53, 38.11, -122.57);
		expect(dist).toBeGreaterThan(15000);
		expect(dist).toBeLessThan(17000);
	});

	it('returns small distance for nearby points', () => {
		// Two points ~30m apart
		const dist = haversineDistance(37.97, -122.53, 37.97003, -122.53);
		expect(dist).toBeGreaterThan(0);
		expect(dist).toBeLessThan(50);
	});
});
