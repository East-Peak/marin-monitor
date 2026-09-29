import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';

vi.mock('$app/environment', () => ({ browser: true }));

const storage = (() => {
	let data: Record<string, string> = {};
	let denied = false;
	const guard = () => {
		if (denied) throw new DOMException('denied', 'SecurityError');
	};
	return {
		getItem: vi.fn((k: string) => {
			guard();
			return k in data ? data[k] : null;
		}),
		setItem: vi.fn((k: string, v: string) => {
			guard();
			data[k] = String(v);
		}),
		removeItem: vi.fn((k: string) => {
			guard();
			delete data[k];
		}),
		clear: () => {
			data = {};
		},
		deny: (on: boolean) => {
			denied = on;
		},
		snapshot: () => ({ ...data })
	};
})();
Object.defineProperty(globalThis, 'localStorage', {
	value: storage,
	configurable: true,
	writable: true
});

const V1 = {
	mm_panels: JSON.stringify({ outdoors: false, cameras: false, housing: false }),
	mm_panelOrder: JSON.stringify(['map', 'housing']),
	mm_uiScale: '120',
	mm_theme: JSON.stringify('dark'),
	mm_location: 'novato',
	mm_camerasHidden: 'true',
	mm_town: 'mill-valley'
};
const seedV1 = () => Object.entries(V1).forEach(([k, v]) => storage.setItem(k, v));
const v1Only = (snap: Record<string, string>) =>
	Object.fromEntries(Object.entries(snap).filter(([k]) => k !== 'mm_sections_v2'));

beforeEach(() => {
	storage.clear();
	storage.deny(false);
	vi.resetModules();
});

describe('sectionPrefs store', () => {
	it('starts empty when nothing is stored, and when the stored value is malformed', async () => {
		let { sectionPrefs } = await import('./section-prefs');
		expect(get(sectionPrefs)).toEqual({ version: 2, open: {} });
		storage.setItem('mm_sections_v2', '{oops');
		vi.resetModules();
		({ sectionPrefs } = await import('./section-prefs'));
		expect(get(sectionPrefs)).toEqual({ version: 2, open: {} });
	});

	it('reads valid stored prefs', async () => {
		storage.setItem('mm_sections_v2', '{"version":2,"open":{"news":false}}');
		const { sectionPrefs } = await import('./section-prefs');
		expect(get(sectionPrefs).open).toEqual({ news: false });
	});

	it('writes only the v2 key; every v1 key stays byte-identical', async () => {
		seedV1();
		const before = storage.snapshot();
		const { sectionPrefs } = await import('./section-prefs');
		sectionPrefs.setOpen('news', false);
		sectionPrefs.setOpen('strava', true);
		const after = storage.snapshot();
		expect(v1Only(after)).toEqual(before);
		expect(after.mm_sections_v2).toBe('{"version":2,"open":{"news":false,"strava":true}}');
	});

	it('is idempotent: repeating a choice leaves identical storage', async () => {
		const { sectionPrefs } = await import('./section-prefs');
		sectionPrefs.setOpen('cost', false);
		const once = storage.snapshot().mm_sections_v2;
		sectionPrefs.setOpen('cost', false);
		expect(storage.snapshot().mm_sections_v2).toBe(once);
	});

	it('"reset" forgets section choices only', async () => {
		seedV1();
		const { sectionPrefs } = await import('./section-prefs');
		sectionPrefs.setOpen('news', false);
		sectionPrefs.reset();
		expect(get(sectionPrefs)).toEqual({ version: 2, open: {} });
		expect(storage.snapshot()).toEqual(V1);
	});

	it('works in memory and never throws when storage is denied', async () => {
		storage.deny(true);
		const { sectionPrefs } = await import('./section-prefs');
		expect(get(sectionPrefs)).toEqual({ version: 2, open: {} });
		expect(() => sectionPrefs.setOpen('news', false)).not.toThrow();
		expect(get(sectionPrefs).open).toEqual({ news: false });
		expect(() => sectionPrefs.reset()).not.toThrow();
	});

	it('v1 → v2 → v1: v1 prefs survive a v2 session; old disabled panels and hidden cameras do not hide v2 sections', async () => {
		seedV1();
		const [{ sectionPrefs }, { resolveSectionOpen }] = await Promise.all([
			import('./section-prefs'),
			import('$lib/dashboard/section-prefs')
		]);
		const ctx = { hashTarget: null, prefs: get(sectionPrefs), viewportWidth: 1440 };
		expect(resolveSectionOpen('outdoors', ctx)).toBe(true);
		expect(resolveSectionOpen('getting-around', ctx)).toBe(true);
		sectionPrefs.setOpen('news', false);

		vi.resetModules();
		const { settings } = await import('./settings');
		const v1 = get(settings);
		expect(v1.enabled['outdoors']).toBe(false);
		expect(v1.enabled['cameras']).toBe(false);
		expect(v1.uiScale).toBe(120);
		expect(v1.locationId).toBe('novato');
		expect(v1.camerasHidden).toBe(true);
		expect(v1Only(storage.snapshot())).toEqual(V1);
	});
});
