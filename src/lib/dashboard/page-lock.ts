/**
 * One owner of the page beneath modal layers (plan-text-system.md rule 6): DetailDialog and the
 * camera viewer both open through it, in any order, and close in any order (Codex 1c #1). Each
 * layer moves to the body; everything but the topmost layer is inert; the first layer locks the
 * page's scroll and the last restores it, exactly where it was.
 */
import type { Action } from 'svelte/action';

const layers: HTMLElement[] = [];
/** The elements this module made inert, so it never clears an inert it didn't set. */
const ours = new Set<Element>();
let saved = { top: 0, overflow: '' };

function sync() {
	for (const el of ours) if (!el.isConnected) ours.delete(el);
	const top = layers.at(-1);
	for (const el of document.body.children) {
		const shouldBe = top !== undefined && el !== top;
		if (shouldBe && !el.hasAttribute('inert')) {
			el.setAttribute('inert', '');
			ours.add(el);
		} else if (!shouldBe && ours.has(el)) {
			el.removeAttribute('inert');
			ours.delete(el);
		}
	}
}

export const overPage: Action<HTMLElement> = (node) => {
	document.body.appendChild(node);
	const html = document.documentElement;
	if (layers.length === 0) {
		saved = { top: window.scrollY, overflow: html.style.overflow };
		html.style.overflow = 'hidden';
		html.setAttribute('data-dialog-open', '');
	}
	layers.push(node);
	sync();
	return {
		destroy() {
			layers.splice(layers.indexOf(node), 1);
			node.remove();
			sync();
			if (layers.length === 0) {
				html.style.overflow = saved.overflow;
				html.removeAttribute('data-dialog-open');
				window.scrollTo({ top: saved.top, behavior: 'instant' });
			}
		}
	};
};
