/**
 * Tests for narrative tracker
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { analyzeNarratives, getNarrativeSummary, clearNarrativeHistory } from './narrative';
import type { NewsItem } from '$lib/types';

describe('Narrative Tracker', () => {
	beforeEach(() => {
		clearNarrativeHistory();
	});

	it('should return null for empty news', () => {
		expect(analyzeNarratives([])).toBeNull();
		expect(analyzeNarratives(null as unknown as NewsItem[])).toBeNull();
	});

	it('should detect narrative patterns', () => {
		const news: NewsItem[] = [
			{
				id: '1',
				title: 'NIMBY housing opposition blocks new project',
				source: 'Marin Independent Journal',
				link: 'a',
				timestamp: Date.now(),
				category: 'housing',
				verification: 'local_media'
			},
			{
				id: '2',
				title: 'Neighborhood character cited in density fight',
				source: 'Patch',
				link: 'b',
				timestamp: Date.now(),
				category: 'housing',
				verification: 'local_media'
			}
		];

		const results = analyzeNarratives(news);

		expect(results).not.toBeNull();
		const nimbyNarrative =
			results!.emergingFringe.find((n) => n.id === 'nimby-housing') ||
			results!.narrativeWatch.find((n) => n.id === 'nimby-housing');

		expect(nimbyNarrative).toBeDefined();
		expect(nimbyNarrative!.count).toBe(2);
	});

	it('should classify spreading narratives', () => {
		const news: NewsItem[] = [
			{
				id: '1',
				title: 'Cost of living pushes families out of Marin',
				source: 'Marin Magazine',
				link: 'a',
				timestamp: Date.now(),
				category: 'housing',
				verification: 'community'
			}
		];

		const results = analyzeNarratives(news);

		// cost-of-living has severity: 'spreading' in NARRATIVE_PATTERNS
		const costNarrative =
			results!.emergingFringe.find((n) => n.id === 'cost-of-living') ||
			results!.narrativeWatch.find((n) => n.id === 'cost-of-living');

		expect(costNarrative).toBeDefined();
	});

	it('should detect fringe-to-mainstream crossover', () => {
		const news: NewsItem[] = [
			{
				id: '1',
				title: 'Overtourism impacts trails on Mount Tam',
				source: 'Marin Magazine',
				link: 'a',
				timestamp: Date.now(),
				category: 'outdoors',
				verification: 'community'
			},
			{
				id: '2',
				title: 'Visitor impact grows at Point Reyes',
				source: 'Marin Independent Journal',
				link: 'b',
				timestamp: Date.now(),
				category: 'outdoors',
				verification: 'local_media'
			},
			{
				id: '3',
				title: 'Parking congestion forces weekend closures',
				source: 'Marin County',
				link: 'c',
				timestamp: Date.now(),
				category: 'civic',
				verification: 'official'
			}
		];

		const results = analyzeNarratives(news);

		// Should detect the tourism-pressure narrative crossing from community to official
		expect(results!.fringeToMainstream.length).toBeGreaterThan(0);
	});

	it('should classify source types correctly', () => {
		const news: NewsItem[] = [
			{
				id: '1',
				title: 'Water allocation dispute heats up',
				source: 'West Marin Feed',
				link: 'a',
				timestamp: Date.now(),
				category: 'local',
				verification: 'community'
			},
			{
				id: '2',
				title: 'Water rights challenged by new development',
				source: 'NextDoor',
				link: 'b',
				timestamp: Date.now(),
				category: 'local',
				verification: 'community'
			}
		];

		const results = analyzeNarratives(news);

		const waterNarrative = results!.emergingFringe.find((n) => n.id === 'water-wars');

		expect(waterNarrative).toBeDefined();
		expect(waterNarrative!.fringeCount).toBeGreaterThan(0);
	});

	it('should track keywords and headlines', () => {
		const news: NewsItem[] = [
			{
				id: '1',
				title: 'Fire preparedness efforts ramp up in Marin',
				source: 'Marin Independent Journal',
				link: 'a',
				timestamp: Date.now(),
				category: 'safety',
				verification: 'local_media'
			},
			{
				id: '2',
				title: 'Defensible space inspections begin countywide',
				source: 'Patch',
				link: 'b',
				timestamp: Date.now(),
				category: 'safety',
				verification: 'local_media'
			}
		];

		const results = analyzeNarratives(news);

		const firePrep =
			results!.emergingFringe.find((n) => n.id === 'fire-preparedness') ||
			results!.narrativeWatch.find((n) => n.id === 'fire-preparedness');

		expect(firePrep).toBeDefined();
		expect(firePrep!.keywords).toContain('fire preparedness');
		expect(firePrep!.headlines.length).toBeGreaterThan(0);
	});

	it('should return correct summary', () => {
		expect(getNarrativeSummary(null)).toEqual({ total: 0, status: 'NO DATA' });

		const news: NewsItem[] = [
			{
				id: '1',
				title: 'SMART train ridership drops again',
				source: 'Marin Independent Journal',
				link: 'a',
				timestamp: Date.now(),
				category: 'civic',
				verification: 'local_media'
			}
		];

		const results = analyzeNarratives(news);
		const summary = getNarrativeSummary(results);

		expect(summary.total).toBeGreaterThan(0);
		expect(summary.status).toMatch(/ACTIVE/);
	});

	it('should limit sources to 5', () => {
		const news: NewsItem[] = Array.from({ length: 10 }, (_, i) => ({
			id: String(i),
			title: 'NIMBY housing opposition in Marin',
			source: `Source${i}`,
			link: `link${i}`,
			timestamp: Date.now(),
			category: 'housing' as const,
			verification: 'local_media' as const
		}));

		const results = analyzeNarratives(news);

		const nimbyNarrative =
			results!.emergingFringe.find((n) => n.id === 'nimby-housing') ||
			results!.narrativeWatch.find((n) => n.id === 'nimby-housing');

		expect(nimbyNarrative!.sources.length).toBeLessThanOrEqual(5);
	});
});
