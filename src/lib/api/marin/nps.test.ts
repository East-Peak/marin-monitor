import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fetchWithTimeout
vi.mock('./fetch-helpers', () => ({
	fetchWithTimeout: vi.fn()
}));

vi.mock('$lib/config/api', () => ({
	logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

import { fetchNpsAlerts } from './nps';
import { fetchWithTimeout } from './fetch-helpers';

const mockFetch = vi.mocked(fetchWithTimeout);

function makeResponse(data: unknown, ok = true, status = 200): Response {
	return {
		ok,
		status,
		json: () => Promise.resolve(data)
	} as Response;
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe('fetchNpsAlerts', () => {
	const validAlerts = [
		{
			id: 'alert-001',
			title: 'Trail Closure at Coastal Trail',
			description: 'The Coastal Trail is closed due to mudslides.',
			parkCode: 'pore',
			category: 'Park Closure',
			url: 'https://www.nps.gov/pore/planyourvisit/conditions.htm',
			lastIndexedDate: '2024-03-01T12:00:00Z'
		},
		{
			id: 'alert-002',
			title: 'High Surf Advisory',
			description: 'Dangerous surf conditions at all beaches.',
			parkCode: 'goga',
			category: 'Danger',
			url: 'https://www.nps.gov/goga/alert.htm',
			lastIndexedDate: '2024-03-02T08:00:00Z'
		},
		{
			id: 'alert-003',
			title: 'Parking Lot Resurfacing',
			description: 'Muir Woods parking lot will be closed for resurfacing.',
			parkCode: 'muwo',
			category: 'Information',
			url: '',
			lastIndexedDate: '2024-03-03T10:00:00Z'
		}
	];

	it('parses valid NPS alerts into NewsItem[]', async () => {
		mockFetch.mockResolvedValueOnce(makeResponse(validAlerts));

		const result = await fetchNpsAlerts();

		expect(result).toHaveLength(3);
		expect(result[0].id).toBe('nps-alert-001');
		expect(result[0].title).toBe('Trail Closure at Coastal Trail');
		expect(result[0].category).toBe('outdoors');
		expect(result[0].verification).toBe('official');
	});

	it('maps parkCode to human-readable source names', async () => {
		mockFetch.mockResolvedValueOnce(makeResponse(validAlerts));

		const result = await fetchNpsAlerts();

		expect(result[0].source).toBe('NPS \u2013 Point Reyes');
		expect(result[1].source).toBe('NPS \u2013 Golden Gate NRA');
		expect(result[2].source).toBe('NPS \u2013 Muir Woods');
	});

	it('sets isAlert=true for Danger and Park Closure categories', async () => {
		mockFetch.mockResolvedValueOnce(makeResponse(validAlerts));

		const result = await fetchNpsAlerts();

		expect(result[0].isAlert).toBe(true); // Park Closure
		expect(result[1].isAlert).toBe(true); // Danger
		expect(result[2].isAlert).toBe(false); // Information
	});

	it('uses fallback URL when alert.url is empty', async () => {
		mockFetch.mockResolvedValueOnce(makeResponse(validAlerts));

		const result = await fetchNpsAlerts();

		// alert-003 has empty url
		expect(result[2].link).toBe(
			'https://www.nps.gov/muwo/planyourvisit/conditions.htm'
		);
	});

	it('truncates description to 300 characters', async () => {
		const longAlert = [
			{
				id: 'alert-long',
				title: 'Long Alert',
				description: 'A'.repeat(500),
				parkCode: 'pore',
				category: 'Information',
				url: 'https://nps.gov',
				lastIndexedDate: '2024-01-01T00:00:00Z'
			}
		];
		mockFetch.mockResolvedValueOnce(makeResponse(longAlert));

		const result = await fetchNpsAlerts();

		expect(result[0].description!.length).toBe(300);
	});

	it('converts lastIndexedDate to timestamp', async () => {
		mockFetch.mockResolvedValueOnce(makeResponse(validAlerts));

		const result = await fetchNpsAlerts();

		expect(result[0].timestamp).toBe(new Date('2024-03-01T12:00:00Z').getTime());
	});

	it('returns empty array on HTTP error', async () => {
		mockFetch.mockResolvedValueOnce(makeResponse(null, false, 500));

		const result = await fetchNpsAlerts();

		expect(result).toEqual([]);
	});

	it('returns empty array on network error', async () => {
		mockFetch.mockRejectedValueOnce(new Error('Failed to fetch'));

		const result = await fetchNpsAlerts();

		expect(result).toEqual([]);
	});

	it('handles unknown parkCode gracefully', async () => {
		const unknownPark = [
			{
				id: 'alert-x',
				title: 'Test',
				description: 'Test',
				parkCode: 'zzzz',
				category: 'Caution',
				url: 'https://nps.gov',
				lastIndexedDate: '2024-01-01T00:00:00Z'
			}
		];
		mockFetch.mockResolvedValueOnce(makeResponse(unknownPark));

		const result = await fetchNpsAlerts();

		expect(result[0].source).toBe('NPS \u2013 ZZZZ');
	});

	it('returns empty array when API returns empty list', async () => {
		mockFetch.mockResolvedValueOnce(makeResponse([]));

		const result = await fetchNpsAlerts();

		expect(result).toEqual([]);
	});
});
