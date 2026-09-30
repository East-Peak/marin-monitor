/**
 * Stable fragment links and the phone jump-nav (spec §8). A section target is
 * opened first, then focused, so keyboard and screen-reader users land inside
 * visible content; `#news`, `#cost`, `#strava` … are shareable landings.
 */
import { tick } from 'svelte';
import { sectionFromHash, type SectionId } from './section-prefs';

export const JUMP_TARGETS = [
	{ hash: '#top', label: 'Top' },
	{ hash: '#map', label: 'Map' },
	{ hash: '#news', label: 'News' },
	{ hash: '#sections', label: 'Sections' }
] as const;

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
