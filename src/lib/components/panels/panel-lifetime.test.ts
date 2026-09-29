import { render } from '@testing-library/svelte';
import { tick, type Component } from 'svelte';
import { get, type Writable } from 'svelte/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
	const data = new Map<string, string>();
	Object.defineProperty(globalThis, 'localStorage', {
		configurable: true,
		writable: true,
		value: {
			getItem: (k: string) => data.get(k) ?? null,
			setItem: (k: string, v: string) => void data.set(k, String(v)),
			removeItem: (k: string) => void data.delete(k),
			clear: () => data.clear()
		}
	});
});
vi.mock('$app/environment', () => ({ browser: true, dev: true, building: false, version: 'test' }));

import WineIndexPanel from './WineIndexPanel.svelte';
import SchoolTuitionPanel from './SchoolTuitionPanel.svelte';
import FitnessPanel from './FitnessPanel.svelte';
import CappuccinoPanel from './CappuccinoPanel.svelte';
import GroceryBasketPanel from './GroceryBasketPanel.svelte';
import DrivewayPanel from './DrivewayPanel.svelte';
import CompositePanel from './CompositePanel.svelte';
import GasPricesPanel from './GasPricesPanel.svelte';
import EvChargingPanel from './EvChargingPanel.svelte';
import { wineIndexStore } from '$lib/stores/wine-index';
import { schoolTuitionStore } from '$lib/stores/school-tuition';
import { fitnessStore } from '$lib/stores/fitness';
import { coffeeIndexStore } from '$lib/stores/coffee';
import { groceryBasketStore } from '$lib/stores/grocery-basket';
import { drivewayStore } from '$lib/stores/driveway';
import { compositeStore } from '$lib/stores/composite';
import { gasPriceStore } from '$lib/stores/gas-prices';
import { evChargingStore } from '$lib/stores/ev-charging';

const PANELS: [string, Component, Writable<unknown>][] = [
	['WineIndexPanel', WineIndexPanel, wineIndexStore as Writable<unknown>],
	['SchoolTuitionPanel', SchoolTuitionPanel, schoolTuitionStore as Writable<unknown>],
	['FitnessPanel', FitnessPanel, fitnessStore as Writable<unknown>],
	['CappuccinoPanel', CappuccinoPanel, coffeeIndexStore as Writable<unknown>],
	['GroceryBasketPanel', GroceryBasketPanel, groceryBasketStore as Writable<unknown>],
	['DrivewayPanel', DrivewayPanel, drivewayStore as Writable<unknown>],
	['CompositePanel', CompositePanel, compositeStore as Writable<unknown>],
	['GasPricesPanel', GasPricesPanel, gasPriceStore as Writable<unknown>],
	['EvChargingPanel', EvChargingPanel, evChargingStore as Writable<unknown>]
];

/** Every request stays pending until the test releases it, as a slow network would. */
let pending: { signal?: AbortSignal | null; resolve: (r: Response) => void }[] = [];

beforeEach(() => {
	pending = [];
	vi.stubGlobal(
		'fetch',
		vi.fn(
			(_url: RequestInfo | URL, init?: RequestInit) =>
				new Promise<Response>((resolve) => pending.push({ signal: init?.signal, resolve }))
		)
	);
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('legacy panels own their mount-time work (dashboard spec §13.6; Codex PR1 C2)', () => {
	for (const [name, Panel, store] of PANELS) {
		it(`${name}: a response that lands after unmount never writes the shared store`, async () => {
			const before = get(store);
			const { unmount } = render(Panel);
			await tick();
			expect(pending.length, 'the panel fetched on mount').toBeGreaterThan(0);

			unmount();
			for (const request of pending) {
				request.resolve(
					new Response(JSON.stringify({ lateMarker: true }), {
						status: 200,
						headers: { 'Content-Type': 'application/json' }
					})
				);
			}
			await new Promise((r) => setTimeout(r, 0));
			await tick();

			expect(get(store)).toBe(before);
			expect(pending.every((r) => r.signal?.aborted)).toBe(true);
		});
	}
});
