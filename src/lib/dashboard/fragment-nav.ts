/**
 * Stable fragment links and the jump-navs (spec §8). A section target is
 * opened first, then focused, so keyboard and screen-reader users land inside
 * visible content; `#news`, `#cost`, `#strava` … are shareable landings.
 */
import { tick } from 'svelte';
import { sectionFromHash, type SectionId } from './section-prefs';

type NavWidth = 'phone' | 'wide';
interface NavTarget {
	hash: string;
	label: string;
	/** Where it is listed: the phone's four-slot bottom bar, the jump row from tablet up (HARMONIZE1). */
	on: readonly NavWidth[];
}

/** Every jump target in page order: one list, so the two navs can't drift apart. */
export const NAV_TARGETS: readonly NavTarget[] = [
	{ hash: '#top', label: 'Top', on: ['phone'] },
	{ hash: '#map', label: 'Map', on: ['phone', 'wide'] },
	{ hash: '#getting-around', label: 'Getting around', on: ['wide'] },
	{ hash: '#outdoors', label: 'Outdoors', on: ['wide'] },
	{ hash: '#news', label: 'News', on: ['phone', 'wide'] },
	{ hash: '#cost', label: 'Cost', on: ['wide'] },
	{ hash: '#events', label: 'Events', on: ['wide'] },
	{ hash: '#sections', label: 'Sections', on: ['phone'] }
];
const listedOn = (width: NavWidth) => NAV_TARGETS.filter((t) => t.on.includes(width));

/** The phone's fixed bottom bar: Top · Map · News · Sections. */
export const JUMP_TARGETS = listedOn('phone');
/** Tablet and desktop (MAPX1, HARMONIZE1): a slim row under the header, one link per region. */
export const DESKTOP_JUMP_TARGETS = listedOn('wide');

export async function openAndFocus(
	hash: string,
	openSection: (id: SectionId) => void,
	doc: Document = document
): Promise<boolean> {
	const section = sectionFromHash(hash);
	if (section) {
		openSection(section);
		await tick();
		const toggle = doc.querySelector<HTMLElement>(`[data-section-toggle="${section}"]`);
		if (!toggle) return false;
		toggle.scrollIntoView?.({ block: 'start' });
		toggle.focus();
		return true;
	}
	const id = hash.replace(/^#/, '');
	const target = id ? doc.getElementById(id) : null;
	if (!target) return false;
	target.scrollIntoView?.({ block: 'start' });
	target.focus();
	return true;
}
