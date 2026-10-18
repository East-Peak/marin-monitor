import { expect, type Page } from '@playwright/test';

export interface V2Probe {
	loading: string[];
	layers: Record<string, string>;
	dataRevision: number;
	synced: { revision: number; counts: Record<string, number> } | null;
	provenance: Record<'311' | 'earthquakes', { state: string; observedAt: number | null }>;
}
export const probe = (page: Page) =>
	page.evaluate(() => (window as unknown as { __v2Probe?: V2Probe }).__v2Probe ?? null);

/** Every controller part settled and the map drew the latest data revision (Codex r3 #5). */
export async function settled(page: Page, timeout = 30_000): Promise<V2Probe> {
	await expect
		.poll(
			async () => {
				const p = await probe(page);
				return !!p && p.loading.length === 0 && p.synced?.revision === p.dataRevision;
			},
			{ timeout }
		)
		.toBe(true);
	return (await probe(page))!;
}

type ProbeMap = {
	getSource(id: string): { serialize(): { data: { features: unknown[] } } } | undefined;
	queryRenderedFeatures(o: {
		layers: string[];
	}): { properties: Record<string, unknown>; geometry: { coordinates: number[] } }[];
	project(c: number[]): { x: number; y: number };
	getCanvas(): HTMLCanvasElement;
	getCenter(): { lng: number; lat: number };
};
/** Features in a GeoJSON source of the v2 map (-1 before the map exists). */
export const sourceCount = (page: Page, id: string) =>
	page.evaluate((sourceId) => {
		const m = (window as unknown as { __v2ProbeMap?: ProbeMap }).__v2ProbeMap;
		const src = m?.getSource(sourceId);
		return src ? src.serialize().data.features.length : -1;
	}, id);
/** Rendered features on the given layers. */
export const rendered = (page: Page, layers: string[]) =>
	page.evaluate((ls) => {
		const m = (window as unknown as { __v2ProbeMap?: ProbeMap }).__v2ProbeMap;
		return m ? m.queryRenderedFeatures({ layers: ls }).length : 0;
	}, layers);
/** Screen position of the first rendered feature on a layer (default: news pins), or null. */
export const pinAt = (page: Page, layer = 'news-pins-layer') =>
	page.evaluate((l) => {
		const m = (window as unknown as { __v2ProbeMap?: ProbeMap }).__v2ProbeMap;
		const pin = m?.queryRenderedFeatures({ layers: [l] })[0];
		if (!m || !pin) return null;
		const p = m.project(pin.geometry.coordinates);
		const r = m.getCanvas().getBoundingClientRect();
		return { x: r.left + p.x, y: r.top + p.y };
	}, layer);
export const mapCenter = (page: Page) =>
	page.evaluate(
		() => (window as unknown as { __v2ProbeMap?: ProbeMap }).__v2ProbeMap?.getCenter() ?? null
	);

/**
 * Saved prefs with the fire cameras off (MAPX4), for specs whose exact in-view lists and counts
 * predate that layer; with it off, nothing reads ALERTCalifornia either. A saved choice wins.
 */
export const camsOff = (page: Page) =>
	page.addInitScript(() => {
		if (localStorage.getItem('mm_sections_v2') === null)
			localStorage.setItem(
				'mm_sections_v2',
				JSON.stringify({ version: 3, open: {}, layers: { cams: false } })
			);
	});
