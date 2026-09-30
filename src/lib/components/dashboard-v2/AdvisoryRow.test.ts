import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { writable } from 'svelte/store';
import { describe, expect, it } from 'vitest';
import type { Advisory, AdvisoryFeedState } from '$lib/weather/advisories';
import AdvisoryRow from './AdvisoryRow.svelte';

const NOW = Date.parse('2026-09-29T15:00:00Z');
const MIN = 60_000;
const ADVISORY: Advisory = {
	id: 'a1',
	event: 'Coastal Flood Advisory',
	headline: null,
	severity: 'Minor',
	messageType: 'Alert',
	sentAt: NOW - 60 * MIN,
	effectiveAt: NOW - 60 * MIN,
	expiresAt: NOW + 2 * MIN,
	endsAt: Date.parse('2026-10-02T00:00:00Z'),
	references: [],
	zones: ['CAZ506']
};
const feedState = (over: Partial<AdvisoryFeedState> = {}): AdvisoryFeedState => ({
	advisories: [ADVISORY],
	unreadable: 0,
	lastAttemptAt: NOW,
	lastSuccessAt: NOW,
	lastError: null,
	...over
});
function renderRow(state: AdvisoryFeedState) {
	const clock = writable(NOW);
	const { container } = render(AdvisoryRow, { props: { feed: writable(state), now: clock } });
	return { container, clock, row: () => container.querySelector('[data-slot="advisories"]') };
}

describe('AdvisoryRow', () => {
	it('renders nothing before the first attempt, and nothing when coverage is good and nothing is current', () => {
		expect(
			renderRow(feedState({ lastAttemptAt: null, lastSuccessAt: null, advisories: [] })).row()
		).toBeNull();
		expect(renderRow(feedState({ advisories: [] })).row()).toBeNull();
	});
	it('shows each current advisory with its scope and end time', () => {
		const text = renderRow(feedState()).row()!.textContent!;
		expect(text).toContain('Coastal Flood Advisory');
		expect(text).toContain('North Bay interior valleys · until Oct 1, 5:00 PM');
	});
	it('drops an advisory when the clock passes its expiry, with no new data', async () => {
		const { clock, row } = renderRow(feedState());
		clock.set(NOW + 3 * MIN);
		await tick();
		expect(row()).toBeNull();
	});
	it('a failed fetch with nothing current says "Advisories unavailable"', () => {
		const text = renderRow(
			feedState({ advisories: [], lastError: 'HTTP 503', lastSuccessAt: null })
		).row()!.textContent!;
		expect(text).toContain('Advisories unavailable');
		expect(text).not.toMatch(/all clear/i);
	});
	it('an unreadable Marin alert is reported next to the readable ones, and alone it is never hidden (Codex r1 #5)', () => {
		expect(renderRow(feedState({ unreadable: 1 })).row()!.textContent).toContain(
			"1 advisory message couldn't be read"
		);
		const alone = renderRow(feedState({ advisories: [], unreadable: 2 })).row()!.textContent!;
		expect(alone).toContain('Advisories unavailable');
		expect(alone).toContain("2 advisory messages couldn't be read");
	});
	it('a failed refresh keeps current advisories and says since when', () => {
		const text = renderRow(
			feedState({ lastError: 'HTTP 503', lastSuccessAt: NOW - 20 * MIN })
		).row()!.textContent!;
		expect(text).toContain('Coastal Flood Advisory');
		expect(text).toContain('Advisories not updated since 7:40 AM');
	});
});
