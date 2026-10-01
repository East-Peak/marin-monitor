import { STRAVA_ENABLED } from '$lib/config/strava';
import type { SectionId } from './section-prefs';

export interface V2Section {
	id: SectionId;
	title: string;
}

/** Below the map, in page order (spec §2.7). Getting Around sits directly under the map. */
const ALL_V2_SECTIONS: readonly V2Section[] = [
	{ id: 'outdoors', title: 'Outdoors & Conditions' },
	{ id: 'news', title: 'News & Civic' },
	{ id: 'cost', title: 'Cost & Character' },
	{ id: 'events', title: 'Events & Sports' },
	{ id: 'strava', title: 'Strava' }
];

/** The sections, without Strava while Strava is off. */
export function v2Sections(stravaEnabled: boolean): V2Section[] {
	return ALL_V2_SECTIONS.filter((s) => stravaEnabled || s.id !== 'strava');
}

export const V2_SECTIONS: readonly V2Section[] = v2Sections(STRAVA_ENABLED);
