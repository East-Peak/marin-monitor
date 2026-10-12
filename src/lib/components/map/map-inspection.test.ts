import { describe, expect, it } from 'vitest';
import { inspectorModel, pinClickOutcome, townClickOutcome } from './map-inspection';

describe('map click outcomes', () => {
	it('inspecting a pin opens the pin inspector and never selects a town (spec §2.4)', () => {
		const outcome = pinClickOutcome({ id: 'n1', townSlug: 'mill-valley' });
		expect(outcome.inspector).toEqual({ mode: 'pin', itemId: 'n1', townSlug: 'mill-valley' });
		expect(outcome).not.toHaveProperty('selectTown');
	});
	it('an unlocated pin opens with no town', () => {
		expect(pinClickOutcome({ id: 'n2' }).inspector).toEqual({
			mode: 'pin',
			itemId: 'n2',
			townSlug: null
		});
	});
	it('clicking a town is an explicit choice: it selects that town', () => {
		expect(townClickOutcome(null, 'novato')).toEqual({
			inspector: { mode: 'town', townSlug: 'novato' },
			selectTown: 'novato'
		});
	});
	it('clicking the selected town again deselects it', () => {
		expect(townClickOutcome('novato', 'novato')).toEqual({ inspector: null, selectTown: null });
	});
});

describe('inspectorModel (MapPanel’s derivation, shared with the v2 map)', () => {
	const item = (id: string, townSlug?: string, pinned = false) =>
		({
			id,
			title: id,
			link: '',
			timestamp: 0,
			source: 's',
			category: 'local',
			verification: 'local_media',
			...(townSlug ? { townSlug } : {}),
			...(pinned ? { lat: 37.9, lon: -122.5 } : {})
		}) as const;
	const name = (slug: string) => (slug === 'mill-valley' ? 'Mill Valley' : slug);

	it('no state → no model; a pin that is no longer visible → no model', () => {
		expect(inspectorModel(null, [], name)).toBeNull();
		expect(inspectorModel({ mode: 'pin', itemId: 'gone', townSlug: null }, [], name)).toBeNull();
	});

	it('town mode: that town’s items, pinned vs town-only counts', () => {
		const items = [item('a', 'mill-valley', true), item('b', 'mill-valley'), item('c', 'novato')];
		expect(inspectorModel({ mode: 'town', townSlug: 'mill-valley' }, items, name)).toMatchObject({
			mode: 'town',
			townName: 'Mill Valley',
			selectedItemId: null,
			pinnedCount: 1,
			townOnlyCount: 1
		});
	});

	it('pin mode: the selected item first, then its town’s other items', () => {
		const items = [item('a', 'mill-valley', true), item('b', 'mill-valley'), item('c', 'novato')];
		const model = inspectorModel(
			{ mode: 'pin', itemId: 'a', townSlug: 'mill-valley' },
			items,
			name
		);
		expect(model?.items.map((i) => i.id)).toEqual(['a', 'b']);
		expect(model).toMatchObject({ mode: 'pin', selectedItemId: 'a', townName: 'Mill Valley' });
	});
});
