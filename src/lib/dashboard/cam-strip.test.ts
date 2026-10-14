import { describe, expect, it } from 'vitest';
import { CAMERAS, type CameraConfig } from '$lib/config/cameras';
import {
	SOURCE_STALE_MS,
	captureAgeLabel,
	exposesCaptureTime,
	stripCameras,
	stripFrameUrl,
	stripNotice
} from './cam-strip';

const NOW = Date.UTC(2026, 9, 13, 23, 0, 0);
const byId = (id: string) => CAMERAS.find((c) => c.id === id) as CameraConfig;

describe('stripCameras (Decision 1)', () => {
	it('fire/ridge cams lead in config order, then the four Caltrans cams; 21 in all', () => {
		const ids = stripCameras(CAMERAS).map((c) => c.id);
		expect(ids.slice(0, 3)).toEqual(['alert-tam-east', 'alert-tam-west', 'alert-muir-beach']);
		expect(ids.slice(-4)).toEqual([
			'caltrans-spencer',
			'caltrans-sr1',
			'caltrans-580',
			'caltrans-ignacio'
		]);
		expect(ids).toHaveLength(21);
	});
	it('leaves out the frozen ABC7 frame and the Windy embeds', () => {
		const ids = stripCameras(CAMERAS).map((c) => c.id);
		expect(ids).not.toContain('abc7-tam'); // Last-Modified 2024-05-12 (Task 0)
		expect(ids).not.toContain('windy-tiburon');
		expect(stripCameras(CAMERAS).every((c) => c.type === 'image')).toBe(true);
	});
	it('is deterministic whatever order the config lists them in', () => {
		expect(stripCameras([...CAMERAS].reverse())).toEqual(stripCameras(CAMERAS));
	});
});

describe('stripFrameUrl (Decision 2)', () => {
	it('ALERTCalifornia tiles load the thumbnail, not the 300 KB frame', () => {
		expect(stripFrameUrl(byId('alert-tam-east'))).toBe(
			'https://cameras.alertcalifornia.org/public-camera-data/Axis-TamEast/latest-thumb.jpg'
		);
	});
	it('Caltrans frames load as configured; an unrecognised ALERTCalifornia URL is left alone', () => {
		expect(stripFrameUrl(byId('caltrans-sr1'))).toBe(byId('caltrans-sr1').url);
		const odd = {
			...byId('alert-tam-east'),
			url: 'https://cameras.alertcalifornia.org/x/frame.jpg'
		};
		expect(stripFrameUrl(odd)).toBe(odd.url);
	});
});

describe('capture time (Decision 3)', () => {
	it('only Caltrans exposes one to the browser', () => {
		expect(exposesCaptureTime(byId('caltrans-spencer'))).toBe(true);
		expect(exposesCaptureTime(byId('alert-tam-east'))).toBe(false);
	});
	it('no capture time, no age claim', () => {
		expect(captureAgeLabel(null, NOW)).toBeNull();
	});
	it('a recent frame reads its age; past 30 min it is marked old', () => {
		expect(captureAgeLabel(NOW - 4 * 60_000, NOW)).toEqual({ text: '4 min ago', old: false });
		expect(captureAgeLabel(NOW - SOURCE_STALE_MS - 60_000, NOW)).toEqual({
			text: '31 min ago',
			old: true
		});
		expect(captureAgeLabel(NOW - 3 * 3_600_000, NOW)).toEqual({ text: '3 h ago', old: true });
	});
	it('a source clock slightly ahead of ours never reads "just now"', () => {
		expect(captureAgeLabel(NOW + 90_000, NOW)).toEqual({ text: '1 min ago', old: false });
	});
});

describe('stripNotice (Decision 5)', () => {
	it('all offline → "all-offline"; nothing current → "not-updating"; any live or connecting → none', () => {
		expect(stripNotice([])).toBeNull();
		expect(stripNotice(['offline', 'offline'])).toBe('all-offline');
		expect(stripNotice(['stale', 'stale'])).toBe('not-updating');
		expect(stripNotice(['offline', 'stale'])).toBe('not-updating');
		expect(stripNotice(['offline', 'live'])).toBeNull();
		expect(stripNotice(['stale', 'connecting'])).toBeNull();
		expect(stripNotice(['offline', 'connecting'])).toBeNull();
	});
});
