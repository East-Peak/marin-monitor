/**
 * Caltrans' stand-in cards (MAPX4b): when a camera is down, its URL serves a white card
 * ("Temporarily Unavailable", "Down for Construction", a crossed-out camera) over the usual
 * time bar. The bar's clock makes every copy's bytes differ, so a hash can't match; a coarse
 * picture of the card above the bar can. Matched against fingerprints of captured frames
 * (`__fixtures__/caltrans-*.jpg`, 2026-10-17: 275 of 760 D4 cameras were showing one). Never OCR.
 */

const COLS = 16;
const ROWS = 12;
/** The picture above Caltrans' time bar (the bottom ~12% of every frame). */
const PICTURE_SHARE = 0.88;
/**
 * Mean per-cell difference that still counts as the same card. On 2026-10-17 every placeholder
 * was within 15 of a fixture and every real frame at least 85 away.
 */
const MAX_DISTANCE = 20;
/** A card's ink (its text or icon: cells darker than this) must be there too, so a blank,
 * white-out or bright-fog frame never passes as a card (Codex MAPX4 #1). */
const INK_BELOW = 235;
const MAX_INK_DISTANCE = 15;

const hex = (s: string) =>
	Array.from({ length: s.length / 2 }, (_, i) => parseInt(s.slice(i * 2, i * 2 + 2), 16));

/** Each captured card's fingerprint (frameFingerprint of its fixture, 16×12 luminance). */
export const PLACEHOLDER_FINGERPRINTS: Readonly<Record<string, readonly number[]>> = {
	'Temporarily Unavailable': hex(
		'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe9bce7e3eaeee8e4e8cee0f4fffffffffe8c83a67d8687aa7fa98ce5fffffffff2e0fefeedfeeeeaeaeddeffffffffffdc8d88838c8e917f6d7e81e8fffffffffff0f3f0f3f4f1efeff0f2feffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
	),
	'Down for Construction': hex(
		'fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff6abe9efebe7d4deeafdfffffffffffff18799849493c39f97ffffffffffffd8effefefcf2fefeefeefefeffffffffaa987b9b8377a47f838e8d93fffffffff4f8f1f7f2eff5f0f2f6f2f4ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
	),
	'No camera': hex(
		'fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffeded6f9fffffffffffffffffffffffffead8ae3fffffffffffffffffffffffffffcf6ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
	)
};

/** Mean luminance in a 16×12 grid over the picture above the time bar. */
export function frameFingerprint(img: {
	data: Uint8ClampedArray;
	width: number;
	height: number;
}): number[] {
	const { data, width } = img;
	const height = Math.floor(img.height * PICTURE_SHARE);
	const out: number[] = [];
	for (let r = 0; r < ROWS; r++) {
		const y0 = Math.floor((r * height) / ROWS);
		const y1 = Math.floor(((r + 1) * height) / ROWS);
		for (let c = 0; c < COLS; c++) {
			const x0 = Math.floor((c * width) / COLS);
			const x1 = Math.floor(((c + 1) * width) / COLS);
			let sum = 0;
			for (let y = y0; y < y1; y++)
				for (let x = x0; x < x1; x++) {
					const i = (y * width + x) * 4;
					sum += (299 * data[i] + 587 * data[i + 1] + 114 * data[i + 2]) / 1000;
				}
			out.push(Math.round(sum / Math.max(1, (y1 - y0) * (x1 - x0))));
		}
	}
	return out;
}

export function isPlaceholderFingerprint(fp: readonly number[]): boolean {
	if (fp.length !== COLS * ROWS) return false;
	const mean = (cells: number[], card: readonly number[]) =>
		cells.reduce((d, i) => d + Math.abs(fp[i] - card[i]), 0) / cells.length;
	return Object.values(PLACEHOLDER_FINGERPRINTS).some((card) => {
		const ink = card.flatMap((v, i) => (v < INK_BELOW ? [i] : []));
		return mean([...card.keys()], card) <= MAX_DISTANCE && mean(ink, card) <= MAX_INK_DISTANCE;
	});
}

/** A decoded frame is one of Caltrans' cards; false when the pixels can't be read. */
export function isCaltransPlaceholder(img: HTMLImageElement): boolean {
	const width = img.naturalWidth;
	const height = img.naturalHeight;
	if (!width || !height) return false;
	const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
	if (!ctx) return false;
	ctx.canvas.width = width;
	ctx.canvas.height = height;
	try {
		ctx.drawImage(img, 0, 0);
		return isPlaceholderFingerprint(frameFingerprint(ctx.getImageData(0, 0, width, height)));
	} catch {
		return false; // a tainted canvas: no pixels, no claim
	}
}
