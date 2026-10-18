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

/** The map's layer switches (MAPX2b, MAPX2c): the data layers, road speeds, the story chips. */
export const LAYER_PREF_IDS = [
	'traffic',
	'fire',
	'gas',
	'ev',
	'coffee',
	'fitness',
	'airport',
	'cams',
	'shows',
	'blotter',
	'roads',
	'news',
	'safety',
	'civic',
	'activity',
	'housing',
	'311',
	'satire'
] as const;
export type LayerPrefId = (typeof LAYER_PREF_IDS)[number];

export const SECTION_PREFS_KEY = 'mm_sections_v2';
/** Phone is anything narrower than 768 CSS px. */
export const PHONE_MAX_WIDTH = 767;
/** Desktop starts at 1024 CSS px: sections are always open there (between: tablet). */
export const DESKTOP_MIN_WIDTH = 1024;

export interface SectionPrefs {
	/** 3 since MAPX2b (map layers); a stored 2 migrates with no layer choices. */
	version: 3;
	/** Explicit user choices only. A missing id means "no choice made". */
	open: Partial<Record<SectionId, boolean>>;
	/** The map's layer switches, explicit choices only. */
	layers: Partial<Record<LayerPrefId, boolean>>;
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
	return { version: 3, open: {}, layers: {} };
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function known<K extends string>(
	ids: readonly K[],
	values: Record<string, unknown>
): Partial<Record<K, boolean>> {
	const choices: Partial<Record<K, boolean>> = {};
	for (const id of ids) {
		const choice = values[id];
		if (typeof choice === 'boolean') choices[id] = choice;
	}
	return choices;
}
const knownChoices = (open: Record<string, unknown>) => known(SECTION_IDS, open);
const knownLayers = (layers: unknown) => (isRecord(layers) ? known(LAYER_PREF_IDS, layers) : {});

/** Parse stored prefs. Never throws; anything invalid is dropped entry by entry. */
export function parseSectionPrefs(raw: string | null): SectionPrefs {
	if (raw === null) return emptySectionPrefs();
	let value: unknown;
	try {
		value = JSON.parse(raw);
	} catch {
		return emptySectionPrefs();
	}
	if (!isRecord(value) || (value.version !== 2 && value.version !== 3) || !isRecord(value.open))
		return emptySectionPrefs();
	return {
		version: 3,
		open: knownChoices(value.open),
		layers: value.version === 3 ? knownLayers(value.layers) : {}
	};
}

/** Stable serialization (SECTION_IDS, LAYER_PREF_IDS order), so parse∘serialize is idempotent. */
export function serializeSectionPrefs(prefs: SectionPrefs): string {
	return JSON.stringify({
		version: 3,
		open: knownChoices(prefs.open),
		layers: knownLayers(prefs.layers)
	});
}

export function withSectionOpen(prefs: SectionPrefs, id: SectionId, open: boolean): SectionPrefs {
	return { ...prefs, open: { ...prefs.open, [id]: open } };
}

export function withLayerOn(prefs: SectionPrefs, id: LayerPrefId, on: boolean): SectionPrefs {
	return { ...prefs, layers: { ...prefs.layers, [id]: on } };
}

export function isPhoneViewport(width: number): boolean {
	return width <= PHONE_MAX_WIDTH;
}

export function isDesktopViewport(width: number): boolean {
	return width >= DESKTOP_MIN_WIDTH;
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

/**
 * Desktop: every section but Strava is open, whatever was saved (sections don't collapse there).
 * Phone and tablet (spec §13.5): hash target > explicit saved choice > viewport default.
 */
export function resolveSectionOpen(id: SectionId, ctx: SectionOpenContext): boolean {
	if (id !== 'strava' && isDesktopViewport(ctx.viewportWidth)) return true;
	if (ctx.hashTarget === id) return true;
	const saved = ctx.prefs.open[id];
	if (saved !== undefined) return saved;
	return defaultSectionOpen(id, ctx.viewportWidth);
}
