import { expect, test, type Locator, type Page } from '@playwright/test';
import {
	auditTap,
	fingerTap,
	openPhone,
	preparePhone,
	record,
	swipe
} from './fixtures/phone-audit';

/**
 * MOBILE1: every control on the phone dashboard, tapped on an iPhone (WebKit) and a Pixel
 * (Chromium), with its real outcome asserted. Rows land in test-results/phone-audit/.
 */
const PAGE = '/';
const stories = (page: Page) => page.locator('.v2-news-title');
const toggle = (page: Page, id: string) => page.locator(`[data-section-toggle="${id}"]`);
const body = (page: Page, id: string) => page.locator(`#${id} .v2-section-body`);
const SECTIONS = ['getting-around', 'outdoors', 'news', 'cost', 'events'] as const;

test.beforeEach(async ({ page }) => {
	await preparePhone(page);
	await openPhone(page, PAGE, stories(page));
	await expect(page.locator('[data-hydrated="true"]')).toBeVisible();
	await expect(page.locator('a.cam-tile').first()).toBeVisible();
});

/** Each link taps through to its href: a new tab for target=_blank, else this tab. */
async function auditLinks(
	page: Page,
	info: Parameters<typeof auditTap>[1],
	state: string,
	links: Locator
) {
	const failures: string[] = [];
	for (const link of await links.all()) {
		if (!(await link.isVisible())) continue;
		const href = (await link.getAttribute('href'))!;
		const label = (await link.innerText()).trim().replace(/\s+/g, ' ').slice(0, 48);
		const blank = (await link.getAttribute('target')) === '_blank';
		const url = new URL(href, page.url()).href;
		let popup: Page | null = null;
		const onPopup = (p: Page) => (popup = p);
		page.on('popup', onPopup);
		// Getting Around's status lines sit 23 px apart: their links have 41 px with data, 29 px
		// when 511 is unavailable (CI), not 44, until Stuart rules on taller lines (over the
		// section's height budget). The floor keeps that from getting worse unnoticed.
		const line = await link.evaluate((el) => !!el.closest('.ga-line'));
		const why = await auditTap(page, info, {
			page: PAGE,
			state,
			control: `link "${label}"`,
			target: link,
			smallOk: line
				? { reason: 'Getting Around line link (41 px, 29 if 511 is down)', min: 28 }
				: undefined,
			outcome: blank
				? async () => expect.poll(() => popup?.url(), { timeout: 3_000 }).toBe(url)
				: async () => expect(page).toHaveURL(url, { timeout: 3_000 }),
			undo: blank
				? async () => {
						await popup!.close();
					}
				: async () => {
						await page.goBack();
						await expect(page.locator('[data-hydrated="true"]')).toBeVisible();
					}
		});
		page.off('popup', onPopup);
		failures.push(...why.map((w) => `${label}: ${w}`));
	}
	return failures;
}

test('@phone the first paint carries the stories (the phone server read its snapshot)', async ({
	request
}) => {
	const html = await (await request.get(PAGE)).text();
	expect(html.match(/class="v2-news-title/g)?.length ?? 0).toBeGreaterThanOrEqual(5);
});

test.describe('@phone dashboard controls', () => {
	test('header: town picker opens its list, picks a town, and goes back to all of Marin', async ({
		page
	}, info) => {
		const trigger = page.locator('.v2-header .picker-trigger');
		const list = page.getByRole('listbox', { name: 'Marin towns' });
		const failures = await auditTap(page, info, {
			page: PAGE,
			state: 'default',
			control: 'town picker',
			target: trigger,
			outcome: async () => {
				await expect(list).toBeVisible({ timeout: 2_000 });
				await expect(list.getByRole('option', { name: /Larkspur/ })).toBeVisible();
			}
		});
		failures.push(
			...(await auditTap(page, info, {
				page: PAGE,
				state: 'picker open',
				control: 'town option (Larkspur)',
				target: list.getByRole('option', { name: /Larkspur/ }),
				outcome: async () => {
					await expect(trigger).toContainText('Larkspur', { timeout: 2_000 });
					await expect(list).toHaveCount(0);
				},
				undo: async () => {
					await trigger.tap();
					await list.getByRole('option', { name: /All of Marin/ }).tap();
					await expect(trigger).toContainText('All of Marin');
				}
			}))
		);
		expect(failures).toEqual([]);
	});

	test('header: settings opens, each setting takes effect, and it closes', async ({
		page
	}, info) => {
		test.slow(); // many controls, each tapped, checked and undone
		const trigger = page.getByRole('button', { name: 'Dashboard settings' });
		const panel = page.getByRole('group', { name: 'Dashboard settings' });
		const failures = await auditTap(page, info, {
			page: PAGE,
			state: 'default',
			control: 'settings ⚙',
			target: trigger,
			outcome: async () => expect(panel.getByText('UI scale')).toBeVisible({ timeout: 2_000 })
		});
		const light = panel.getByRole('radio', { name: /light/i });
		failures.push(
			...(await auditTap(page, info, {
				page: PAGE,
				state: 'settings open',
				control: 'theme radio (light)',
				target: light,
				outcome: async () =>
					expect(page.locator('html')).toHaveAttribute('data-theme', 'light', { timeout: 2_000 }),
				undo: async () => {
					await fingerTap(page, panel.getByRole('radio', { name: /dark/i }));
					await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
				}
			}))
		);
		failures.push(
			...(await auditTap(page, info, {
				page: PAGE,
				state: 'settings open',
				control: 'show cameras checkbox',
				target: panel.getByRole('checkbox', { name: 'Show cameras' }),
				outcome: async () =>
					expect(page.getByText('Cameras are hidden.')).toBeVisible({ timeout: 2_000 }),
				undo: async () => {
					await fingerTap(page, panel.getByRole('checkbox', { name: 'Show cameras' }));
					await expect(page.locator('a.cam-tile').first()).toBeVisible();
				}
			}))
		);
		failures.push(
			...(await auditTap(page, info, {
				page: PAGE,
				state: 'settings open',
				control: 'reset sections',
				target: panel.getByRole('button', { name: 'Reset sections' }),
				outcome: async () =>
					expect(panel.getByText('Sections reset to defaults.')).toBeVisible({ timeout: 2_000 })
			}))
		);
		// The selects open the OS picker, which a page can't drive: the tap must focus the select
		// (the picker's cue) and a choice must apply.
		for (const [name, choose, applied] of [
			[
				'UI scale',
				'90',
				async () =>
					expect.poll(() => page.evaluate(() => document.documentElement.style.zoom)).toBe('90%')
			],
			['Default location', null, async () => {}]
		] as const) {
			const select = panel.getByLabel(name);
			failures.push(
				...(await auditTap(page, info, {
					page: PAGE,
					state: 'settings open',
					control: `${name} select`,
					target: select,
					outcome: async () => {
						await expect(select).toBeFocused({ timeout: 2_000 });
						if (choose) {
							await select.selectOption(choose);
							await applied();
							await select.selectOption('100');
						}
					}
				}))
			);
		}
		failures.push(
			...(await auditTap(page, info, {
				page: PAGE,
				state: 'settings open',
				control: 'settings ⚙ (close)',
				target: trigger,
				outcome: async () => expect(panel).toHaveCount(0, { timeout: 2_000 })
			}))
		);
		expect(failures).toEqual([]);
	});

	test('header: the sources indicator lists what is degraded, and closes', async ({
		page
	}, info) => {
		const button = page.locator('.v2-health-button');
		await expect(button).toBeVisible({ timeout: 15_000 });
		const failures = await auditTap(page, info, {
			page: PAGE,
			state: 'default',
			control: 'sources indicator',
			target: button,
			outcome: async () =>
				expect(page.locator('[data-health-list]')).toContainText(/\w{4,}/, { timeout: 2_000 }),
			undo: async () => {
				await button.tap();
				await expect(page.locator('[data-health-list]')).toHaveCount(0);
			}
		});
		expect(failures).toEqual([]);
	});

	test('header: the logo goes to the top; Old dashboard opens the legacy layout', async ({
		page
	}, info) => {
		// The dashboard links to itself: a client navigation that lands at the top.
		await page.evaluate(() => window.scrollTo(0, 600));
		const failures = await auditTap(page, info, {
			page: PAGE,
			state: 'scrolled',
			control: 'logo',
			target: page.locator('a.v2-logo'),
			outcome: async () =>
				expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 3_000 }).toBe(0)
		});
		await expect(page.locator('[data-hydrated="true"]')).toBeVisible();
		failures.push(...(await auditLinks(page, info, 'default', page.locator('a.v2-old'))));
		expect(failures).toEqual([]);
	});

	test('brief: Getting around opens its section in view', async ({ page }, info) => {
		const failures = await auditTap(page, info, {
			page: PAGE,
			state: 'default',
			control: 'brief: Getting around',
			target: page.locator('a.v2-brief-link'),
			outcome: async () => {
				await expect(body(page, 'getting-around')).toContainText('Roads', { timeout: 3_000 });
				await expect(page.locator('#getting-around')).toBeInViewport();
			}
		});
		expect(failures).toEqual([]);
	});

	test('cameras: a tile opens its camera; the strip scrolls sideways', async ({ page }, info) => {
		const failures = await auditLinks(page, info, 'default', page.locator('a.cam-tile').first());
		const row = page.locator('.cams-row');
		await row.scrollIntoViewIfNeeded();
		const box = (await row.boundingBox())!;
		const before = await row.evaluate((el) => el.scrollLeft);
		// A native scroller: a page can only drive it with real touch input (Chromium's CDP).
		if (info.project.name === 'phone-chromium') {
			const y = box.y + box.height / 2;
			await swipe(page, { x: box.x + box.width * 0.85, y }, { x: box.x + box.width * 0.15, y }, 12);
			await expect
				.poll(() => row.evaluate((el) => el.scrollLeft), { timeout: 2_000 })
				.toBeGreaterThan(before)
				.catch(() => {});
			const moved = (await row.evaluate((el) => el.scrollLeft)) > before;
			record(info, {
				page: PAGE,
				state: 'default',
				control: 'camera strip swipe',
				result: moved ? 'pass' : 'fail',
				why: moved ? [] : ['the strip did not scroll']
			});
			if (!moved) failures.push('strip swipe: did not scroll');
		}
		expect(failures).toEqual([]);
	});

	test('map preview: Expand map opens /map; the attribution toggles', async ({ page }, info) => {
		const expand = page.locator('a.v2-map-expand');
		await expect(expand).toBeVisible({ timeout: 15_000 });
		const failures = await auditTap(page, info, {
			page: PAGE,
			state: 'default',
			control: 'Expand map',
			target: expand,
			outcome: async () => expect(page).toHaveURL(/\/map/, { timeout: 3_000 }),
			undo: async () => {
				await page.goBack();
				await expect(page.locator('[data-hydrated="true"][data-layout="v2"]')).toBeVisible();
			}
		});
		expect(failures).toEqual([]);
	});

	test('latest reporting: every story opens its link', async ({ page }, info) => {
		test.slow(); // many controls, each tapped, checked and undone
		const failures = await auditLinks(page, info, 'default', page.locator('#map a.v2-news-title'));
		expect(failures).toEqual([]);
	});

	test('"Which sources" opens its list wherever it shows', async ({ page }, info) => {
		const failures: string[] = [];
		const all = page.locator('details.v2-coverage > summary');
		for (const [i, summary] of (await all.all()).entries()) {
			if (!(await summary.isVisible())) continue;
			const details = all.nth(i).locator('..');
			failures.push(
				...(await auditTap(page, info, {
					page: PAGE,
					state: 'default',
					control: `Which sources #${i + 1}`,
					target: summary,
					outcome: async () => {
						await expect(details).toHaveAttribute('open', '', { timeout: 2_000 });
						await expect(details.locator(':scope > :not(summary)').first()).toBeVisible();
					},
					undo: async () => {
						await summary.tap();
						await expect(details).not.toHaveAttribute('open');
					}
				}))
			);
		}
		expect(failures).toEqual([]);
	});

	for (const id of SECTIONS) {
		test(`section ${id}: its toggle shows real content and hides it again`, async ({
			page
		}, info) => {
			test.slow(); // many controls, each tapped, checked and undone
			const failures = await auditTap(page, info, {
				page: PAGE,
				state: 'collapsed',
				control: `section toggle (${id})`,
				target: toggle(page, id),
				outcome: async () => {
					await expect(body(page, id)).toBeVisible({ timeout: 2_000 });
					// Content, not a bare open state: more than a status line.
					await expect
						.poll(async () => (await body(page, id).innerText()).trim().length, { timeout: 10_000 })
						.toBeGreaterThan(40);
				},
				undo: async () => {
					await toggle(page, id).tap();
					await expect(body(page, id)).toBeHidden();
				}
			});
			// Open again and tap everything inside.
			await toggle(page, id).tap();
			await expect(body(page, id)).toBeVisible();
			await expect
				.poll(async () => (await body(page, id).innerText()).trim().length, { timeout: 10_000 })
				.toBeGreaterThan(40);
			// Its reads in (Getting Around's 511 reads arrive one by one, slowly under load): no
			// line still "Loading…", and the content holds for half a second.
			await expect(body(page, id)).not.toContainText('Loading…', { timeout: 25_000 });
			let text = '';
			await expect
				.poll(
					async () => {
						const last = text;
						text = await body(page, id).innerText();
						return text === last;
					},
					{ timeout: 15_000, intervals: [500] }
				)
				.toBe(true);
			if (id === 'cost') {
				for (const town of ['Mill Valley', 'Ross', 'Larkspur']) {
					const button = body(page, id).getByRole('button', { name: town, exact: true });
					failures.push(
						...(await auditTap(page, info, {
							page: PAGE,
							state: 'expanded',
							control: `Cost: household ${town}`,
							target: button,
							outcome: async () =>
								expect(body(page, id).locator('a.more')).toHaveAttribute(
									'href',
									`/cost/${town.toLowerCase().replace(' ', '-')}`,
									{ timeout: 2_000 }
								)
						}))
					);
				}
			}
			failures.push(
				...(await auditLinks(page, info, 'expanded', body(page, id).locator('a[href]')))
			);
			expect(failures).toEqual([]);
		});
	}

	test('jump bar: each target scrolls into view, opening its section', async ({ page }, info) => {
		const nav = page.getByRole('navigation', { name: 'Jump to' });
		const failures: string[] = [];
		for (const link of await nav.getByRole('link').all()) {
			const label = (await link.innerText()).trim();
			const hash = (await link.getAttribute('href'))!;
			await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
			failures.push(
				...(await auditTap(page, info, {
					page: PAGE,
					state: 'scrolled',
					control: `jump: ${label}`,
					target: link,
					outcome: async () => {
						await expect(page).toHaveURL(new RegExp(`${hash}$`), { timeout: 2_000 });
						await expect(page.locator(hash)).toBeInViewport({ timeout: 2_000 });
					}
				}))
			);
		}
		expect(failures).toEqual([]);
	});

	test('bottom of the page: nothing tappable sits under the jump bar', async ({ page }, info) => {
		test.slow(); // many controls, each tapped, checked and undone
		for (const id of SECTIONS) {
			await toggle(page, id).tap();
			// Its content in, so the page has its final height before it's scrolled to the end.
			await expect
				.poll(async () => (await body(page, id).innerText()).trim().length, { timeout: 10_000 })
				.toBeGreaterThan(40);
		}
		// The sections' data in too: the page's height holds for half a second.
		let height = -1;
		await expect
			.poll(
				async () => {
					const last = height;
					height = await page.evaluate(() => document.documentElement.scrollHeight);
					return height === last;
				},
				{ timeout: 15_000, intervals: [500] }
			)
			.toBe(true);
		// Instant: the end is where the scroll lands, not somewhere on the way.
		await page.evaluate(() =>
			window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' })
		);
		await page.evaluate(
			() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
		);
		// Instant: the page scrolls smoothly, and the end is where the scroll lands, not mid-way.
		await page.evaluate(() =>
			window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' })
		);
		const under = await page.evaluate(() => {
			const bar = document.querySelector('.v2-jump-nav')!.getBoundingClientRect();
			return [
				...document.querySelectorAll('main a[href], main button, main summary, footer a[href]')
			]
				.filter((el) => {
					const r = el.getBoundingClientRect();
					return r.height > 0 && r.bottom > bar.top + 1 && r.top < innerHeight;
				})
				.map((el) => el.textContent!.trim().slice(0, 40));
		});
		record(info, {
			page: PAGE,
			state: 'scrolled to the end',
			control: 'last controls vs the jump bar',
			result: under.length ? 'fail' : 'pass',
			why: under.map((u) => `under the bar: ${u}`)
		});
		expect(under).toEqual([]);
	});
});

test.describe('@phone dashboard hydration', () => {
	test.beforeEach(async ({ page }) => {
		// Undo the outer beforeEach's settled page: these start from a cold navigation.
		await page.goto('about:blank');
	});

	test('a section toggle tapped as soon as it shows is not lost', async ({ page }, info) => {
		// The app's scripts held back 1.5 s: the tap lands on the server's HTML, before hydration,
		// in both browsers (WebKit can't be CPU-throttled).
		await page.route('**/_app/immutable/**/*.js', async (r) => {
			await new Promise((done) => setTimeout(done, 1_500));
			await r.fallback();
		});
		await page.goto(PAGE, { waitUntil: 'commit' });
		const t = toggle(page, 'outdoors');
		await t.waitFor({ state: 'visible' });
		await t.scrollIntoViewIfNeeded();
		const hydratedAtTap = await page.locator('[data-hydrated="true"]').count();
		expect(hydratedAtTap, 'the tap comes before hydration').toBe(0);
		const box = (await t.boundingBox())!;
		await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
		await expect(page.locator('[data-hydrated="true"]')).toBeVisible({ timeout: 15_000 });
		let opened = true;
		try {
			await expect(body(page, 'outdoors')).toBeVisible({ timeout: 3_000 });
		} catch {
			opened = false;
		}
		record(info, {
			page: PAGE,
			state: `first second (hydrated at tap: ${hydratedAtTap ? 'yes' : 'no'})`,
			control: 'early tap: section toggle',
			result: opened ? 'pass' : 'fail',
			why: opened ? [] : ['the tap before hydration was lost']
		});
		expect(opened).toBe(true);
	});

	test('a story tapped as soon as it shows still opens', async ({ page }, info) => {
		let popup: Page | null = null;
		page.on('popup', (p) => (popup = p));
		// The server's HTML alone first: the app's scripts held until the story was tapped there.
		let release!: () => void;
		const held = new Promise<void>((done) => (release = done));
		await page.route('**/_app/immutable/**/*.js', async (r) => {
			await held;
			await r.fallback();
		});
		await page.goto(PAGE, { waitUntil: 'domcontentloaded' });
		const first = page.locator('#map a.v2-news-title').first();
		await first.waitFor({ state: 'visible' });
		// Where a thumb would find it: scrolled to, then tapped at once.
		await first.scrollIntoViewIfNeeded();
		expect(await page.locator('[data-hydrated="true"]').count(), 'tapped before hydration').toBe(0);
		const href = (await first.getAttribute('href'))!;
		const box = (await first.boundingBox())!;
		const pageY = () => first.evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
		const y0 = await pageY();
		await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
		const why: string[] = [];
		try {
			await expect.poll(() => popup?.url(), { timeout: 5_000 }).toBe(new URL(href).href);
		} catch {
			why.push('the early tap opened nothing');
		}
		// Then hydration and the first data: the story stays where the first paint put it.
		release();
		await expect(page.locator('[data-hydrated="true"][data-cycling="false"]')).toBeVisible({
			timeout: 20_000
		});
		const moved = Math.abs((await pageY()) - y0);
		if (moved >= 1) why.push(`the story moved ${Math.round(moved)} px under it`);
		const ok = why.length === 0;
		record(info, {
			page: PAGE,
			state: 'first second',
			control: 'early tap: story link',
			result: ok ? 'pass' : 'fail',
			why
		});
		expect(ok).toBe(true);
	});
});
