/**
 * Tests for keyword matching utilities
 *
 * Critical: word-boundary matching must prevent false positives.
 * "MarinFire" should NOT trigger, but "fire on Miller Ave" SHOULD.
 */

import { describe, it, expect } from 'vitest';
import { containsAlertKeyword, detectTown, detectTopics } from './keywords';

describe('containsAlertKeyword', () => {
	describe('basic matching', () => {
		it('detects "fire" as a standalone word', () => {
			const result = containsAlertKeyword('fire on Miller Ave');
			expect(result.isAlert).toBe(true);
			expect(result.keyword).toBe('fire');
		});

		it('does NOT trigger on "MarinFire" (no word boundary)', () => {
			const result = containsAlertKeyword('MarinFire department update');
			expect(result.isAlert).toBe(false);
		});

		it('detects "wildfire" in title', () => {
			const result = containsAlertKeyword('Wildfire threatens West Marin homes');
			expect(result.isAlert).toBe(true);
			expect(result.keyword).toBe('wildfire');
		});

		it('detects "evacuation" case-insensitively', () => {
			const result = containsAlertKeyword('EVACUATION ORDER issued for Tam Valley');
			expect(result.isAlert).toBe(true);
			expect(result.keyword).toBe('evacuation');
		});

		it('detects multi-word phrases like "red flag warning"', () => {
			const result = containsAlertKeyword('Red Flag Warning issued for Marin hills');
			expect(result.isAlert).toBe(true);
			expect(result.keyword).toBe('red flag warning');
		});

		it('detects "power outage"', () => {
			const result = containsAlertKeyword('Major power outage affects Novato');
			expect(result.isAlert).toBe(true);
			expect(result.keyword).toBe('power outage');
		});

		it('detects "earthquake"', () => {
			const result = containsAlertKeyword('3.2 earthquake felt in San Rafael');
			expect(result.isAlert).toBe(true);
			expect(result.keyword).toBe('earthquake');
		});

		it('detects "road closure"', () => {
			const result = containsAlertKeyword('Road closure on Highway 1 near Stinson');
			expect(result.isAlert).toBe(true);
			expect(result.keyword).toBe('road closure');
		});

		it('returns no alert for normal text', () => {
			const result = containsAlertKeyword('Farmers market opens Saturday in San Anselmo');
			expect(result.isAlert).toBe(false);
			expect(result.keyword).toBeUndefined();
		});
	});

	describe('word boundary edge cases', () => {
		it('matches keyword at start of text', () => {
			const result = containsAlertKeyword('Fire breaks out near Fairfax');
			expect(result.isAlert).toBe(true);
		});

		it('matches keyword at end of text', () => {
			const result = containsAlertKeyword('Residents prepare for wildfire');
			expect(result.isAlert).toBe(true);
		});

		it('matches keyword surrounded by punctuation', () => {
			const result = containsAlertKeyword('Breaking: fire, Mill Valley');
			expect(result.isAlert).toBe(true);
		});

		it('does NOT match keyword embedded in a longer word', () => {
			// "fire" inside "bonfire" — should NOT trigger because 'fire' is not word-boundary delimited
			// Actually with (^|[^a-z]) pattern, "bonfire" has 'n' before 'fire', which is [a-z], so no match
			const result = containsAlertKeyword('bonfire night celebration');
			expect(result.isAlert).toBe(false);
		});

		it('does NOT match "campfire" for keyword "fire"', () => {
			const result = containsAlertKeyword('Campfire stories at Point Reyes');
			expect(result.isAlert).toBe(false);
		});
	});

	describe('satire suppression', () => {
		it('suppresses alerts for satire verification level', () => {
			const result = containsAlertKeyword('Wildfire of opinions at town hall', {
				verification: 'satire'
			});
			expect(result.isAlert).toBe(false);
		});

		it('suppresses alerts for Marin Lately source', () => {
			const result = containsAlertKeyword('Evacuation order for bad vibes', {
				source: 'Marin Lately'
			});
			expect(result.isAlert).toBe(false);
		});
	});

	describe('editorial suppression', () => {
		it('suppresses alerts for opinion pieces (in text)', () => {
			const result = containsAlertKeyword('Opinion: fire safety needs improvement');
			expect(result.isAlert).toBe(false);
		});

		it('suppresses alerts for letters to the editor', () => {
			const result = containsAlertKeyword('Letter to the Editor: Earthquake preparedness');
			expect(result.isAlert).toBe(false);
		});

		it('suppresses alerts for opinion URL paths', () => {
			const result = containsAlertKeyword('Fire safety discussion', {
				link: 'https://marinij.com/opinion/fire-safety'
			});
			expect(result.isAlert).toBe(false);
		});

		it('suppresses alerts for editorial URL paths', () => {
			const result = containsAlertKeyword('Earthquake readiness plan', {
				link: 'https://example.com/editorial/earthquake-plan'
			});
			expect(result.isAlert).toBe(false);
		});
	});

	describe('historical suppression', () => {
		it('suppresses alerts mentioning a year (historical reference)', () => {
			const result = containsAlertKeyword('The great fire in 1992 devastated the area');
			expect(result.isAlert).toBe(false);
		});

		it('suppresses alerts with "anniversary"', () => {
			const result = containsAlertKeyword('Anniversary of the earthquake marked');
			expect(result.isAlert).toBe(false);
		});

		it('suppresses alerts with "years ago"', () => {
			const result = containsAlertKeyword('Wildfire 50 years ago shaped policy');
			expect(result.isAlert).toBe(false);
		});

		it('suppresses alerts with "looking back"', () => {
			const result = containsAlertKeyword('Looking back at the 1989 earthquake');
			expect(result.isAlert).toBe(false);
		});
	});
});

describe('detectTown', () => {
	it('detects "Mill Valley" in text', () => {
		const result = detectTown('Fire near Mill Valley community center');
		expect(result).not.toBeNull();
		expect(result!.slug).toBe('mill-valley');
		expect(result!.name).toBe('Mill Valley');
	});

	it('detects "Sausalito" in text', () => {
		const result = detectTown('Art festival in Sausalito this weekend');
		expect(result).not.toBeNull();
		expect(result!.slug).toBe('sausalito');
	});

	it('detects "San Rafael" in text', () => {
		const result = detectTown('San Rafael city council meets Tuesday');
		expect(result).not.toBeNull();
		expect(result!.slug).toBe('san-rafael');
	});

	it('detects "Novato" in text', () => {
		const result = detectTown('Novato schools close for teacher day');
		expect(result).not.toBeNull();
		expect(result!.slug).toBe('novato');
	});

	it('returns null for text with no town', () => {
		const result = detectTown('Weather forecast for the Bay Area');
		expect(result).toBeNull();
	});

	it('is case-insensitive', () => {
		const result = detectTown('MILL VALLEY residents rally');
		expect(result).not.toBeNull();
		expect(result!.slug).toBe('mill-valley');
	});

	describe('aliases', () => {
		it('detects "Pt Reyes" as Point Reyes', () => {
			const result = detectTown('Pt Reyes lighthouse closed');
			expect(result).not.toBeNull();
			expect(result!.slug).toBe('point-reyes');
		});

		it('detects "Pt. Reyes" as Point Reyes', () => {
			const result = detectTown('Pt. Reyes station farmers market');
			expect(result).not.toBeNull();
			expect(result!.slug).toBe('point-reyes');
		});

		it('detects "Stinson" as Stinson Beach', () => {
			const result = detectTown('Surf report for Stinson');
			expect(result).not.toBeNull();
			expect(result!.slug).toBe('stinson-beach');
		});
	});

	it('uses word boundaries to avoid false matches', () => {
		// "Ross" is a town — make sure it doesn't match in "cross" or "Rossini"
		const resultCross = detectTown('Cross the bridge to San Francisco');
		// This should not match "Ross" because "cross" has a 'c' before it
		if (resultCross) {
			expect(resultCross.slug).not.toBe('ross');
		}
	});
});

describe('detectTopics', () => {
	it('detects FIRE topic', () => {
		const topics = detectTopics('Wildfire threatens homes near Tam');
		expect(topics).toContain('FIRE');
	});

	it('detects WEATHER topic', () => {
		const topics = detectTopics('Heavy rain expected this weekend');
		expect(topics).toContain('WEATHER');
	});

	it('detects TRAFFIC topic', () => {
		const topics = detectTopics('Traffic on 101 backed up for miles');
		expect(topics).toContain('TRAFFIC');
	});

	it('detects multiple topics', () => {
		const topics = detectTopics('Storm causes flooding and road closure on highway 101');
		expect(topics).toContain('WEATHER');
		expect(topics).toContain('TRAFFIC');
	});

	it('detects HOUSING topic', () => {
		const topics = detectTopics('Median price hits new high in Marin housing market');
		expect(topics).toContain('HOUSING');
	});

	it('detects ENVIRONMENT topic', () => {
		const topics = detectTopics('MMWD reservoir levels drop amid drought');
		expect(topics).toContain('ENVIRONMENT');
	});

	it('detects SCHOOLS topic', () => {
		const topics = detectTopics('College of Marin announces new program');
		expect(topics).toContain('SCHOOLS');
	});

	it('detects CIVIC topic', () => {
		const topics = detectTopics('Board of supervisors votes on new measure');
		expect(topics).toContain('CIVIC');
	});

	it('returns empty array for unrelated text', () => {
		const topics = detectTopics('Best pizza in the Bay Area');
		expect(topics).toEqual([]);
	});
});
