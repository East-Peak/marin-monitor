import { describe, expect, it, vi } from 'vitest';
import { createThumbRegistry } from './cam-thumbs';

describe('createThumbRegistry', () => {
	it('a published thumbnail is current until its last holder releases it', () => {
		const revoke = vi.fn();
		const r = createThumbRegistry(revoke);
		const unpublish = r.publish('a', 'blob:1');
		expect(r.current('a')).toBe('blob:1');
		const held = r.retain('a')!;
		expect(held.src).toBe('blob:1');
		unpublish(); // the tile unmounts while the viewer holds it
		expect(revoke).not.toHaveBeenCalled();
		expect(r.current('a')).toBe('blob:1');
		held.release();
		expect(revoke).toHaveBeenCalledWith('blob:1');
		expect(r.current('a')).toBeNull();
	});

	it('a newer thumbnail replaces the current one; the old is revoked once nobody holds it', () => {
		const revoke = vi.fn();
		const r = createThumbRegistry(revoke);
		const first = r.publish('a', 'blob:1');
		const held = r.retain('a')!;
		const second = r.publish('a', 'blob:2');
		first();
		expect(r.current('a')).toBe('blob:2');
		expect(revoke).not.toHaveBeenCalled();
		held.release();
		expect(revoke).toHaveBeenCalledWith('blob:1');
		second();
		expect(revoke).toHaveBeenCalledWith('blob:2');
	});

	it('never revokes a plain URL (ALERTCalifornia’s thumbnail), and a release is idempotent', () => {
		const revoke = vi.fn();
		const r = createThumbRegistry(revoke);
		const off = r.publish('a', 'https://cams.test/thumb.jpg');
		off();
		off();
		expect(revoke).not.toHaveBeenCalled();
		expect(r.current('a')).toBeNull();
		expect(r.retain('a')).toBeNull();
	});

	it('tells subscribers when what is current changes', () => {
		const r = createThumbRegistry(() => {});
		const seen = vi.fn();
		const stop = r.subscribe(seen);
		const off = r.publish('a', 'blob:1');
		off();
		stop();
		r.publish('b', 'blob:2');
		expect(seen).toHaveBeenCalledTimes(3); // on subscribe, publish, release
	});
});
