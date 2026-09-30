import { expect, test, type Page } from '@playwright/test';

const ALL = ['getting-around', 'outdoors', 'news', 'cost', 'events', 'strava'] as const;
const toggle = (page: Page, id: string) => page.locator(`[data-section-toggle="${id}"]`);

async function openV2(page: Page, suffix = '') {
	await page.goto(`/?layout=v2${suffix}`);
	await expect(page.locator('[data-layout="v2"][data-hydrated="true"]')).toBeVisible();
}
async function expanded(page: Page) {
	const out: Record<string, string | null> = {};
	for (const id of ALL) out[id] = await toggle(page, id).getAttribute('aria-expanded');
	return out;
}
const focusedToggle = (page: Page) =>
	page.evaluate(
		() => (document.activeElement as HTMLElement | null)?.dataset.sectionToggle ?? null
	);

test.describe('desktop 1440×900', () => {
	test.use({ viewport: { width: 1440, height: 900 } });

	test('opens everything but Strava at once (no accordion), and closed bodies are not mounted', async ({
		page
	}) => {
		await openV2(page);
		expect(await expanded(page)).toEqual({
			'getting-around': 'true',
			outdoors: 'true',
			news: 'true',
			cost: 'true',
			events: 'true',
			strava: 'false'
		});
		await expect(page.locator('#section-strava-body')).toBeHidden();
		expect(await page.locator('#section-strava-body').innerHTML()).not.toContain('<p');
	});

	test('an explicit toggle is remembered across reloads; a hash open is not saved', async ({
		page
	}) => {
		await openV2(page);
		await toggle(page, 'news').click();
		await expect(toggle(page, 'news')).toHaveAttribute('aria-expanded', 'false');
		await page.reload();
		await expect(page.locator('[data-layout="v2"][data-hydrated="true"]')).toBeVisible();
		await expect(toggle(page, 'news')).toHaveAttribute('aria-expanded', 'false');
		await openV2(page, '#news');
		await expect(toggle(page, 'news')).toHaveAttribute('aria-expanded', 'true');
		await expect.poll(() => focusedToggle(page)).toBe('news');
		expect(
			JSON.parse((await page.evaluate(() => localStorage.getItem('mm_sections_v2'))) ?? '{}')
		).toEqual({
			version: 2,
			open: { news: false }
		});
	});

	test('keyboard: Tab reaches a toggle, Enter and Space operate it', async ({ page }) => {
		await openV2(page);
		// Real Tab navigation from the top of the page, not .focus() (Codex PR 7 #3).
		for (let i = 0; i < 60 && (await focusedToggle(page)) !== 'cost'; i++) {
			await page.keyboard.press('Tab');
		}
		expect(await focusedToggle(page)).toBe('cost');
		await page.keyboard.press('Enter');
		await expect(toggle(page, 'cost')).toHaveAttribute('aria-expanded', 'false');
		await page.keyboard.press('Space');
		await expect(toggle(page, 'cost')).toHaveAttribute('aria-expanded', 'true');
	});

	test('opening #strava loads no Strava data (§13.9)', async ({ page }) => {
		const strava: string[] = [];
		page.on('request', (r) => {
			if (/\/api\/data\/strava/.test(r.url())) strava.push(r.url());
		});
		await openV2(page, '#strava');
		await expect(toggle(page, 'strava')).toHaveAttribute('aria-expanded', 'true');
		await page.waitForTimeout(2_000);
		expect(strava).toEqual([]);
	});
});

test.describe('phone 390×844', () => {
	test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

	test('starts with every section closed and shows the jump-nav', async ({ page }) => {
		await openV2(page);
		expect(Object.values(await expanded(page))).toEqual(ALL.map(() => 'false'));
		await expect(page.getByRole('navigation', { name: 'Jump to' })).toBeVisible();
	});

	test('jump-nav News opens the collapsed section, then focuses it; a re-tap after collapsing reopens it', async ({
		page
	}) => {
		await page.addInitScript(() => {
			// Any focus that lands on a section or its toggle (native fragment focus included,
			// Codex PR 7 #1) records whether that section was already open.
			document.addEventListener('focusin', (e) => {
				const el = e.target as HTMLElement;
				const id = el.dataset?.sectionToggle ?? el.dataset?.section;
				if (!id) return;
				const toggle = document.querySelector(`[data-section-toggle="${id}"]`);
				(window as unknown as { __expandedAtFocus: string[] }).__expandedAtFocus ??= [];
				(window as unknown as { __expandedAtFocus: string[] }).__expandedAtFocus.push(
					toggle?.getAttribute('aria-expanded') ?? ''
				);
			});
		});
		await openV2(page);
		const nav = page.getByRole('navigation', { name: 'Jump to' });
		await nav.getByRole('link', { name: 'News' }).click();
		await expect(toggle(page, 'news')).toHaveAttribute('aria-expanded', 'true');
		await expect.poll(() => focusedToggle(page)).toBe('news');
		const atFocus = await page.evaluate(
			() => (window as unknown as { __expandedAtFocus: string[] }).__expandedAtFocus
		);
		expect(atFocus.length).toBeGreaterThan(0);
		expect(atFocus.filter((v) => v !== 'true')).toEqual([]);
		await toggle(page, 'news').click();
		await expect(toggle(page, 'news')).toHaveAttribute('aria-expanded', 'false');
		await nav.getByRole('link', { name: 'News' }).click(); // same hash: no hashchange
		await expect(toggle(page, 'news')).toHaveAttribute('aria-expanded', 'true');
	});

	test('#cost as a landing opens only Cost, and a reload without the hash forgets it', async ({
		page
	}) => {
		await openV2(page, '#cost');
		const state = await expanded(page);
		expect(
			Object.entries(state)
				.filter(([, v]) => v === 'true')
				.map(([k]) => k)
		).toEqual(['cost']);
		await openV2(page);
		await expect(toggle(page, 'cost')).toHaveAttribute('aria-expanded', 'false');
	});

	test('denied storage: sections still toggle for this page view', async ({ page }) => {
		await page.addInitScript(() => {
			Object.defineProperty(window, 'localStorage', {
				configurable: true,
				get() {
					throw new DOMException('denied', 'SecurityError');
				}
			});
		});
		const errors: string[] = [];
		page.on('pageerror', (e) => errors.push(e.message));
		await openV2(page);
		await toggle(page, 'outdoors').click();
		await expect(toggle(page, 'outdoors')).toHaveAttribute('aria-expanded', 'true');
		expect(errors).toEqual([]);
	});

	test('Reset sections restores the phone defaults, including sections opened by link (Codex r1 #13)', async ({
		page
	}) => {
		await openV2(page);
		await page
			.getByRole('navigation', { name: 'Jump to' })
			.getByRole('link', { name: 'News' })
			.click();
		await expect(toggle(page, 'news')).toHaveAttribute('aria-expanded', 'true');
		await page.getByRole('button', { name: 'Dashboard settings' }).click();
		await page.getByRole('button', { name: 'Reset sections' }).click();
		await expect(toggle(page, 'news')).toHaveAttribute('aria-expanded', 'false');
	});

	test('back/forward between section hashes reopens and focuses the target', async ({ page }) => {
		await openV2(page, '#news');
		await page.evaluate(() => (window.location.hash = '#cost'));
		await expect(toggle(page, 'cost')).toHaveAttribute('aria-expanded', 'true');
		await toggle(page, 'news').click(); // an explicit close
		await page.goBack();
		await expect(toggle(page, 'news')).toHaveAttribute('aria-expanded', 'true');
		await expect.poll(() => focusedToggle(page)).toBe('news');
	});

	test('keyboard focus is never hidden under the jump-nav (Codex PR 7 #3)', async ({ page }) => {
		// A short phone viewport (landscape, or browser chrome shown), so Tab has to scroll.
		await page.setViewportSize({ width: 390, height: 480 });
		await openV2(page);
		for (const t of await page.locator('[data-section-toggle]').all()) await t.click(); // all open: a long page
		await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
		await page.evaluate(() => window.scrollTo(0, 0));
		const hidden: string[] = [];
		for (let i = 0; i < 80; i++) {
			await page.keyboard.press('Tab');
			const r = await page.evaluate(() => {
				const el = document.activeElement as HTMLElement | null;
				const nav = document.querySelector('nav[aria-label="Jump to"]');
				if (!el || !nav || nav.contains(el) || el === document.body) return null;
				const b = el.getBoundingClientRect();
				return {
					name: el.textContent?.trim().slice(0, 30) ?? el.tagName,
					bottom: b.bottom,
					top: b.top,
					navTop: nav.getBoundingClientRect().top
				};
			});
			if (r && (r.bottom > r.navTop || r.top < 0))
				hidden.push(
					`${r.name}: ${Math.round(r.top)}–${Math.round(r.bottom)} vs nav ${Math.round(r.navTop)}`
				);
		}
		expect(hidden).toEqual([]);
	});

	test('the jump-nav never covers the last section toggle', async ({ page }) => {
		await openV2(page);
		await toggle(page, 'strava').scrollIntoViewIfNeeded();
		await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
		const nav = await page.getByRole('navigation', { name: 'Jump to' }).boundingBox();
		const last = await toggle(page, 'strava').boundingBox();
		expect(last!.y + last!.height).toBeLessThanOrEqual(nav!.y);
	});
});
