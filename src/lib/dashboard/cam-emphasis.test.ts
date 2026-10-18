import { describe, expect, it } from 'vitest';
import { emphasisedCams, setCamEmphasis } from './cam-emphasis';
import { clickSelection, featureSelection } from './map-selection';

/** CAMQUIET1: one feature-state key lights a camera's pin and wedge, from any of four places. */
function fakeMap(sources = ['cameras', 'camera-wedges']) {
	const state = new Map<string, Record<string, unknown>>();
	return {
		state,
		getSource: (id: string) => (sources.includes(id) ? {} : undefined),
		setFeatureState: ({ source, id }: { source: string; id: string }, s: Record<string, unknown>) =>
			state.set(`${source}/${id}`, { ...state.get(`${source}/${id}`), ...s })
	};
}
const lit = (m: ReturnType<typeof fakeMap>) =>
	[...m.state].filter(([, s]) => s.emphasis === true).map(([k]) => k);

describe('emphasisedCams', () => {
	it("hovering a pin names its camera (the in-view list's hover id for the cameras source)", () => {
		const pin = featureSelection({ source: 'cameras', properties: { itemId: 'alert-vision' } });
		expect(emphasisedCams(pin, null)).toEqual(['alert-vision']);
	});

	it('hovering its wedge names the same camera', () => {
		const wedge = featureSelection({
			source: 'camera-wedges',
			properties: { itemId: 'alert-vision' }
		});
		expect(emphasisedCams(wedge, null)).toEqual(['alert-vision']);
	});

	it('a list row hovered and a camera selected are both lit, once each', () => {
		expect(emphasisedCams('cams:alert-tam-east', 'cams:alert-vision')).toEqual([
			'alert-tam-east',
			'alert-vision'
		]);
		expect(emphasisedCams('cams:alert-vision', 'cams:alert-vision')).toEqual(['alert-vision']);
	});

	it("a tablet dashboard's inspected camera (the click payload) counts as selected (Codex CAMQUIET1 #3)", () => {
		const inspected = clickSelection({ kind: 'camera', itemId: 'alert-vision' });
		expect(emphasisedCams(null, inspected)).toEqual(['alert-vision']);
		expect(clickSelection(null)).toBeNull();
	});

	it('anything not a camera lights nothing', () => {
		expect(emphasisedCams('311:123', 'news:abc')).toEqual([]);
		expect(emphasisedCams(null, null)).toEqual([]);
	});
});

describe('setCamEmphasis', () => {
	it("sets the key on both the pin's and the wedge's feature, by the camera id", () => {
		const m = fakeMap();
		setCamEmphasis(m as never, [], ['alert-vision']);
		expect(lit(m)).toEqual(['cameras/alert-vision', 'camera-wedges/alert-vision']);
	});

	it('clears it on leave and deselect', () => {
		const m = fakeMap();
		setCamEmphasis(m as never, [], ['alert-vision', 'alert-tam-east']);
		setCamEmphasis(m as never, ['alert-vision', 'alert-tam-east'], ['alert-tam-east']);
		expect(lit(m)).toEqual(['cameras/alert-tam-east', 'camera-wedges/alert-tam-east']);
		setCamEmphasis(m as never, ['alert-tam-east'], []);
		expect(lit(m)).toEqual([]);
	});

	it('a missing source (before load, after a style swap) is skipped', () => {
		const m = fakeMap(['cameras']);
		setCamEmphasis(m as never, [], ['alert-vision']);
		expect(lit(m)).toEqual(['cameras/alert-vision']);
	});
});
