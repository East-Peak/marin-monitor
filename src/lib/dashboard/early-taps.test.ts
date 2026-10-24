import { describe, expect, it, vi } from 'vitest';
import { replayEarlyTaps } from './early-taps';

describe('replayEarlyTaps (MOBILE1: a tap before hydration is kept)', () => {
	it('clicks each kept button once, in order, and empties the list', () => {
		const order: string[] = [];
		const a = Object.assign(document.createElement('button'), { onclick: () => order.push('a') });
		const b = Object.assign(document.createElement('button'), { onclick: () => order.push('b') });
		document.body.append(a, b);
		const w: { __earlyTaps?: Element[] } = { __earlyTaps: [a, b, a] };
		replayEarlyTaps(w);
		expect(order).toEqual(['a', 'b', 'a']);
		expect(w.__earlyTaps).toEqual([]);
		a.remove();
		b.remove();
	});
	it('skips a button hydration replaced (no longer in the page), and copes with none kept', () => {
		const gone = document.createElement('button');
		const click = vi.spyOn(gone, 'click');
		replayEarlyTaps({ __earlyTaps: [gone] });
		expect(click).not.toHaveBeenCalled();
		expect(() => replayEarlyTaps({})).not.toThrow();
	});
});
