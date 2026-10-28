/**
 * Opening or closing a section keeps its header where the reader tapped it (plan-text-system.md
 * rule 5): an explicit scroll compensation, not `overflow-anchor` alone, which iOS Safari doesn't
 * always honour. The header's viewport top is held through the change and while late content
 * arrives (a section's reads land after it opens), until the reader scrolls or `ms` passes.
 * Collapsing near the document's end may still scroll: the page got shorter.
 */
const READER = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const;

export function holdStill(el: HTMLElement, ms = 2_500): () => void {
	const top = el.getBoundingClientRect().top;
	const pin = () => {
		// A header that left the page (a navigation mid-hold) holds nothing (Codex 1c #3).
		if (!el.isConnected) return stop();
		const moved = el.getBoundingClientRect().top - top;
		if (Math.abs(moved) > 0.5) window.scrollBy({ top: moved, behavior: 'instant' });
	};
	const ro = new ResizeObserver(pin);
	ro.observe(document.body);
	const frame = requestAnimationFrame(pin);
	const timer = setTimeout(stop, ms);
	// The tap that toggled has already landed; the reader's next move ends the hold.
	queueMicrotask(() => READER.forEach((t) => window.addEventListener(t, stop, { passive: true })));
	function stop() {
		ro.disconnect();
		cancelAnimationFrame(frame);
		clearTimeout(timer);
		READER.forEach((t) => window.removeEventListener(t, stop));
	}
	return stop;
}
