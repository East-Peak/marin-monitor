// src/lib/stores/tv-scroll.ts

const scrollPositions = new Map<string, number>();

export function saveScrollPosition(screenId: string, scrollTop: number): void {
	scrollPositions.set(screenId, scrollTop);
}

export function getScrollPosition(screenId: string): number {
	return scrollPositions.get(screenId) ?? 0;
}

export function resetScrollPosition(screenId: string): void {
	scrollPositions.delete(screenId);
}

export function resetAllScrollPositions(): void {
	scrollPositions.clear();
}
