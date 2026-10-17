import { fireEvent, render, screen } from '@testing-library/svelte';
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
	zones: ['CAZ506'],
	description: null,
	instruction: null
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

describe('AdvisoryRow on desktop (MAPX1): chips and the advisory reader', () => {
	const BEACH: Advisory = {
		...ADVISORY,
		id: 'a2',
		event: 'Beach Hazards Statement',
		severity: 'Moderate',
		zones: ['CAZ505'],
		description: '* WHAT...Sneaker waves.\n\n* WHERE...North Bay coast.',
		instruction: 'Never turn your back on the ocean.'
	};
	function renderDesktop(state: AdvisoryFeedState) {
		const { container } = render(AdvisoryRow, {
			props: { feed: writable(state), now: writable(NOW), desktop: true }
		});
		return container;
	}

	it('each active advisory is a compact chip with its scope and end, in one wrapping row', () => {
		const c = renderDesktop(feedState({ advisories: [ADVISORY, BEACH] }));
		const chips = [...c.querySelectorAll('[data-slot="advisories"] button[data-advisory]')];
		expect(chips.map((b) => b.textContent!.replace(/\s+/g, ' ').trim())).toEqual([
			'⚠ Beach Hazards Statement · North Bay coast · until Oct 1, 5:00 PM',
			'⚠ Coastal Flood Advisory · North Bay interior valleys · until Oct 1, 5:00 PM'
		]);
		expect(c.querySelector('[data-slot="advisories"]')!.classList).toContain('v2-adv-chips');
	});

	it('a chip opens the NWS text in a dialog; Esc closes it and focus returns to the chip', async () => {
		renderDesktop(feedState({ advisories: [BEACH] }));
		const chip = screen.getByRole('button', { name: /Beach Hazards Statement/ });
		chip.focus();
		await fireEvent.click(chip);
		const dialog = screen.getByRole('dialog', { name: 'Beach Hazards Statement' });
		expect(dialog.getAttribute('aria-modal')).toBe('true');
		expect(dialog.textContent).toContain('* WHAT...Sneaker waves.');
		expect(dialog.textContent).toContain('Never turn your back on the ocean.');
		expect(dialog.querySelector('a[href^="https://www.weather.gov/"]')).not.toBeNull();
		expect(dialog.contains(document.activeElement)).toBe(true);
		await fireEvent.keyDown(dialog, { key: 'Escape' });
		expect(screen.queryByRole('dialog')).toBeNull();
		expect(document.activeElement).toBe(chip);
	});

	it('Tab stays inside the open dialog (focus trap); the close button closes it', async () => {
		renderDesktop(feedState({ advisories: [BEACH] }));
		await fireEvent.click(screen.getByRole('button', { name: /Beach Hazards Statement/ }));
		const dialog = screen.getByRole('dialog');
		const focusable = [...dialog.querySelectorAll<HTMLElement>('a[href], button')];
		focusable.at(-1)!.focus();
		await fireEvent.keyDown(dialog, { key: 'Tab' });
		expect(document.activeElement).toBe(focusable[0]);
		focusable[0].focus();
		await fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
		expect(document.activeElement).toBe(focusable.at(-1));
		await fireEvent.click(screen.getByRole('button', { name: 'Close' }));
		expect(screen.queryByRole('dialog')).toBeNull();
	});

	it('an advisory without NWS text says so rather than showing an empty reader', async () => {
		renderDesktop(feedState());
		await fireEvent.click(screen.getByRole('button', { name: /Coastal Flood Advisory/ }));
		expect(screen.getByRole('dialog').textContent).toContain('NWS gave no text for this advisory');
	});

	it('unavailable stays one muted line on desktop', () => {
		const c = renderDesktop(
			feedState({ advisories: [], lastError: 'HTTP 503', lastSuccessAt: null })
		);
		expect(c.querySelector('[data-slot="advisories"]')!.textContent).toContain(
			'Advisories unavailable'
		);
		expect(c.querySelector('button[data-advisory]')).toBeNull();
		// A line, not a full-width box.
		expect(c.querySelector('[data-slot="advisories"]')!.classList).toContain('v2-adv-line');
	});
});

describe('AdvisoryRow reader focus fallback (MAPX1, Codex #5)', () => {
	it('when the advisory expires under an open reader, focus lands on the page, not nowhere', async () => {
		const top = document.createElement('div');
		top.id = 'top';
		top.tabIndex = -1;
		document.body.append(top);
		const clock = writable(NOW);
		render(AdvisoryRow, { props: { feed: writable(feedState()), now: clock, desktop: true } });
		const chip = screen.getByRole('button', { name: /Coastal Flood Advisory/ });
		chip.focus(); // a real click focuses the button; jsdom's doesn't
		await fireEvent.click(chip);
		expect(screen.getByRole('dialog')).toBeTruthy();
		clock.set(NOW + 3 * MIN);
		await tick();
		await Promise.resolve();
		expect(screen.queryByRole('dialog')).toBeNull();
		expect(document.activeElement).toBe(top);
		top.remove();
	});
});
