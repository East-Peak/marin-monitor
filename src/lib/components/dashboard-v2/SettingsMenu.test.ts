import { fireEvent, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import { get } from 'svelte/store';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const data = vi.hoisted(() => {
	const map = new Map<string, string>();
	Object.defineProperty(globalThis, 'localStorage', {
		configurable: true,
		writable: true,
		value: {
			getItem: (k: string) => map.get(k) ?? null,
			setItem: (k: string, v: string) => void map.set(k, String(v)),
			removeItem: (k: string) => void map.delete(k),
			clear: () => map.clear()
		}
	});
	return map;
});
vi.mock('$app/environment', () => ({ browser: true, dev: true, building: false, version: 'test' }));

import SettingsMenu from './SettingsMenu.svelte';
import { settings } from '$lib/stores/settings';
import { sectionPrefs } from '$lib/stores/section-prefs';

async function openMenu() {
	render(SettingsMenu);
	const trigger = screen.getByRole('button', { name: 'Dashboard settings' });
	expect(trigger.getAttribute('aria-expanded')).toBe('false');
	await fireEvent.click(trigger);
	await tick();
	expect(trigger.getAttribute('aria-expanded')).toBe('true');
	return trigger;
}

beforeEach(() => {
	settings.reset();
	sectionPrefs.reset();
	data.clear();
});

describe('v2 ⚙ settings menu', () => {
	it('opens from a labelled button, focuses the first control, closes on Escape and returns focus', async () => {
		const trigger = await openMenu();
		expect(document.activeElement).toBe(screen.getByLabelText('UI scale'));
		await fireEvent.keyDown(window, { key: 'Escape' });
		await tick();
		expect(trigger.getAttribute('aria-expanded')).toBe('false');
		expect(document.activeElement).toBe(trigger);
	});

	it('UI scale, default location and theme are reachable and write the shared v1 keys', async () => {
		await openMenu();
		await fireEvent.change(screen.getByLabelText('UI scale'), { target: { value: '120' } });
		expect(get(settings).uiScale).toBe(120);
		expect(data.get('mm_uiScale')).toBe('120');

		await fireEvent.change(screen.getByLabelText('Default location'), {
			target: { value: 'novato' }
		});
		expect(get(settings).locationId).toBe('novato');
		expect(data.get('mm_location')).toBe('novato');

		await fireEvent.click(screen.getByLabelText('Light'));
		expect(get(settings).theme).toBe('light');
	});

	it('shows a saved non-standard scale (e.g. 115 from the old slider) as the selected option', async () => {
		settings.setUiScale(115);
		await openMenu();
		expect((screen.getByLabelText('UI scale') as HTMLSelectElement).value).toBe('115');
	});

	it('hidden cameras are recoverable from the menu (never stranded)', async () => {
		settings.toggleCamerasHidden();
		expect(get(settings).camerasHidden).toBe(true);
		await openMenu();
		const box = screen.getByLabelText('Show traffic cameras') as HTMLInputElement;
		expect(box.checked).toBe(false);
		await fireEvent.click(box);
		expect(get(settings).camerasHidden).toBe(false);
	});

	it('"Reset sections" resets section choices only', async () => {
		sectionPrefs.setOpen('news', false);
		settings.setUiScale(120);
		data.set('mm_town', 'mill-valley');
		data.set('mm_panels', '{"outdoors":false}');
		await openMenu();
		await fireEvent.click(screen.getByRole('button', { name: 'Reset sections' }));
		await tick();
		expect(get(sectionPrefs).open).toEqual({});
		expect(data.has('mm_sections_v2')).toBe(false);
		expect(data.get('mm_uiScale')).toBe('120');
		expect(data.get('mm_town')).toBe('mill-valley');
		expect(data.get('mm_panels')).toBe('{"outdoors":false}');
		expect(screen.getByRole('status').textContent).toBe('Sections reset to defaults.');
	});

	it('Reset sections tells the page, so transient opens end too', async () => {
		const onreset = vi.fn();
		render(SettingsMenu, { props: { onreset } });
		await fireEvent.click(screen.getByRole('button', { name: 'Dashboard settings' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Reset sections' }));
		expect(onreset).toHaveBeenCalledTimes(1);
	});
});
