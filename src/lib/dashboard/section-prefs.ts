/**
 * Dashboard v2 section open/closed preferences (spec §5, §13.5).
 *
 * Stored under their own versioned key. The v1 keys (mm_panels, mm_panelOrder, …)
 * are never read or written here, so v1 stays intact for preview and rollback and
 * old "disabled" panels cannot strand v2 content. Only explicit user choices are
 * stored. Hash targets and outage-driven collapses are never persisted.
 */

export const SECTION_IDS = [
	'getting-around',
	'outdoors',
	'news',
	'cost',
	'events',
	'strava'
] as const;
export type SectionId = (typeof SECTION_IDS)[number];

export const SECTION_PREFS_KEY = 'mm_sections_v2';
/** Phone is anything narrower than 768 CSS px. */
export const PHONE_MAX_WIDTH = 767;

export interface SectionPrefs {
	version: 2;
	/** Explicit user choices only. A missing id means "no choice made". */
	open: Partial<Record<SectionId, boolean>>;
}

export interface SectionOpenContext {
	hashTarget: SectionId | null;
	prefs: SectionPrefs;
	viewportWidth: number;
}

const KNOWN_IDS = new Set<string>(SECTION_IDS);

export function isSectionId(value: string): value is SectionId {
	return KNOWN_IDS.has(value);
}

export function emptySectionPrefs(): SectionPrefs {
	return { version: 2, open: {} };
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function knownChoices(open: Record<string, unknown>): Partial<Record<SectionId, boolean>> {
	const choices: Partial<Record<SectionId, boolean>> = {};
	for (const id of SECTION_IDS) {
		const choice = open[id];
		if (typeof choice === 'boolean') choices[id] = choice;
	}
	return choices;
}

/** Parse stored prefs. Never throws; anything invalid is dropped entry by entry. */
export function parseSectionPrefs(raw: string | null): SectionPrefs {
	if (raw === null) return emptySectionPrefs();
	let value: unknown;
	try {
		value = JSON.parse(raw);
	} catch {
		return emptySectionPrefs();
	}
	if (!isRecord(value) || value.version !== 2 || !isRecord(value.open)) return emptySectionPrefs();
	return { version: 2, open: knownChoices(value.open) };
}

/** Stable serialization (SECTION_IDS order), so parse∘serialize is idempotent. */
export function serializeSectionPrefs(prefs: SectionPrefs): string {
	return JSON.stringify({ version: 2, open: knownChoices(prefs.open) });
}

export function withSectionOpen(prefs: SectionPrefs, id: SectionId, open: boolean): SectionPrefs {
	return { version: 2, open: { ...prefs.open, [id]: open } };
}

export function isPhoneViewport(width: number): boolean {
	return width <= PHONE_MAX_WIDTH;
}

/** Phone: everything closed. Desktop: everything open except Strava (spec §2.7, §13.10). */
export function defaultSectionOpen(id: SectionId, viewportWidth: number): boolean {
	if (isPhoneViewport(viewportWidth)) return false;
	return id !== 'strava';
}

/** Stable fragment links (#news, #cost, #strava, …) name sections (spec §8). */
export function sectionFromHash(hash: string): SectionId | null {
	const id = hash.startsWith('#') ? hash.slice(1) : hash;
	return isSectionId(id) ? id : null;
}

/** Precedence (spec §13.5): hash target > explicit saved choice > viewport default. */
export function resolveSectionOpen(id: SectionId, ctx: SectionOpenContext): boolean {
	if (ctx.hashTarget === id) return true;
	const saved = ctx.prefs.open[id];
	if (saved !== undefined) return saved;
	return defaultSectionOpen(id, ctx.viewportWidth);
}
