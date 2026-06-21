// src/lib/stores/tv-scroll.ts

const scrollPositions = new Map<string, { scrollTop: number; contentHeight: number }>();

export function saveScrollPosition(
	screenId: string,
	scrollTop: number,
	contentHeight: number
): void {
	scrollPositions.set(screenId, { scrollTop, contentHeight });
}

export function getScrollPosition(
	screenId: string
): { scrollTop: number; contentHeight: number } | null {
	return scrollPositions.get(screenId) ?? null;
}

export function resetScrollPosition(screenId: string): void {
	scrollPositions.delete(screenId);
}

export function resetAllScrollPositions(): void {
	scrollPositions.clear();
}
