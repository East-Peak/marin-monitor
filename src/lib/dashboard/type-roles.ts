/**
 * The v2 text-role inventory (spec §6, §13.4). Every visible text node in the
 * v2 layout sits under an element with `data-text-role`. The type e2e walks
 * them at 100% UI scale and checks each against these tokens. Relative
 * imports only: Playwright specs import this file directly.
 */
import { PHONE_MAX_WIDTH } from './section-prefs';

export const TEXT_ROLES = {
	body: { desktop: 15, phone: 16 },
	label: { desktop: 13, phone: 13 },
	meta: { desktop: 12, phone: 12 },
	value: { desktop: 20, phone: 20 },
	'section-title': { desktop: 17, phone: 17 },
	brand: { desktop: 17, phone: 17 }
} as const;

export type TextRole = keyof typeof TEXT_ROLES;

/** Reused controls (TownPicker, the ⚙ menu) keep their own sizes; only the floor applies. */
export const EXCEPTION_ROLES = ['control'] as const;
/** A baseline at 100% UI scale; the user's UI-scale choice may shrink it (§13.4). */
export const MIN_TEXT_PX = 12;
export const MIN_LINE_HEIGHT = 1.4;
export const MIN_CARD_PADDING_PX = 10;

export function roleFontPx(role: TextRole, viewportWidth: number): number {
	return viewportWidth <= PHONE_MAX_WIDTH ? TEXT_ROLES[role].phone : TEXT_ROLES[role].desktop;
}
