/**
 * Which v2 sections are open (spec §5, §8, §13.5).
 * Precedence: hash target > explicit saved choice > viewport default.
 * Hash and nav opens are transient (never saved); only toggle() saves.
 * Nothing is open until resolve() runs on the client, so SSR and the first
 * client render agree.
 */
import { derived, get, writable, type Readable } from 'svelte/store';
import {
	SECTION_IDS,
	resolveSectionOpen,
	sectionFromHash,
	type SectionId,
	type SectionPrefs
} from './section-prefs';

export type SectionOpenMap = Record<SectionId, boolean>;

interface PrefsStore extends Readable<SectionPrefs> {
	setOpen(id: SectionId, open: boolean): void;
}

interface Context {
	resolved: boolean;
	viewportWidth: number;
	transient: Partial<Record<SectionId, true>>;
}

export function createSectionOpenState(prefs: PrefsStore) {
	const ctx = writable<Context>({ resolved: false, viewportWidth: 0, transient: {} });
	const open = derived([prefs, ctx], ([$prefs, $ctx]) => {
		const map = {} as SectionOpenMap;
		for (const id of SECTION_IDS) {
			map[id] =
				$ctx.resolved &&
				($ctx.transient[id] === true ||
					resolveSectionOpen(id, {
						hashTarget: null,
						prefs: $prefs,
						viewportWidth: $ctx.viewportWidth
					}));
		}
		return map;
	});

	return {
		open,
		resolve(hash: string, viewportWidth: number) {
			const target = sectionFromHash(hash);
			ctx.set({ resolved: true, viewportWidth, transient: target ? { [target]: true } : {} });
		},
		openTransient(id: SectionId) {
			ctx.update((c) => ({ ...c, transient: { ...c.transient, [id]: true } }));
		},
		/**
		 * "Reset sections": transient opens end too, and the defaults are those of the
		 * viewport now (the page may have been resized since load), so they really return.
		 */
		clearTransient(viewportWidth?: number) {
			ctx.update((c) => ({ ...c, transient: {}, viewportWidth: viewportWidth ?? c.viewportWidth }));
		},
		toggle(id: SectionId) {
			const next = !get(open)[id];
			ctx.update((c) => {
				const transient = { ...c.transient };
				delete transient[id];
				return { ...c, transient };
			});
			prefs.setOpen(id, next);
		}
	};
}
