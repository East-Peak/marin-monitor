import { render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import oct15 from '$lib/utils/__fixtures__/gas-prices-2026-10-15.json';

vi.mock('$app/environment', () => ({ browser: true, dev: true, building: false, version: 'test' }));

import GasPricesPanel from './GasPricesPanel.svelte';

/** The fixture keeps averages only; the panel also reads the other fuels and the station list. */
const CURRENT = {
	...oct15.current,
	avgMidgrade: null,
	avgPremium: null,
	avgDiesel: null,
	minRegular: null,
	maxRegular: null,
	stationCount: 0,
	stations: []
};

function serve(body: unknown) {
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }))
	);
}

/** The value and detail under the "7-Day Change" label. */
async function sevenDayCard() {
	const label = await screen.findByText('7-Day Change');
	const card = label.closest('.summary-card') as HTMLElement;
	return {
		value: card.querySelector('.summary-value')?.textContent?.trim(),
		detail: card.querySelector('.summary-detail')?.textContent?.trim()
	};
}

afterEach(() => vi.unstubAllGlobals());

describe('GasPricesPanel', () => {
	it("7-day change card shows the helper's value, not history[41]", async () => {
		serve({ current: CURRENT, history: oct15.history });
		render(GasPricesPanel);
		// Sorted oldest first, history[41] is a July reading (+$0.759); the real week's change is −$0.222.
		await waitFor(async () => expect((await sevenDayCard()).value).toBe('-0.222'));
	});

	it('shows "—" with "not enough history" when the helper has no week-old reading', async () => {
		const recent = oct15.history.slice(0, 10);
		serve({ current: CURRENT, history: recent });
		render(GasPricesPanel);
		await waitFor(async () =>
			expect(await sevenDayCard()).toEqual({ value: '—', detail: 'Not enough history' })
		);
	});
});
