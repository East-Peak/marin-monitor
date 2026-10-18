import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SheriffCrimeRecord } from './blotter';

// The real liveData: a cached copy after a failed read must reach the reader as a failure.
vi.mock('$lib/services/client', async (orig) => ({
	...(await orig<object>()),
	serviceClient: { request: vi.fn() }
}));
vi.mock('$lib/config/api', () => ({ logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const { serviceClient } = await import('$lib/services/client');
const { readSheriffBlotterOrThrow, shownReport, BLOTTER_LIMIT } = await import('./blotter');
const request = vi.mocked(serviceClient.request);

// 3:20 PM PDT, Sunday Oct 18.
const NOW = Date.parse('2026-10-18T15:20:00-07:00');
const record = (over: Partial<SheriffCrimeRecord> = {}): SheriffCrimeRecord => ({
	unique_id: 'SO260002627',
	incident_date_time: '2026-10-17T17:32:00.000',
	crime: 'THEFT',
	crime_class: 'THEFT',
	incident_street_address: '5XX THE ALAMEDA',
	incident_city_town: 'SLEEPY HOLLOW',
	incident_city_town_mapping: 'SAN ANSELMO',
	jurisdiction: 'SO',
	latitude: '37.9987830',
	longitude: '-122.5712470',
	...over
});
const served = (data: SheriffCrimeRecord[], fromCache: false | 'stale-fallback' = false) =>
	request.mockResolvedValueOnce({ data, fromCache } as never);
const read = () => readSheriffBlotterOrThrow({ now: () => NOW });

const ORIGINAL_TZ = process.env.TZ;
afterEach(() => {
	request.mockReset();
	if (ORIGINAL_TZ === undefined) delete process.env.TZ;
	else process.env.TZ = ORIGINAL_TZ;
});

describe('shownReport: only property and public-place reports are shown (NEWSPIN1)', () => {
	it.each([
		'THEFT',
		'SHOPLIFTNG',
		'BURG AUTO',
		'BURG COMM',
		'BURG RES',
		'VANDALISM',
		'STOLEN PRP',
		'TRESPASS'
	])('%s is shown', (crime) => expect(shownReport({ crime })).toBe(true));
	it.each(['DOM VIOL', 'CHILD ABUS', 'MENTAL', 'MISS PERS', 'BODY', 'TRO', 'ASSAULT', ''])(
		'%s is not',
		(crime) => expect(shownReport({ crime })).toBe(false)
	);
	it('reads the code as the county writes it, padded or not', () => {
		expect(shownReport({ crime: ' theft ' })).toBe(true);
	});
});

describe('readSheriffBlotterOrThrow (NEWSPIN1)', () => {
	it('asks for a live read only: no cache, no background refresh, the owner’s signal', async () => {
		served([]);
		const owner = new AbortController();
		await readSheriffBlotterOrThrow({ signal: owner.signal, now: () => NOW });
		expect(request.mock.calls[0][2]).toMatchObject({
			signal: owner.signal,
			useCache: false,
			revalidateInBackground: false
		});
	});

	it('asks from 36 h back on the Pacific hour, whatever the browser’s zone', async () => {
		process.env.TZ = 'Asia/Tokyo';
		served([]);
		await read();
		const params = request.mock.calls[0][2]?.params as Record<string, unknown>;
		// 3:20 PM Oct 18 PDT, on the hour, less 36 h: 3:00 AM Oct 17 Pacific wall time.
		expect(params.$where).toBe("incident_date_time >= '2026-10-17T03:00:00'");
		expect(params.$limit).toBe(BLOTTER_LIMIT);
	});

	it('throws when the upstream fails', async () => {
		request.mockRejectedValueOnce(new Error('HTTP 500'));
		await expect(read()).rejects.toThrow('HTTP 500');
	});

	it('throws on a cached copy served after a failed read (stale-fallback)', async () => {
		served([record()], 'stale-fallback');
		await expect(read()).rejects.toThrow();
	});

	it('an empty read is a successful read of nothing, timed now', async () => {
		served([]);
		expect(await read()).toEqual({ reports: [], hiddenAt: [], capped: false, observedAt: NOW });
	});

	it('parses the county’s wall time as Pacific, whatever the browser’s zone', async () => {
		process.env.TZ = 'Asia/Tokyo';
		served([record()]);
		const { reports } = await read();
		expect(reports[0].timestamp).toBe(Date.parse('2026-10-17T17:32:00-07:00'));
	});

	it('counts a report outside the allowlist without showing it', async () => {
		served([
			record(),
			record({
				unique_id: 'SO2',
				crime: 'DOM VIOL',
				crime_class: 'ASSAULT',
				incident_date_time: '2026-10-18T09:15:00.000'
			})
		]);
		const out = await read();
		expect(out.reports.map((r) => r.id)).toEqual(['blotter-SO260002627']);
		expect(out.hiddenAt).toEqual([Date.parse('2026-10-18T09:15:00-07:00')]);
	});

	it('places a report on its town with the masked address as text, never the county’s point', async () => {
		served([
			record({ unique_id: 'A', latitude: '37.9987830', longitude: '-122.5712470' }),
			record({ unique_id: 'B', latitude: '37.9991234', longitude: '-122.5699999' })
		]);
		const [a, b] = (await read()).reports;
		for (const r of [a, b]) {
			expect(r.lat).toBeUndefined();
			expect(r.lon).toBeUndefined();
			expect(r.locationConfidence).toBe('town');
		}
		const { id: _a, ...restA } = a;
		const { id: _b, ...restB } = b;
		expect(restA).toEqual(restB);
		expect(a).toMatchObject({
			title: 'Theft · 5XX The Alameda',
			locationEvidence: '5XX The Alameda',
			townSlug: 'san-anselmo'
		});
	});

	it('says when the row cap was hit: only the latest are known', async () => {
		served(Array.from({ length: BLOTTER_LIMIT }, (_, i) => record({ unique_id: `R${i}` })));
		expect((await read()).capped).toBe(true);
	});
});
