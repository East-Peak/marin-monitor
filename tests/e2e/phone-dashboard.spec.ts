import { expect, test, type Locator, type Page } from '@playwright/test';
import { auditTap, knownBroken, openPhone, preparePhone, record } from './fixtures/phone-audit';

/**
 * MOBILE1: every control on the phone dashboard, tapped on an iPhone (WebKit) and a Pixel
 * (Chromium), with its real outcome asserted. Rows land in test-results/phone-audit/.
 */
const PAGE = '/';
const stories = (page: Page) => page.locator('.v2-news-title');
const toggle = (page: Page, id: string) => page.locator(`[data-section-toggle="${id}"]`);
const body = (page: Page, id: string) => page.locator(`#${id} .v2-section-body`);
const SECTIONS = ['getting-around', 'outdoors', 'news', 'cost', 'events'] as const;

test.beforeEach(async ({ page }, info) => {
	knownBroken(info);
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
		const why = await auditTap(page, info, {
			page: PAGE,
			state,
			control: `link "${label}"`,
			target: link,
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
					await panel.getByRole('radio', { name: /dark/i }).tap();
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
					await panel.getByRole('checkbox', { name: 'Show cameras' }).tap();
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
		const box = (await row.boundingBox())!;
		const before = await row.evaluate((el) => el.scrollLeft);
		// A native scroller: a page can only drive it with real touch input (Chromium's CDP).
		if (info.project.name === 'phone-chromium') {
			const cdp = await page.context().newCDPSession(page);
			await cdp.send('Input.synthesizeScrollGesture', {
				x: Math.round(box.x + box.width * 0.8),
				y: Math.round(box.y + box.height / 2),
				xDistance: -250,
				gestureSourceType: 'touch',
				speed: 1200
			});
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
		for (const id of SECTIONS) await toggle(page, id).tap();
		await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
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
		await page.goto(PAGE, { waitUntil: 'commit' });
		const t = toggle(page, 'outdoors');
		await t.waitFor({ state: 'visible' });
		const hydratedAtTap = await page.locator('[data-hydrated="true"]').count();
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
		await page.goto(PAGE, { waitUntil: 'commit' });
		const first = page.locator('#map a.v2-news-title').first();
		await first.waitFor({ state: 'visible' });
		const href = (await first.getAttribute('href'))!;
		const box = (await first.boundingBox())!;
		await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
		let ok = true;
		try {
			await expect.poll(() => popup?.url(), { timeout: 5_000 }).toBe(new URL(href).href);
		} catch {
			ok = false;
		}
		record(info, {
			page: PAGE,
			state: 'first second',
			control: 'early tap: story link',
			result: ok ? 'pass' : 'fail',
			why: ok ? [] : ['the early tap opened nothing']
		});
		expect(ok).toBe(true);
	});
});
