/**
 * Fitness drop-in index store -- shared between FitnessPanel and MapDataLayer
 */

import { writable, derived } from 'svelte/store';
import type { FitnessData } from '$lib/types/fitness';

export const fitnessStore = writable<FitnessData>({ current: null, history: [] });

export const currentFitnessStudios = derived(fitnessStore, ($d) => $d.current?.studios ?? []);
