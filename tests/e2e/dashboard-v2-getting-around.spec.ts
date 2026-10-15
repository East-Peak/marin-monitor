import { expect, test, type Page, type Route } from '@playwright/test';
import { stubCams } from './fixtures/cams';

test.skip(
	({ baseURL }) => baseURL?.startsWith('https://') ?? false,
	'stubbed; production uses dashboard-v2-getting-around-prod.spec.ts'
);

const T0 = Math.floor(Date.now() / 1000) * 1000;
const MIN = 60_000;
const iso = (ms: number) => new Date(ms).toISOString();
const json = (r: Route, body: unknown, status = 200) =>
	r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const down = (r: Route) => r.fulfill({ status: 503, body: 'down' });

const gtfs = (alerts: { id: string; title: string; url?: string }[], at = T0 - 2 * MIN) => ({
	Header: { GtfsRealtimeVersion: '1.0', Timestamp: Math.floor(at / 1000) },
	Entities: alerts.map((a) => ({
		Id: a.id,
		Alert: {
			HeaderText: { Translations: [{ Text: a.title }] },
			...(a.url ? { Url: { Translations: [{ Text: a.url }] } } : {})
		}
	}))
});
const MA = [
	{ id: 'n1', title: 'Nighttime bus pad closures', url: 'https://marintransit.gov/closures' },
	{ id: 'n2', title: 'Night Closure - SB Terra Linda' },
	{ id: 'n3', title: 'Night Closure - Lucky Dr' },
	{ id: 'n4', title: 'West End Block Party' }
];
const airport = (code: string, over: Record<string, unknown> = {}) => ({
	code,
	icao: `K${code}`,
	name: code,
	status: 'on-time',
	delays: [],
	weather: null,
	forecastNotes: [],
	tsa: null,
	...over
});
const AIRPORTS = {
	lastUpdated: iso(T0 - 3 * MIN),
	airports: [
		airport('SFO', {
			status: 'ground-delay',
			delays: [{ type: 'ground-delay', reason: 'low ceilings', avgMinutes: 45, maxMinutes: 90 }]
		}),
		airport('OAK', { status: 'unknown' })
	]
};
const TRAFFIC = {
	checkedAt: iso(T0 - MIN),
	upstreamCount: 40,
	unreadable: 0,
	events: [
		{
			id: '511.org/1',
			group: 'to-oak',
			certain: true,
			kind: 'Traffic Hazard',
			road: 'I-580',
			where: 'Westbound east of Central Ave',
			severity: 'Moderate',
			reportedAt: iso(T0 - 25 * MIN)
		},
		{
			id: '511.org/2',
			group: 'to-sfo',
			certain: true,
			kind: 'Traffic Hazard',
			road: 'US-101',
			where: 'Southbound exiting at Cesar Chavez St',
			severity: 'Moderate',
			reportedAt: iso(T0 - 10 * MIN)
		}
	]
};

type Handler = (r: Route) => unknown;
async function stub(
	page: Page,
	over: { transit?: Partial<Record<string, Handler>>; airport?: Handler; traffic?: Handler } = {}
) {
	await page.route(
		/\/api\/(data|nps|health|feeds|article|geocode|calfire)\b|\/api\/news\/snapshot|earthquake\.usgs\.gov|api\.weather\.gov|tidesandcurrents/,
		(r) => r.fulfill({ status: 503, body: 'stubbed' })
	);
	const transit: Record<string, Handler> = {
		GG: (r) => json(r, gtfs([])),
		GF: (r) => json(r, gtfs([])),
		MA: (r) => json(r, gtfs(MA)),
		SA: down,
		AF: (r) => json(r, gtfs([])),
		...over.transit
	};
	await page.route(/\/api\/transit\?/, (r) =>
		transit[new URL(r.request().url()).searchParams.get('agency') ?? '']!(r)
	);
	await page.route('**/api/airport-status', over.airport ?? ((r) => json(r, AIRPORTS)));
	await page.route('**/api/traffic/corridors', over.traffic ?? ((r) => json(r, TRAFFIC)));
	await stubCams(page, { lastModified: T0 - 4 * MIN });
}
function requests(page: Page, path: string): string[] {
	const seen: string[] = [];
	page.on('request', (r) => {
		if (new URL(r.url()).pathname === path) seen.push(r.url());
	});
	return seen;
}
async function openV2(page: Page, hash = '') {
	await page.clock.install({ time: T0 });
	await page.goto(`/?layout=v2${hash}`);
	await expect(page.locator('[data-layout="v2"][data-hydrated="true"]')).toBeVisible();
}
const section = (page: Page) => page.locator('section#getting-around');
const status = (page: Page) => section(page).locator('[data-section-status]');
const ALL_CLEAR = /511 lists no alerts|No incidents listed|No delays reported|on time/i;

test.describe('desktop 1440×900', () => {
	test.use({ viewport: { width: 1440, height: 900 } });

	test('open by default: airports, the routes and transit, honest per source; one request per detail', async ({
		page
	}) => {
		await stub(page);
		const airportReqs = requests(page, '/api/airport-status');
		const trafficReqs = requests(page, '/api/traffic/corridors');
		await openV2(page);
		const s = section(page);
		await expect(s.locator('[data-line="SFO"]')).toHaveText(
			'SFO · Ground delay, avg 45 min, up to 90 min'
		);
		await expect(s.locator('[data-line="OAK"]')).toHaveText('OAK · FAA status unavailable');
		await expect(s.locator('[data-ga="airports"] [data-ga-foot]')).toContainText(
			'FAA · checked 3 min ago'
		);
		const roads = s.locator('[data-ga="roads"] [data-row]');
		await expect(roads).toHaveCount(2);
		await expect(roads.first()).toContainText(
			'Traffic Hazard · I-580 Westbound east of Central Ave'
		);
		await expect(roads.first()).toContainText('Route to OAK · Moderate · reported 25 min ago');
		await expect(s.locator('[data-line="MA"]')).toHaveText('Marin Transit · 4 alerts listed ↗', {
			timeout: 15_000
		});
		// 511's empty or failed lists for Golden Gate and SMART make no claim: their lines link out (Decision 6).
		await expect(s.locator('[data-line="GG"]')).toHaveText(
			'Golden Gate Transit · See goldengate.org ↗'
		);
		await expect(s.locator('[data-line="GG"] a')).toHaveAttribute(
			'href',
			'https://www.goldengate.org/service-alerts/'
		);
		await expect(s.locator('[data-line="SA"]')).toHaveText('SMART · See sonomamarintrain.org ↗');
		const rows = s.locator('[data-ga="transit"] [data-row]');
		await expect(rows).toHaveCount(3);
		await expect(rows.nth(0).locator('a')).toHaveAttribute(
			'href',
			'https://marintransit.gov/closures'
		);
		await expect(rows.nth(1).locator('a')).toHaveCount(0);
		await expect(s.locator('[data-ga="transit"] [data-ga-foot]')).toContainText(
			'1 more · All transit alerts (511) ↗'
		);
		await expect(s.locator('[data-ga="roads"] [data-ga-foot] a')).toHaveAttribute(
			'href',
			'https://511.org/alerts/traffic'
		);
		await expect(status(page)).toHaveText('Partial coverage · FAA status for OAK unavailable');
		await page.waitForTimeout(2_000);
		expect(airportReqs).toHaveLength(1);
		expect(trafficReqs).toHaveLength(1);
		await expect(s.locator('[data-line="OAK"]')).not.toContainText(ALL_CLEAR);
	});

	test('a complete, fresh read with nothing listed says so; the header stays quiet', async ({
		page
	}) => {
		await stub(page, {
			transit: { MA: (r) => json(r, gtfs([])), SA: (r) => json(r, gtfs([])) },
			airport: (r) => json(r, { ...AIRPORTS, airports: [airport('SFO'), airport('OAK')] }),
			traffic: (r) => json(r, { ...TRAFFIC, events: [] })
		});
		await openV2(page);
		const s = section(page);
		await expect(s.locator('[data-line="MA"]')).toHaveText(
			'Marin Transit · 511 lists no alerts ↗',
			{ timeout: 15_000 }
		);
		await expect(
			s.locator('[data-ga="transit"] [data-line]').filter({ hasText: '511 lists no alerts' })
		).toHaveCount(1); // only where 511 is trusted
		await expect(s.locator('[data-ga="roads"] [data-ga-note]')).toHaveText(
			'No incidents listed by 511 on these roads'
		);
		await expect(s.locator('[data-line="SFO"]')).toHaveText('SFO · No delays reported');
		await expect(status(page)).toHaveCount(0);
	});

	test('every source down: each part says so; never an all-clear', async ({ page }) => {
		await stub(page, {
			transit: { GG: down, GF: down, MA: down, SA: down, AF: down },
			airport: down,
			traffic: down
		});
		await openV2(page);
		const s = section(page);
		await expect(s.locator('[data-ga="airports"] [data-ga-note]')).toHaveText(
			'Airport status unavailable'
		);
		await expect(s.locator('[data-ga="roads"] [data-ga-note]')).toHaveText(
			'Traffic incidents unavailable'
		);
		await expect(s.locator('[data-line="MA"]')).toHaveAttribute('data-state', 'unavailable', {
			timeout: 15_000
		});
		await expect(s.locator('[data-ga="transit"] [data-state="reference"]')).toHaveCount(4); // linked agencies: no claim either way
		await expect(status(page)).toHaveText(/^Source unavailable · /);
		await expect(s).not.toContainText(ALL_CLEAR);
	});

	test('an unreadable traffic list with nothing kept is "not verified" and its part says so (Codex r2 #5)', async ({
		page
	}) => {
		await stub(page, { traffic: (r) => json(r, { ...TRAFFIC, unreadable: 2, events: [] }) });
		await openV2(page);
		const roads = section(page).locator('[data-ga="roads"]');
		await expect(roads.locator('[data-ga-note]')).toHaveText('Traffic not verified');
		await expect(roads).toHaveAttribute('data-part-state', 'unknown');
		await expect(roads).not.toContainText(ALL_CLEAR);
	});
});

test.describe('phone 390×844', () => {
	test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

	test('closed by default and asks for nothing; the brief link opens and focuses it, then it loads once; a re-tap after collapsing reopens it', async ({
		page
	}) => {
		await stub(page, { transit: { MA: down } }); // a failing trusted feed gives the closed header something to say
		const airportReqs = requests(page, '/api/airport-status');
		const trafficReqs = requests(page, '/api/traffic/corridors');
		await openV2(page);
		await expect(section(page)).toHaveAttribute('data-open', 'false');
		await expect(status(page)).toHaveText('Source unavailable · Marin Transit', {
			timeout: 15_000
		});
		await page.waitForTimeout(2_000);
		expect([airportReqs.length, trafficReqs.length]).toEqual([0, 0]);

		const link = page.locator('[data-brief-link="getting-around"]');
		const toggle = page.locator('[data-section-toggle="getting-around"]');
		await link.click();
		await expect(section(page)).toHaveAttribute('data-open', 'true');
		await expect(toggle).toBeFocused();
		await expect(section(page).locator('[data-line="SFO"]')).toContainText('Ground delay');
		expect([airportReqs.length, trafficReqs.length]).toEqual([1, 1]);

		await toggle.click();
		await expect(section(page)).toHaveAttribute('data-open', 'false');
		await link.click(); // the same hash again: no hashchange, so only onjump can reopen it
		await expect(section(page)).toHaveAttribute('data-open', 'true');
		// The browser's own same-hash fragment focus lands on the section after onjump's toggle
		// focus (as with the jump-nav re-tap): focus is inside the opened section.
		await expect
			.poll(() =>
				page.evaluate(() => document.activeElement?.closest('section#getting-around') !== null)
			)
			.toBe(true);
		expect([airportReqs.length, trafficReqs.length]).toEqual([1, 1]); // reopened, not refetched

		const overflow = await page.evaluate(
			() => document.documentElement.scrollWidth - window.innerWidth
		);
		expect(overflow).toBeLessThanOrEqual(1);
	});

	test('populated, with long words: every text node is classified at ≥ 12 px; no horizontal overflow at 100% or 150% (Codex r1 #9)', async ({
		page
	}) => {
		const long =
			'Detour-for-Sir-Francis-Drake-Boulevard-eastbound-between-Kentfield-and-Larkspur-Landing-ferry-terminal';
		await stub(page, {
			transit: {
				MA: (r) =>
					json(r, gtfs([{ id: 'n0', title: long, url: `https://marintransit.gov/${long}` }, ...MA]))
			},
			traffic: (r) =>
				json(r, {
					...TRAFFIC,
					events: [
						{ ...TRAFFIC.events[0], id: '511.org/3', where: long, certain: false },
						...TRAFFIC.events
					]
				})
		});
		await openV2(page, '#getting-around');
		const s = section(page);
		await expect(s).toHaveAttribute('data-open', 'true');
		await expect(s.locator('[data-ga="roads"] [data-row]')).toHaveCount(3);
		await expect(s.locator('[data-ga="transit"] [data-row]')).toHaveCount(3, { timeout: 15_000 });
		await expect(s.locator('[data-ga="transit"] [data-row]').first()).toContainText(
			'Detour-for-Sir-Francis'
		);
		const nodes = await s.evaluate((root) => {
			const out: { text: string; role: string | null; px: number }[] = [];
			const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
			for (let n = walker.nextNode(); n; n = walker.nextNode()) {
				const el = n.parentElement;
				if (!el || !n.textContent?.trim() || el.getClientRects().length === 0) continue;
				out.push({
					text: n.textContent.trim().slice(0, 40),
					role: el.closest('[data-text-role]')?.getAttribute('data-text-role') ?? null,
					px: parseFloat(getComputedStyle(el).fontSize)
				});
			}
			return out;
		});
		expect(nodes.length).toBeGreaterThan(20);
		expect(nodes.filter((n) => n.role === null)).toEqual([]);
		expect(nodes.filter((n) => n.px < 12)).toEqual([]);
		for (const zoom of ['1', '1.5']) {
			await page.evaluate((z) => (document.documentElement.style.zoom = z), zoom);
			const overflow = await page.evaluate(
				() => document.documentElement.scrollWidth - window.innerWidth
			);
			expect(overflow, `zoom ${zoom}`).toBeLessThanOrEqual(1);
		}
	});
});
