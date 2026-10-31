// src/lib/components/tv/camera-preload.ts
import { CAMERAS, type CameraConfig } from '$lib/config/cameras';
import type { TvCameraCluster, TvScreenId } from '$lib/config/tv';
import { forgetFrame, rememberFailure, rememberFrame, versionedFrameUrl } from './camera-frame';
import { readCameraFrame, type CameraPreload } from './camera-read';

const SCREEN_CLUSTER: Partial<Record<TvScreenId, TvCameraCluster>> = {
	'cameras-tam-coast': 'tam-coast',
	'cameras-central-highway': 'central-highway',
	'cameras-west-north': 'west-north'
};

const MAX_PRELOAD = 8;

export function clusterForScreen(screenId: TvScreenId): TvCameraCluster | null {
	return SCREEN_CLUSTER[screenId] ?? null;
}

export function framesToPreload(
	screenId: TvScreenId,
	nowMs: number,
	cameras: CameraConfig[] = CAMERAS
): { camId: string; url: string }[] {
	const cluster = clusterForScreen(screenId);
	if (!cluster) return [];
	return cameras
		.filter((c) => c.tvCluster === cluster && c.type === 'image')
		.slice(0, MAX_PRELOAD)
		.map((c) => ({ camId: c.id, url: versionedFrameUrl(c.url, c.refreshInterval, nowMs) }));
}

export async function preloadScreenFrames(
	screenId: TvScreenId,
	nowMs: number,
	preload?: CameraPreload,
	isPlaceholder?: (img: HTMLImageElement) => boolean
): Promise<number> {
	const frames = framesToPreload(screenId, nowMs);
	const results = await Promise.all(
		frames.map(async ({ camId, url }) => {
			const read = await readCameraFrame(url, preload, isPlaceholder);
			if (read.kind === 'frame') rememberFrame(camId, url, Date.now(), read.img);
			else if (read.kind === 'placeholder') forgetFrame(camId);
			else rememberFailure(camId);
			return read.kind === 'frame';
		})
	);
	return results.filter(Boolean).length;
}
