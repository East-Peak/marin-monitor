/**
 * The camera viewer is up (CAMVIEW1): the wall's tiles and the map's preview pause their
 * refreshes under it, so the same camera is never fetched twice over.
 */
import { writable } from 'svelte/store';

export const camViewerOpen = writable(false);
