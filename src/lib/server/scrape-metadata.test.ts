import { describe, expect, it } from 'vitest';
import {
	readSuccessfulScrapeAt,
	withPreservedSuccessfulScrapeMetadata,
	withSuccessfulScrapeMetadata
} from './scrape-metadata';

describe('readSuccessfulScrapeAt', () => {
	it('prefers the standardized field', () => {
		expect(
			readSuccessfulScrapeAt({
				lastSuccessfulScrapeAt: '2026-03-30T12:00:00.000Z',
				lastLiveScrapeAt: '2026-03-29T12:00:00.000Z'
			})
		).toBe('2026-03-30T12:00:00.000Z');
	});

	it('falls back to legacy and direct-update fields', () => {
		expect(readSuccessfulScrapeAt({ lastLiveScrapeAt: '2026-03-29T12:00:00.000Z' })).toBe(
			'2026-03-29T12:00:00.000Z'
		);
		expect(readSuccessfulScrapeAt({ lastUpdated: '2026-03-28T12:00:00.000Z' })).toBe(
			'2026-03-28T12:00:00.000Z'
		);
	});
});

describe('withSuccessfulScrapeMetadata', () => {
	it('stamps successful snapshots with their current timestamp by default', () => {
		expect(
			withSuccessfulScrapeMetadata({
				timestamp: '2026-03-30T12:00:00.000Z',
				value: 42
			})
		).toEqual({
			timestamp: '2026-03-30T12:00:00.000Z',
			value: 42,
			lastSuccessfulScrapeAt: '2026-03-30T12:00:00.000Z'
		});
	});
});

describe('withPreservedSuccessfulScrapeMetadata', () => {
	it('preserves the previous success timestamp when a run falls back', () => {
		expect(
			withPreservedSuccessfulScrapeMetadata(
				{
					timestamp: '2026-03-30T12:00:00.000Z',
					source: 'fallback'
				},
				{
					wasLive: false,
					previous: {
						lastSuccessfulScrapeAt: '2026-03-25T12:00:00.000Z'
					}
				}
			)
		).toEqual({
			timestamp: '2026-03-30T12:00:00.000Z',
			source: 'fallback',
			lastSuccessfulScrapeAt: '2026-03-25T12:00:00.000Z'
		});
	});

	it('can continue emitting the legacy lastLiveScrapeAt field when needed', () => {
		expect(
			withPreservedSuccessfulScrapeMetadata(
				{
					timestamp: '2026-03-30T12:00:00.000Z',
					source: 'live'
				},
				{
					wasLive: true,
					includeLegacyLastLive: true
				}
			)
		).toEqual({
			timestamp: '2026-03-30T12:00:00.000Z',
			source: 'live',
			lastSuccessfulScrapeAt: '2026-03-30T12:00:00.000Z',
			lastLiveScrapeAt: '2026-03-30T12:00:00.000Z'
		});
	});
});
