import { describe, expect, it } from 'vitest';
import { extractBlobFreshnessTimestamp, resolveBlobFreshnessTimestamp } from './blob-freshness';

describe('extractBlobFreshnessTimestamp', () => {
	it('reads standardized freshness metadata from current snapshots', () => {
		expect(
			extractBlobFreshnessTimestamp({
				current: {
					timestamp: '2026-03-30T12:00:00.000Z',
					lastSuccessfulScrapeAt: '2026-03-29T12:00:00.000Z'
				}
			})
		).toBe('2026-03-29T12:00:00.000Z');
	});

	it('falls back to direct-object lastUpdated metadata', () => {
		expect(
			extractBlobFreshnessTimestamp({
				lastUpdated: '2026-03-28T12:00:00.000Z'
			})
		).toBe('2026-03-28T12:00:00.000Z');
	});

	it('returns null for array-backed blobs without embedded metadata', () => {
		expect(extractBlobFreshnessTimestamp([{ timestamp: '2026-03-30T12:00:00.000Z' }])).toBeNull();
	});
});

describe('resolveBlobFreshnessTimestamp', () => {
	it('falls back to blob upload time when content metadata is unavailable', () => {
		expect(
			resolveBlobFreshnessTimestamp(
				[{ timestamp: '2026-03-30T12:00:00.000Z' }],
				'2026-03-27T12:00:00.000Z'
			)
		).toBe('2026-03-27T12:00:00.000Z');
	});
});
