import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { safeGetItem, safeSetItem, safeRemoveItem } from './safe-storage';

function stubStorage(impl: Partial<Storage>) {
	vi.stubGlobal('localStorage', impl);
}

describe('safe-storage', () => {
	let store: Record<string, string>;

	beforeEach(() => {
		store = {};
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	describe('with working storage', () => {
		beforeEach(() => {
			stubStorage({
				getItem: (k: string) => (k in store ? store[k] : null),
				setItem: (k: string, v: string) => {
					store[k] = v;
				},
				removeItem: (k: string) => {
					delete store[k];
				}
			});
		});

		it('round-trips a value', () => {
			expect(safeSetItem('k', 'v')).toBe(true);
			expect(safeGetItem('k')).toBe('v');
		});

		it('returns null for a missing key', () => {
			expect(safeGetItem('missing')).toBeNull();
		});

		it('removes a value and reports success', () => {
			safeSetItem('k', 'v');
			expect(safeRemoveItem('k')).toBe(true);
			expect(safeGetItem('k')).toBeNull();
		});
	});

	describe('with storage denied', () => {
		const denied = () => {
			throw new DOMException('denied', 'SecurityError');
		};

		beforeEach(() => {
			stubStorage({ getItem: denied, setItem: denied, removeItem: denied });
		});

		it('get returns null', () => {
			expect(safeGetItem('k')).toBeNull();
		});

		it('set returns false', () => {
			expect(safeSetItem('k', 'v')).toBe(false);
		});

		it('remove returns false', () => {
			expect(safeRemoveItem('k')).toBe(false);
		});
	});

	it('set returns false on QuotaExceededError', () => {
		stubStorage({
			setItem: () => {
				throw new DOMException('full', 'QuotaExceededError');
			}
		});
		expect(safeSetItem('k', 'v')).toBe(false);
	});

	it('is inert when localStorage does not exist (SSR)', () => {
		vi.stubGlobal('localStorage', undefined);
		expect(safeGetItem('k')).toBeNull();
		expect(safeSetItem('k', 'v')).toBe(false);
		expect(safeRemoveItem('k')).toBe(false);
	});

	it('get returns null when the accessor itself throws', () => {
		vi.stubGlobal('localStorage', undefined);
		Object.defineProperty(globalThis, 'localStorage', {
			configurable: true,
			get() {
				throw new DOMException('blocked', 'SecurityError');
			}
		});
		expect(safeGetItem('k')).toBeNull();
		expect(safeSetItem('k', 'v')).toBe(false);
	});
});
