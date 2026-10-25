import { describe, expect, it } from 'vitest';
import { camHref, camParam, closeOp, openOp, snapshotOp, stepOp, viewerAt } from './cam-viewer-url';

const url = (s: string) => new URL(s, 'https://marin.test');
const supported = (id: string) => id.startsWith('alert-') || id.startsWith('caltrans-');

describe('camParam / camHref', () => {
	it('reads ?cam, and writes or drops it keeping every other param and the hash', () => {
		const u = url('/map?layers=cams,fire&sel=cams%3Aalert-bolinas&utm_source=x#11/37.9/-122.5');
		expect(camParam(u)).toBeNull();
		const on = camHref(u, 'alert-tam-east');
		expect(on).toBe(
			'/map?layers=cams%2Cfire&sel=cams%3Aalert-bolinas&utm_source=x&cam=alert-tam-east#11/37.9/-122.5'
		);
		expect(camParam(url(on))).toBe('alert-tam-east');
		const off = camHref(url(on), null);
		expect(new URL(off, 'https://marin.test').searchParams.get('cam')).toBeNull();
		expect(new URL(off, 'https://marin.test').searchParams.get('utm_source')).toBe('x');
		expect(off.endsWith('#11/37.9/-122.5')).toBe(true);
	});

	it('treats an empty ?cam= as absent', () => {
		expect(camParam(url('/?cam='))).toBeNull();
	});
});

describe('history transitions', () => {
	const home = url('/?probe#outdoors');
	const other = { scroll: 3 };

	it('opening pushes ?cam with the viewer mark, keeping unrelated state', () => {
		const op = openOp(home, other, 'alert-tam-east', { from: 'tile' });
		expect(op).toEqual({
			op: 'push',
			href: '/?probe=&cam=alert-tam-east#outdoors',
			state: {
				scroll: 3,
				camViewer: { id: 'alert-tam-east', pushed: true, seq: null, from: 'tile' }
			}
		});
	});

	it('the map keeps its snapshot in the state, so Forward restores the same sequence', () => {
		const op = openOp(url('/map'), {}, 'alert-bolinas', {
			from: 'map',
			seq: ['alert-bolinas', 'alert-muir-beach']
		});
		expect(op.op === 'push' && op.state.camViewer!.seq).toEqual([
			'alert-bolinas',
			'alert-muir-beach'
		]);
	});

	it('stepping replaces the entry, keeping the mark and the snapshot', () => {
		const opened = openOp(home, other, 'alert-tam-east', { from: 'tile' });
		if (opened.op !== 'push') throw new Error();
		const op = stepOp(url(opened.href), opened.state, 'alert-tam-west');
		expect(op).toEqual({
			op: 'replace',
			href: '/?probe=&cam=alert-tam-west#outdoors',
			state: {
				scroll: 3,
				camViewer: { id: 'alert-tam-west', pushed: true, seq: null, from: 'tile' }
			}
		});
	});

	it('closing a viewer we pushed goes back one step', () => {
		const opened = openOp(home, other, 'alert-tam-east', { from: 'tile' });
		if (opened.op !== 'push') throw new Error();
		expect(closeOp(url(opened.href), opened.state)).toEqual({ op: 'back' });
	});

	it('closing a directly loaded link replaces the URL without cam, never a blind back', () => {
		expect(closeOp(url('/?cam=alert-tam-east&x=1#a'), { scroll: 3 })).toEqual({
			op: 'replace',
			href: '/?x=1#a',
			state: { scroll: 3 }
		});
		const op = closeOp(url('/?cam=alert-tam-east'), {
			camViewer: { id: 'alert-tam-east', pushed: false, seq: ['alert-tam-east'], from: 'link' }
		});
		expect(op).toEqual({ op: 'replace', href: '/', state: {} });
	});

	it('a direct link’s sequence is fixed once, by replacing its own entry', () => {
		expect(
			snapshotOp(url('/map?cam=alert-bolinas'), {}, 'alert-bolinas', ['alert-bolinas'])
		).toEqual({
			op: 'replace',
			href: '/map?cam=alert-bolinas',
			state: {
				camViewer: { id: 'alert-bolinas', pushed: false, seq: ['alert-bolinas'], from: 'link' }
			}
		});
	});
});

describe('viewerAt', () => {
	it('is the pushed mark when its id matches the URL', () => {
		const mark = { id: 'alert-tam-east', pushed: true, seq: null, from: 'tile' as const };
		expect(viewerAt(url('/?cam=alert-tam-east'), { camViewer: mark }, supported)).toEqual({
			open: mark,
			drop: false
		});
	});

	it('a ?cam with no mark (a link, or a reload) opens there as a direct link', () => {
		expect(viewerAt(url('/?cam=caltrans-580'), {}, supported)).toEqual({
			open: { id: 'caltrans-580', pushed: false, seq: null, from: 'link' },
			drop: false
		});
	});

	it('no ?cam is closed, whatever the state says (Back from a pushed entry)', () => {
		const mark = { id: 'alert-tam-east', pushed: true, seq: null, from: 'tile' as const };
		expect(viewerAt(url('/'), { camViewer: mark }, supported)).toEqual({ open: null, drop: false });
	});

	it('an unknown or unsupported id opens nothing and drops the parameter', () => {
		expect(viewerAt(url('/?cam=abc7-tam'), {}, supported)).toEqual({ open: null, drop: true });
		expect(viewerAt(url('/?cam=%3Cscript%3E'), {}, supported)).toEqual({ open: null, drop: true });
	});
});
