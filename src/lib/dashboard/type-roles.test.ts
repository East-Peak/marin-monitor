import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
	MIN_CARD_PADDING_PX,
	MIN_LINE_HEIGHT,
	MIN_TEXT_PX,
	TEXT_ROLES,
	roleFontPx,
	type TextRole
} from './type-roles';

// Read from disk: Vitest's CSS pipeline turns a `?raw` CSS import into an empty string.
// Vitest runs from the repo root.
const tokensCss = readFileSync('src/lib/components/dashboard-v2/v2-tokens.css', 'utf8');
const roles = Object.keys(TEXT_ROLES) as TextRole[];
const token = (css: string, role: string) =>
	Number(new RegExp(`--v2-fs-${role}:\\s*(\\d+)px`).exec(css)?.[1]);
const [desktopBlock, phoneBlock = ''] = tokensCss.split('@media (max-width: 767px)');

describe('type tokens (spec §6)', () => {
	it('meet the spec: body 15/16, meta and labels ≥ 12, brief values 20, section titles 17', () => {
		expect(TEXT_ROLES.body).toEqual({ desktop: 15, phone: 16 });
		expect(TEXT_ROLES.value.desktop).toBe(20);
		expect(TEXT_ROLES['section-title'].desktop).toBe(17);
		for (const role of roles) {
			expect(TEXT_ROLES[role].desktop).toBeGreaterThanOrEqual(MIN_TEXT_PX);
			expect(TEXT_ROLES[role].phone).toBeGreaterThanOrEqual(MIN_TEXT_PX);
		}
		expect(MIN_LINE_HEIGHT).toBeGreaterThanOrEqual(1.4);
		expect(MIN_CARD_PADDING_PX).toBeGreaterThanOrEqual(10);
	});
	it('the CSS tokens equal the inventory, desktop and phone', () => {
		for (const role of roles) {
			expect(token(desktopBlock, role), `desktop ${role}`).toBe(TEXT_ROLES[role].desktop);
			const phone = token(phoneBlock, role);
			expect(Number.isNaN(phone) ? TEXT_ROLES[role].desktop : phone, `phone ${role}`).toBe(
				TEXT_ROLES[role].phone
			);
			expect(tokensCss).toContain(`[data-text-role='${role}']`);
		}
		expect(Number(/--v2-line-height:\s*([\d.]+)/.exec(tokensCss)?.[1])).toBeGreaterThanOrEqual(
			MIN_LINE_HEIGHT
		);
		expect(Number(/--v2-card-padding:\s*(\d+)px/.exec(tokensCss)?.[1])).toBeGreaterThanOrEqual(
			MIN_CARD_PADDING_PX
		);
	});
	it('picks the phone size below 768 CSS px', () => {
		expect(roleFontPx('body', 1440)).toBe(15);
		expect(roleFontPx('body', 767)).toBe(16);
		expect(roleFontPx('body', 768)).toBe(15);
	});
});
