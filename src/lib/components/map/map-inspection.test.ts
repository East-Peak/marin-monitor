import { describe, expect, it } from 'vitest';
import { pinClickOutcome, townClickOutcome } from './map-inspection';

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
