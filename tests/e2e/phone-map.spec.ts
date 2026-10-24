import { expect, test, type Page } from '@playwright/test';
import {
	auditTap,
	knownBroken,
	openPhone,
	preparePhone,
	record,
	swipe
} from './fixtures/phone-audit';
import { mapCenter, settled } from './fixtures/v2-probe';
import { INSPECTION_CLICK_LAYERS } from '../../src/lib/components/map/map-interactions';

/** MOBILE1: every control on /map, tapped and dragged on an iPhone and a Pixel. */
const PAGE = '/map';
const handle = (page: Page) => page.locator('[data-sheet-handle]');
const count = async (page: Page) => Number((await handle(page).innerText()).match(/\d+/)?.[0]);
const atRest = (page: Page) =>
	expect
		.poll(
			() =>
				page.evaluate(() => {
					const m = (
						window as unknown as {
							__v2ProbeMap?: { isStyleLoaded(): boolean; isMoving(): boolean };
						}
					).__v2ProbeMap;
					return !!m && m.isStyleLoaded() !== false && !m.isMoving();
				}),
			{ timeout: 20_000 }
		)
		.toBe(true);

test.beforeEach(async ({ page }, info) => {
	knownBroken(info);
	await preparePhone(page);
	await openPhone(
		page,
		`${PAGE}?probe`,
		page.locator('[data-layout="explore"][data-hydrated="true"]')
	);
	await expect(handle(page)).toHaveText(/In view · [1-9]/, { timeout: 20_000 });
	await settled(page);
	await atRest(page);
});

test.describe('@phone map controls', () => {
	test('header: ← Dashboard goes home; the town picker opens and picks', async ({ page }, info) => {
		const trigger = page.locator('.picker-trigger');
		const list = page.getByRole('listbox', { name: 'Marin towns' });
		const failures = await auditTap(page, info, {
			page: PAGE,
			state: 'default',
			control: 'town picker',
			target: trigger,
			outcome: async () =>
				expect(list.getByRole('option', { name: /Novato/ })).toBeVisible({ timeout: 2_000 }),
			undo: async () => {
				await trigger.tap();
				await expect(list).toHaveCount(0);
			}
		});
		failures.push(
			...(await auditTap(page, info, {
				page: PAGE,
				state: 'default',
				control: '← Dashboard',
				target: page.locator('a.home'),
				outcome: async () =>
					expect(page.locator('[data-layout="v2"][data-hydrated="true"]')).toBeVisible({
						timeout: 5_000
					})
			}))
		);
		expect(failures).toEqual([]);
	});

	test('Layers: opens its list, and each switch changes what the map lists', async ({
		page
	}, info) => {
		const trigger = page.getByRole('button', { name: 'Layers' });
		const list = page.getByRole('group', { name: 'Map layers' });
		const failures = await auditTap(page, info, {
			page: PAGE,
			state: 'default',
			control: 'Layers',
			target: trigger,
			outcome: async () =>
				expect(list.locator('[data-layer-row]').first()).toBeVisible({ timeout: 2_000 })
		});
		for (const row of await list.locator('[data-layer-row]').all()) {
			const box = row.locator('input[type="checkbox"]');
			if (!(await box.count())) continue;
			const id = (await row.getAttribute('data-layer-row'))!;
			const was = await box.isChecked();
			const layersBefore = new URL(page.url()).searchParams.get('layers');
			failures.push(
				...(await auditTap(page, info, {
					page: PAGE,
					state: 'layers open',
					control: `layer switch (${id})`,
					target: box,
					// The switch is saved in the URL; the map's own sources then change, which
					// the in-view count shows for any layer with features in view.
					outcome: async () => {
						await expect(box).toBeChecked({ checked: !was, timeout: 2_000 });
						await expect
							.poll(() => new URL(page.url()).searchParams.get('layers'), { timeout: 2_000 })
							.not.toBe(layersBefore);
					},
					undo: async () => {
						await box.tap();
						await expect(box).toBeChecked({ checked: was });
					}
				}))
			);
		}
		failures.push(
			...(await auditTap(page, info, {
				page: PAGE,
				state: 'layers open',
				control: 'Layers (close)',
				target: trigger,
				outcome: async () => expect(list).toHaveCount(0, { timeout: 2_000 })
			}))
		);
		expect(failures).toEqual([]);
	});

	test('a pin opens its detail, and Close puts the map back', async ({ page }, info) => {
		// A pin that is topmost at its own point, well inside the canvas and clear of the sheet.
		const at = await page.evaluate(
			(layers) => {
				type M = {
					getLayer(id: string): unknown;
					queryRenderedFeatures(
						g?: unknown,
						o?: { layers: string[] }
					): { layer: { id: string }; geometry: { type: string; coordinates: number[] } }[];
					project(c: number[]): { x: number; y: number };
					getCanvas(): HTMLCanvasElement;
				};
				const m = (window as unknown as { __v2ProbeMap: M }).__v2ProbeMap;
				const ls = layers.filter((l) => m.getLayer(l));
				const r = m.getCanvas().getBoundingClientRect();
				for (const f of m.queryRenderedFeatures(undefined, { layers: ls })) {
					if (f.geometry.type !== 'Point') continue;
					const p = m.project(f.geometry.coordinates);
					if (p.x < 40 || p.y < 80 || p.x > r.width - 40 || p.y > r.height - 120) continue;
					const top = m.queryRenderedFeatures([p.x, p.y], { layers: ls })[0];
					if (
						top?.layer.id === f.layer.id &&
						document.elementFromPoint(r.left + p.x, r.top + p.y) === m.getCanvas()
					)
						return { x: r.left + p.x, y: r.top + p.y, layer: f.layer.id };
				}
				return null;
			},
			INSPECTION_CLICK_LAYERS as unknown as string[]
		);
		expect(at, 'an inspectable pin is drawn').not.toBeNull();
		// Whatever is on top at the pin is what a thumb gets (another layer's pin, a control).
		const dialog = page.getByRole('dialog');
		await page.touchscreen.tap(at!.x, at!.y);
		let opened = true;
		try {
			await expect(dialog).toBeVisible({ timeout: 3_000 });
		} catch {
			opened = false;
		}
		const why = opened ? [] : ['a tap on a pin opened nothing'];
		if (opened) {
			const close = dialog.getByRole('button', { name: 'Close' });
			why.push(
				...(await auditTap(page, info, {
					page: PAGE,
					state: 'detail open',
					control: 'detail Close',
					target: close,
					outcome: async () => expect(dialog).toHaveCount(0, { timeout: 2_000 })
				}))
			);
		}
		record(info, {
			page: PAGE,
			state: 'default',
			control: `map pin (${at!.layer})`,
			result: opened ? 'pass' : 'fail',
			why: opened ? [] : why
		});
		expect(why).toEqual([]);
	});

	test('a drag pans the map', async ({ page }, info) => {
		const canvas = (await page.locator('.v2-map-canvas canvas').boundingBox())!;
		const before = (await mapCenter(page))!;
		const mid = { x: canvas.x + canvas.width / 2, y: canvas.y + canvas.height * 0.4 };
		await swipe(page, mid, { x: mid.x - 120, y: mid.y + 40 }, 12);
		await atRest(page);
		const after = (await mapCenter(page))!;
		const moved = Math.abs(after.lng - before.lng) + Math.abs(after.lat - before.lat) > 1e-4;
		record(info, {
			page: PAGE,
			state: 'default',
			control: 'map drag (pan)',
			result: moved ? 'pass' : 'fail',
			why: moved ? [] : ['the map did not move']
		});
		expect(moved).toBe(true);
	});

	test('zoom buttons and the attribution', async ({ page }, info) => {
		const zoom = () =>
			page.evaluate(() =>
				(window as unknown as { __v2ProbeMap: { getZoom(): number } }).__v2ProbeMap.getZoom()
			);
		const failures: string[] = [];
		for (const [name, sign] of [
			['Zoom in', 1],
			['Zoom out', -1]
		] as const) {
			const z = await zoom();
			failures.push(
				...(await auditTap(page, info, {
					page: PAGE,
					state: 'default',
					control: name,
					target: page.getByRole('button', { name }),
					outcome: async () => {
						await expect
							.poll(async () => Math.sign((await zoom()) - z), { timeout: 3_000 })
							.toBe(sign);
						await atRest(page);
					}
				}))
			);
		}
		const attrib = page.locator('.maplibregl-ctrl-attrib');
		const wasOpen = await attrib.evaluate((el) => el.classList.contains('maplibregl-compact-show'));
		failures.push(
			...(await auditTap(page, info, {
				page: PAGE,
				state: 'default',
				control: 'attribution ⓘ',
				target: page.locator('summary.maplibregl-ctrl-attrib-button'),
				outcome: async () =>
					expect
						.poll(() => attrib.evaluate((el) => el.classList.contains('maplibregl-compact-show')), {
							timeout: 2_000
						})
						.toBe(!wasOpen)
			}))
		);
		expect(failures).toEqual([]);
	});

	test('the sheet: a tap raises it with the list, a row opens its detail, a tap lowers it', async ({
		page
	}, info) => {
		const rows = page.locator('[data-sheet] [data-in-view-row]');
		const failures = await auditTap(page, info, {
			page: PAGE,
			state: 'peek',
			control: 'sheet handle (tap up)',
			target: handle(page),
			outcome: async () => expect(rows.first()).toBeVisible({ timeout: 2_000 })
		});
		const dialog = page.getByRole('dialog');
		failures.push(
			...(await auditTap(page, info, {
				page: PAGE,
				state: 'half',
				control: 'in-view row',
				target: rows.first(),
				outcome: async () =>
					expect(dialog.locator('[data-detail]')).toBeVisible({ timeout: 2_000 }),
				undo: async () => {
					await dialog.getByRole('button', { name: 'Close' }).tap();
					await expect(dialog).toHaveCount(0);
				}
			}))
		);
		const summary = page.locator('[data-sheet] details > summary').first();
		if (await summary.isVisible()) {
			failures.push(
				...(await auditTap(page, info, {
					page: PAGE,
					state: 'half',
					control: 'Which sources (sheet)',
					target: summary,
					outcome: async () =>
						expect(summary.locator('..')).toHaveAttribute('open', '', { timeout: 2_000 })
				}))
			);
		}
		failures.push(
			...(await auditTap(page, info, {
				page: PAGE,
				state: 'half',
				control: 'sheet handle (tap down)',
				target: handle(page),
				outcome: async () => expect(rows).toHaveCount(0, { timeout: 2_000 })
			}))
		);
		expect(failures).toEqual([]);
	});

	test('the sheet: a swipe up raises it, a swipe down lowers it', async ({ page }, info) => {
		const rows = page.locator('[data-sheet] [data-in-view-row]');
		const failures: string[] = [];
		for (const [dir, dy, check] of [
			['up', -120, () => expect(rows.first()).toBeVisible({ timeout: 2_000 })],
			['down', 120, () => expect(rows).toHaveCount(0, { timeout: 2_000 })]
		] as const) {
			const b = (await handle(page).boundingBox())!;
			const from = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
			await swipe(page, from, { x: from.x, y: from.y + dy });
			let ok = true;
			try {
				await check();
			} catch {
				ok = false;
			}
			record(info, {
				page: PAGE,
				state: dir === 'up' ? 'peek' : 'half',
				control: `sheet swipe ${dir}`,
				result: ok ? 'pass' : 'fail',
				why: ok ? [] : [`a swipe ${dir} did nothing`]
			});
			if (!ok) failures.push(`swipe ${dir}`);
		}
		expect(failures).toEqual([]);
	});

	test('the in-view count follows a pan', async ({ page }, info) => {
		const n = await count(page);
		const canvas = (await page.locator('.v2-map-canvas canvas').boundingBox())!;
		const mid = { x: canvas.x + canvas.width / 2, y: canvas.y + canvas.height * 0.4 };
		// Far out to sea: fewer things in view.
		await swipe(page, mid, { x: mid.x + 300, y: mid.y }, 12);
		await atRest(page);
		let ok = true;
		try {
			await expect.poll(() => count(page), { timeout: 5_000 }).not.toBe(n);
		} catch {
			ok = false;
		}
		record(info, {
			page: PAGE,
			state: 'default',
			control: 'in-view count after a pan',
			result: ok ? 'pass' : 'fail',
			why: ok ? [] : ['the count did not follow the pan']
		});
		expect(ok).toBe(true);
	});
});
