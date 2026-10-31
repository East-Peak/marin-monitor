// src/lib/components/tv/camera-read.ts
/**
 * One TV camera read, for the tile and the slide preloader alike. Caltrans serves a stand-in card
 * at a down camera's own URL, so its frames load in CORS mode, which lets the detector read their
 * pixels. The element goes straight to the tile, so there is no object URL to outlive a remount.
 */
import { isCaltransPlaceholder } from '$lib/dashboard/cam-placeholder';
import { preloadImage } from './image-preload';

/** The host that serves stand-in cards, and answers CORS. */
const CARD_HOST = 'cwwp2.dot.ca.gov';
export const servesCards = (url: string) => new URL(url).hostname === CARD_HOST;

export type CameraPreload = (url: string, cors: boolean) => Promise<HTMLImageElement | null>;
export type CameraRead =
	| { kind: 'frame'; img: HTMLImageElement }
	| { kind: 'placeholder' }
	| { kind: 'failed' };

export const preloadCameraImage: CameraPreload = (url, cors) =>
	preloadImage(url, undefined, undefined, cors);

const asRead = (img: HTMLImageElement | null): CameraRead =>
	img ? { kind: 'frame', img } : { kind: 'failed' };

export async function readCameraFrame(
	url: string,
	preload: CameraPreload = preloadCameraImage,
	isPlaceholder: (img: HTMLImageElement) => boolean = isCaltransPlaceholder
): Promise<CameraRead> {
	if (!servesCards(url)) return asRead(await preload(url, false));
	const img = await preload(url, true);
	// CORS withdrawn: still show the frame, with no pixels to make a claim from.
	if (!img) return asRead(await preload(url, false));
	return isPlaceholder(img) ? { kind: 'placeholder' } : { kind: 'frame', img };
}
