/**
 * Tests for correlation engine
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { analyzeCorrelations, getCorrelationSummary, clearCorrelationHistory } from './correlation';
import type { NewsItem } from '$lib/types';

describe('Correlation Engine', () => {
	beforeEach(() => {
		clearCorrelationHistory();
	});

	it('should return null for empty news', () => {
		expect(analyzeCorrelations([])).toBeNull();
		expect(analyzeCorrelations(null as unknown as NewsItem[])).toBeNull();
	});

	it('should detect emerging patterns', () => {
		const news: NewsItem[] = [
			{
				id: '1',
				title: 'Wildfire threatens West Marin homes',
				source: 'Marin Independent Journal',
				link: 'a',
				timestamp: Date.now(),
				category: 'safety',
				verification: 'local_media'
			},
			{
				id: '2',
				title: 'Red flag warning issued for Marin hills',
				source: 'NWS',
				link: 'b',
				timestamp: Date.now(),
				category: 'safety',
				verification: 'official'
			},
			{
				id: '3',
				title: 'PSPS power shutoff planned for fire season',
				source: 'Patch',
				link: 'c',
				timestamp: Date.now(),
				category: 'safety',
				verification: 'local_media'
			}
		];

		const results = analyzeCorrelations(news);

		expect(results).not.toBeNull();
		expect(results!.emergingPatterns.length).toBeGreaterThan(0);

		const firePattern = results!.emergingPatterns.find((p) => p.id === 'fire-season');
		expect(firePattern).toBeDefined();
		expect(firePattern!.count).toBeGreaterThanOrEqual(3);
		expect(firePattern!.level).toBe('emerging');
	});

	it('should categorize pattern levels correctly', () => {
		// Create many fire-related articles to trigger 'high' level
		const news: NewsItem[] = Array.from({ length: 10 }, (_, i) => ({
			id: String(i),
			title: `Wildfire update ${i}`,
			source: `Source${i}`,
			link: `link${i}`,
			timestamp: Date.now(),
			category: 'safety' as const,
			verification: 'local_media' as const
		}));

		const results = analyzeCorrelations(news);
		const firePattern = results?.emergingPatterns.find((p) => p.id === 'fire-season');

		expect(firePattern?.level).toBe('high');
	});

	it('should track cross-source correlations', () => {
		const news: NewsItem[] = [
			{
				id: '1',
				title: 'Housing prices hit new high in Marin',
				source: 'Marin Independent Journal',
				link: 'a',
				timestamp: Date.now(),
				category: 'housing',
				verification: 'local_media'
			},
			{
				id: '2',
				title: 'Home sale volume drops in county',
				source: 'SF Chronicle',
				link: 'b',
				timestamp: Date.now(),
				category: 'housing',
				verification: 'local_media'
			},
			{
				id: '3',
				title: 'Real estate market cools in Marin',
				source: 'Patch',
				link: 'c',
				timestamp: Date.now(),
				category: 'housing',
				verification: 'local_media'
			},
			{
				id: '4',
				title: 'Median price rises for Marin listings',
				source: 'Marin Magazine',
				link: 'd',
				timestamp: Date.now(),
				category: 'housing',
				verification: 'community'
			}
		];

		const results = analyzeCorrelations(news);
		const housingCorrelation = results?.crossSourceCorrelations.find(
			(c) => c.id === 'housing-market'
		);

		expect(housingCorrelation).toBeDefined();
		expect(housingCorrelation!.sourceCount).toBe(4);
		expect(housingCorrelation!.sources).toContain('Marin Independent Journal');
	});

	it('should generate predictive signals for high scores', () => {
		// Create many water-supply articles to generate predictive signals
		const news: NewsItem[] = Array.from({ length: 8 }, (_, i) => ({
			id: String(i),
			title: `Drought restrictions update ${i}`,
			source: `Source${i % 4}`,
			link: `link${i}`,
			timestamp: Date.now(),
			category: 'local' as const,
			verification: 'local_media' as const
		}));

		const results = analyzeCorrelations(news);

		expect(results?.predictiveSignals.length).toBeGreaterThan(0);

		const waterSignal = results?.predictiveSignals.find((s) => s.id === 'water-supply');
		if (waterSignal) {
			expect(waterSignal.prediction).toContain('Water supply');
		}
	});

	it('should collect headlines for patterns', () => {
		const news: NewsItem[] = [
			{
				id: '1',
				title: 'Mt. Tam trail closure due to storm damage',
				source: 'Marin Independent Journal',
				link: 'https://marinij.com/1',
				timestamp: Date.now(),
				category: 'outdoors',
				verification: 'local_media'
			},
			{
				id: '2',
				title: 'Point Reyes park closed for restoration',
				source: 'Point Reyes Light',
				link: 'https://ptreyeslight.com/2',
				timestamp: Date.now(),
				category: 'outdoors',
				verification: 'local_media'
			},
			{
				id: '3',
				title: 'Muir Woods access restricted this weekend',
				source: 'Patch',
				link: 'https://patch.com/3',
				timestamp: Date.now(),
				category: 'outdoors',
				verification: 'local_media'
			}
		];

		const results = analyzeCorrelations(news);
		const trailsPattern = results?.emergingPatterns.find((p) => p.id === 'trails-parks');

		expect(trailsPattern?.headlines.length).toBeGreaterThan(0);
		expect(trailsPattern?.headlines[0].link).toBeDefined();
		expect(trailsPattern?.headlines[0].source).toBeDefined();
	});

	it('should return correct summary', () => {
		expect(getCorrelationSummary(null)).toEqual({ totalSignals: 0, status: 'NO DATA' });

		const news: NewsItem[] = [
			{
				id: '1',
				title: 'Wildfire update for Marin County',
				source: 'NWS',
				link: 'a',
				timestamp: Date.now(),
				category: 'safety',
				verification: 'official'
			},
			{
				id: '2',
				title: 'Fire season prep underway',
				source: 'Marin Independent Journal',
				link: 'b',
				timestamp: Date.now(),
				category: 'safety',
				verification: 'local_media'
			},
			{
				id: '3',
				title: 'Evacuation routes updated for fire season',
				source: 'Marin County',
				link: 'c',
				timestamp: Date.now(),
				category: 'safety',
				verification: 'official'
			}
		];

		const results = analyzeCorrelations(news);
		const summary = getCorrelationSummary(results);

		expect(summary.totalSignals).toBeGreaterThan(0);
		expect(summary.status).toMatch(/SIGNALS/);
	});
});
