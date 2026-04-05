// src/lib/components/tv/swipe.ts

export type SwipeState = {
	startX: number;
	startY: number;
	axisLocked: boolean;
};

const SLOP_PX = 10;
const COMMIT_PX = 50;

/**
 * Begin tracking a swipe gesture.
 * @param startX - clientX of the touchstart
 * @param startY - clientY of the touchstart
 * @param touchCount - number of active touches (bail if > 1)
 * @param bail - true if the touch target should be excluded (map canvas, scrollable element)
 */
export function initSwipe(
	startX: number,
	startY: number,
	touchCount: number,
	bail: boolean
): SwipeState | null {
	if (touchCount !== 1 || bail) return null;
	return { startX, startY, axisLocked: false };
}

/**
 * Update swipe state on touchmove.
 * @param currentX - clientX of the current touch
 * @param currentY - clientY of the current touch
 * @param state - current swipe state
 * @returns updated state and whether to call preventDefault
 */
export function progressSwipe(
	currentX: number,
	currentY: number,
	state: SwipeState
): { state: SwipeState; preventDefault: boolean } {
	if (state.axisLocked) {
		return { state, preventDefault: true };
	}
	const dx = Math.abs(currentX - state.startX);
	const dy = Math.abs(currentY - state.startY);
	if (dx > SLOP_PX && dx > dy) {
		return { state: { ...state, axisLocked: true }, preventDefault: true };
	}
	return { state, preventDefault: false };
}

/**
 * Resolve a swipe gesture on touchend.
 * @param endX - clientX of the final touch position
 * @param state - final swipe state
 * @returns 'next', 'prev', or null (if below commit threshold or not locked)
 */
export function commitSwipe(
	endX: number,
	state: SwipeState
): 'next' | 'prev' | null {
	if (!state.axisLocked) return null;
	const dx = endX - state.startX;
	if (Math.abs(dx) < COMMIT_PX) return null;
	return dx < 0 ? 'next' : 'prev';
}

/**
 * Check whether a touch target should be excluded from swipe handling.
 * Excludes MapLibre canvas (to preserve map panning) and elements with
 * active horizontal scroll overflow (e.g. SafetyScreen's scroll container).
 * Only called in browser context — do not call during SSR.
 */
export function shouldBailSwipe(target: EventTarget | null): boolean {
	if (!(target instanceof Element)) return false;
	if (target.closest('.mapboxgl-canvas-container')) return true;
	return isHorizontallyScrollable(target);
}

function isHorizontallyScrollable(el: Element): boolean {
	let current: Element | null = el;
	while (current && current !== document.body) {
		const style = getComputedStyle(current);
		const ov = style.overflowX;
		if ((ov === 'auto' || ov === 'scroll') && current.scrollWidth > current.clientWidth) {
			return true;
		}
		current = current.parentElement;
	}
	return false;
}
