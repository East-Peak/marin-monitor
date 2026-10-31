/**
 * The legacy panels draw a plain <img>, refreshed by a new src. This marks one showing Caltrans'
 * stand-in card with `data-stand-in`, and each panel hides it and says so in CSS.
 */
import type { Action } from 'svelte/action';
import { isCaltransPlaceholder } from '$lib/dashboard/cam-placeholder';
import { servesCards } from '$lib/components/tv/camera-read';

/** CORS mode only where the detector can read the pixels; other hosts don't all answer it. */
export const cameraCrossOrigin = (url: string) => (servesCards(url) ? 'anonymous' : undefined);

export const flagStandIn: Action<HTMLImageElement> = (img) => {
	const check = () => img.toggleAttribute('data-stand-in', isCaltransPlaceholder(img));
	img.addEventListener('load', check);
	if (img.complete) check();
	return { destroy: () => img.removeEventListener('load', check) };
};
