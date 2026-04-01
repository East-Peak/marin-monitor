// src/lib/stores/tv-scroll.ts

const scrollPositions = new Map<string, { scrollTop: number; timestamp: number }>();

export function saveScrollPosition(screenId: string, scrollTop: number): void {
	scrollPositions.set(screenId, { scrollTop, timestamp: Date.now() });
}

export function getScrollPosition(screenId: string): number {
	return scrollPositions.get(screenId)?.scrollTop ?? 0;
}

export function resetScrollPosition(screenId: string): void {
	scrollPositions.delete(screenId);
}

export function resetAllScrollPositions(): void {
	scrollPositions.clear();
}
