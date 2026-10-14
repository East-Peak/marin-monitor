/**
 * The v2 Cams strip (decision 5a): which cameras, in what order, which frame URL,
 * and what the strip may claim about a frame's age. Pure; the tile and strip render it.
 */
import { CAMERAS, type CameraCategory, type CameraConfig } from '$lib/config/cameras';
import type { TileStatus } from '$lib/components/tv/camera-frame';
import { formatItemAge } from './latest-reporting';

/** Strip tiles refresh once a minute (TV's 10 s is for a wall screen, not a phone plan). */
export const STRIP_REFRESH_S = 60;
/** A tile with no frame yet retries sooner, so "offline" is reached in ~20 s, not 2 min. */
export const STRIP_RETRY_S = 10;
/** A source frame older than this is marked old (amber). */
export const SOURCE_STALE_MS = 30 * 60_000;

// Fire/ridge cams lead; Caltrans follows. Scenic is out: ABC7's frame has been frozen since
// 2024-05-12 and the Windy embeds can't be decode-gated (Decision 1).
const RANK: Partial<Record<CameraCategory, number>> = { fire: 0, traffic: 1 };

export function stripCameras(cams: readonly CameraConfig[] = CAMERAS): CameraConfig[] {
	return cams
		.filter((c) => c.type === 'image' && RANK[c.category] !== undefined)
		.sort(
			(a, b) =>
				RANK[a.category]! - RANK[b.category]! || a.order - b.order || a.id.localeCompare(b.id)
		);
}

const ALERT_FRAME =
	/^(https:\/\/cameras\.alertcalifornia\.org\/public-camera-data\/[^/]+\/)latest-frame\.jpg$/;

/** ALERTCalifornia's 240×135 thumbnail (~6 KB) instead of its 200–400 KB frame (Decision 2). */
export function stripFrameUrl(cam: CameraConfig): string {
	const m = ALERT_FRAME.exec(cam.url);
	return m ? `${m[1]}latest-thumb.jpg` : cam.url;
}

// Sources whose frames carry Last-Modified with Access-Control-Allow-Origin: * (checked
// 2026-10-13). ALERTCalifornia sends Last-Modified but no CORS header, so it stays unclaimed.
const CAPTURE_TIME_HOSTS = new Set(['cwwp2.dot.ca.gov']);

export function exposesCaptureTime(cam: CameraConfig): boolean {
	return CAPTURE_TIME_HOSTS.has(new URL(cam.url).hostname);
}

/** The source's own capture age, or null: no capture time, no age claim (Decision 3). */
export function captureAgeLabel(
	capturedAt: number | null,
	now: number
): { text: string; old: boolean } | null {
	if (capturedAt === null) return null;
	return { text: formatItemAge(capturedAt, now), old: now - capturedAt > SOURCE_STALE_MS };
}

export type StripNotice = 'all-offline' | 'not-updating' | null;

/**
 * What the strip must say about the tried tiles in view (Decision 5): every one offline
 * (never delivered); or none current, i.e. offline or showing a picture we can no longer
 * refresh (Codex r5 #2: a warm strip that stops updating is not silent either).
 */
export function stripNotice(inView: readonly TileStatus[]): StripNotice {
	if (inView.length === 0) return null;
	if (inView.every((s) => s === 'offline')) return 'all-offline';
	if (inView.every((s) => s === 'offline' || s === 'stale')) return 'not-updating';
	return null;
}
