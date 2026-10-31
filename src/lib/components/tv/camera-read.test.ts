import { describe, expect, it, vi } from 'vitest';
import { readCameraFrame } from './camera-read';

const CALTRANS = 'https://cwwp2.dot.ca.gov/data/d4/cctv/image/x/x.jpg?v=1';
const OTHER = 'https://cams.test/tam.jpg?v=1';
const img = (src: string) => Object.assign(document.createElement('img'), { src });

describe('readCameraFrame', () => {
	it('reads a Caltrans card as a card, not a frame', async () => {
		const preload = vi.fn(async (u: string) => img(u));
		const read = await readCameraFrame(CALTRANS, preload, () => true);
		expect(read).toEqual({ kind: 'placeholder' });
		expect(preload).toHaveBeenCalledWith(CALTRANS, true);
	});

	it('a real Caltrans frame is a frame', async () => {
		const frame = img(CALTRANS);
		const read = await readCameraFrame(
			CALTRANS,
			async () => frame,
			() => false
		);
		expect(read).toEqual({ kind: 'frame', img: frame });
	});

	it('never checks, or asks CORS of, a camera that serves no cards', async () => {
		const preload = vi.fn(async (u: string) => img(u));
		const isPlaceholder = vi.fn(() => true);
		const read = await readCameraFrame(OTHER, preload, isPlaceholder);
		expect(read.kind).toBe('frame');
		expect(preload).toHaveBeenCalledWith(OTHER, false);
		expect(isPlaceholder).not.toHaveBeenCalled();
	});

	it('with CORS withdrawn, still shows the frame through a plain load, and claims nothing', async () => {
		const frame = img(CALTRANS);
		const preload = vi.fn(async (_u: string, cors: boolean) => (cors ? null : frame));
		const isPlaceholder = vi.fn(() => true);
		expect(await readCameraFrame(CALTRANS, preload, isPlaceholder)).toEqual({
			kind: 'frame',
			img: frame
		});
		expect(isPlaceholder).not.toHaveBeenCalled();
	});

	it('both loads failing is a failed read', async () => {
		expect(await readCameraFrame(CALTRANS, async () => null)).toEqual({ kind: 'failed' });
	});
});
