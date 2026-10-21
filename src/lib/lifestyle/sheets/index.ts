/** The households at launch, one per town; each is checked and frozen on load. */
import type { HouseholdSheet } from '../model';
import { defineSheet } from '../price';
import { larkspur } from './larkspur';

export const SHEETS: readonly HouseholdSheet[] = Object.freeze([larkspur].map(defineSheet));
