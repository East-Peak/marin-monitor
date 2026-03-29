/**
 * School tuition index store -- shared state for SchoolTuitionPanel
 */

import { writable, derived } from 'svelte/store';
import type { SchoolIndexData } from '$lib/types/school';

export const schoolTuitionStore = writable<SchoolIndexData>({ current: null, history: [] });

export const currentSchoolTiers = derived(
	schoolTuitionStore,
	($d) => $d.current?.tiers ?? []
);

export const currentSchools = derived(
	schoolTuitionStore,
	($d) => $d.current?.schools ?? []
);
