import { expect, type Locator } from '@playwright/test';

/**
 * CAMBAR1: ALERTCalifornia asks that their frames not be cropped and their info bar (the
 * frame's bottom strip) not be covered. For one decoded <img>: what it paints is the whole
 * frame (no `object-fit: cover`, painted aspect within 2% of the natural one, no clipping
 * ancestor), and across the bottom 12% nothing paints above it.
 */
export async function frameProblems(img: Locator): Promise<string[]> {
	await img.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'center' }));
	await expect
		.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0))
		.toBe(true);
	return img.evaluate((el: HTMLImageElement) => {
		const problems: string[] = [];
		const box = el.getBoundingClientRect();
		const fit = getComputedStyle(el).objectFit;
		if (fit === 'cover') problems.push('object-fit: cover');
		// The painted frame: `contain` letterboxes inside the box (centred, the default position).
		let { left, top, width, height } = box;
		if (fit === 'contain' || fit === 'scale-down') {
			const s = Math.min(
				width / el.naturalWidth,
				height / el.naturalHeight,
				fit === 'scale-down' ? 1 : Infinity
			);
			[width, height] = [el.naturalWidth * s, el.naturalHeight * s];
			left += (box.width - width) / 2;
			top += (box.height - height) / 2;
		}
		const ratio = width / height / (el.naturalWidth / el.naturalHeight);
		if (Math.abs(ratio - 1) > 0.02)
			problems.push(`aspect off by ${((ratio - 1) * 100).toFixed(1)}%`);
		for (let a: Element | null = el; a; a = a.parentElement) {
			const o = getComputedStyle(a);
			// Clipping that keeps the box (Codex CAMBAR1 #5).
			if (o.clipPath !== 'none' || o.maskImage !== 'none')
				problems.push(`clip-path or mask on ${a.tagName.toLowerCase()}.${a.className}`);
			if (a === el) continue;
			if (o.overflowX === 'visible' && o.overflowY === 'visible') continue;
			const r = a.getBoundingClientRect();
			if (
				left < r.left - 1 ||
				top < r.top - 1 ||
				left + width > r.right + 1 ||
				top + height > r.bottom + 1
			)
				problems.push(`clipped by ${a.tagName.toLowerCase()}.${a.className}`);
		}
		// Hit-testing skips `pointer-events: none`, which our chips use: count them while sampling.
		const hitAll = document.head.appendChild(document.createElement('style'));
		hitAll.textContent = '* { pointer-events: auto !important; }';
		// Dense across the info bar (the bottom 12%), coarser over the rest: nothing of ours on it.
		const spread = (n: number, from: number, to: number) =>
			Array.from({ length: n }, (_, i) => from + ((to - from) * i) / (n - 1));
		const points = [
			...spread(4, 0.88, 0.995).flatMap((fy) => spread(25, 0.005, 0.995).map((fx) => [fx, fy])),
			...spread(9, 0.01, 0.86).flatMap((fy) => spread(9, 0.01, 0.99).map((fx) => [fx, fy]))
		];
		for (const [fx, fy] of points) {
			const hit = document.elementFromPoint(left + width * fx, top + height * fy);
			if (hit !== el)
				problems.push(
					`(${fx.toFixed(2)}, ${fy.toFixed(2)}) covered by ${hit ? `${hit.tagName.toLowerCase()}.${hit.className}` : 'nothing'}`
				);
		}
		hitAll.remove();
		return [...new Set(problems)];
	});
}
