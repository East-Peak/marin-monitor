// src/lib/components/tv/camera-frame.ts
/**
 * Pure camera-frame logic for TV tiles. A tile only ever shows a frame that
 * has fully decoded; failures degrade to "stale" (keep last good) and only
 * become "offline" when nothing has ever loaded.
 */
export type TileStatus = 'connecting' | 'live' | 'stale' | 'offline';

export interface TileState {
	shownUrl: string | null;
	shownAt: number | null;
	failures: number;
}

export const OFFLINE_AFTER_FAILURES = 2;

export function versionedFrameUrl(
	url: string,
	refreshIntervalSec: number | undefined,
	nowMs: number
): string {
	if (!refreshIntervalSec) return url;
	const bucketMs = refreshIntervalSec * 1000;
	const version = Math.floor(nowMs / bucketMs) * bucketMs;
	return `${url}${url.includes('?') ? '&' : '?'}t=${version}`;
}

export function initialTileState(
	lastGood?: { url: string; at: number } | null,
	failures = 0
): TileState {
	return lastGood
		? { shownUrl: lastGood.url, shownAt: lastGood.at, failures: 0 }
		: { shownUrl: null, shownAt: null, failures };
}

export function onFrameLoaded(_s: TileState, url: string, at: number): TileState {
	return { shownUrl: url, shownAt: at, failures: 0 };
}

export function onFrameFailed(s: TileState): TileState {
	return { ...s, failures: s.failures + 1 };
}

export function staleAfterMs(refreshIntervalSec: number | undefined): number {
	return Math.max(60_000, 3 * (refreshIntervalSec ?? 0) * 1000);
}

export function tileStatus(s: TileState, nowMs: number, staleMs: number): TileStatus {
	if (s.shownUrl === null || s.shownAt === null) {
		return s.failures >= OFFLINE_AFTER_FAILURES ? 'offline' : 'connecting';
	}
	return nowMs - s.shownAt > staleMs ? 'stale' : 'live';
}

export interface LastGoodFrame {
	url: string;
	at: number;
	/** The decoded element itself, so a remount paints without refetching. */
	img: HTMLImageElement;
}

// Bounded by the camera count (one entry, one element per camera); survives slide unmounts.
const frameCache = new Map<string, LastGoodFrame>();
// Consecutive failures since the last decoded frame. A slow-refresh camera gets
// one attempt per visit, so counting per mount would never reach "offline".
const failureCounts = new Map<string, number>();

export function lastGoodFrame(camId: string): LastGoodFrame | null {
	return frameCache.get(camId) ?? null;
}

export function rememberFrame(camId: string, url: string, at: number, img: HTMLImageElement): void {
	const prev = frameCache.get(camId);
	if (prev && prev.at > at) return;
	frameCache.set(camId, { url, at, img });
	failureCounts.delete(camId);
}

export function priorFailures(camId: string): number {
	return failureCounts.get(camId) ?? 0;
}

export function rememberFailure(camId: string): void {
	failureCounts.set(camId, priorFailures(camId) + 1);
}

export function resetFrameCache(): void {
	frameCache.clear();
	failureCounts.clear();
}
