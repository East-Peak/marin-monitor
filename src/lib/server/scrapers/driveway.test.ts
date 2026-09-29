import { describe, expect, it, vi } from 'vitest';
import { computeDrivewaySnapshot, selectNewestResource } from './driveway';

const RES_2026 = {
	id: 'b459d957-5d94-4b10-999d-770419870364',
	name: '1/1/2026 Vehicle Fuel Type Count by Zip Code',
	datastore_active: true
};
const RESOURCES = [
	RES_2026,
	{
		id: '66b0121e-5eab-4fcf-aa0d-2b1dfb5510ab',
		name: '1/1/2025 Vehicle Fuel Type Count by Zip Code',
		datastore_active: true
	},
	{ id: 'dict', name: 'Data Dictionary', datastore_active: false }
];
const FIELDS = ['_id', 'Date', 'ZIP Code', 'Model Year', 'Fuel', 'Make', 'Duty', 'Vehicles'].map(
	(id) => ({ id, type: 'text' })
);
const MAKES = [
	{ Make: 'TOYOTA', total: '26000' },
	{ Make: 'TESLA', total: '9000' },
	{ Make: 'OTHER/UNK', total: '500' }
];
const FUELS = [
	{ Fuel: 'Gasoline', total: '153992' },
	{ Fuel: 'Battery Electric', total: '20405' },
	{ Fuel: 'Hybrid Gasoline', total: '18816' },
	{ Fuel: 'Plug-in Hybrid', total: '6499' },
	{ Fuel: 'Diesel and Diesel Hybrid', total: '6085' },
	{ Fuel: 'Flex-Fuel', total: '4560' },
	{ Fuel: 'Hydrogen Fuel Cell', total: '52' },
	{ Fuel: 'Natural Gas', total: '15' },
	{ Fuel: 'Other', total: '3' }
];

const ok = (result: unknown) =>
	new Response(JSON.stringify({ success: true, result }), { status: 200 });

function ckan(
	overrides: { resources?: object[]; fields?: object[]; fuels?: object[]; makes?: object[] } = {}
) {
	return vi.fn(async (input: string | URL) => {
		const url = new URL(String(input));
		if (url.pathname.endsWith('/package_show'))
			return ok({ resources: overrides.resources ?? RESOURCES });
		if (url.pathname.endsWith('/datastore_search'))
			return ok({ fields: overrides.fields ?? FIELDS, records: [] });
		const sql = url.searchParams.get('sql') ?? '';
		return ok({
			records: sql.includes('"Make"') ? (overrides.makes ?? MAKES) : (overrides.fuels ?? FUELS)
		});
	});
}

describe('selectNewestResource', () => {
	it('picks the newest 1/1/YYYY datastore resource and reads its year from the name', () => {
		expect(selectNewestResource(RESOURCES)).toEqual({ id: RES_2026.id, year: 2026 });
	});

	it('refuses to fall back to an older release when the newest is not queryable', () => {
		const resources = [{ ...RES_2026, datastore_active: false }, RESOURCES[1]];
		expect(() => selectNewestResource(resources)).toThrow(/2026.*not queryable/);
	});

	it('rejects a resource id that is not a UUID before it reaches SQL', () => {
		const resources = [{ ...RES_2026, id: 'x" ; DROP TABLE t; --' }];
		expect(() => selectNewestResource(resources)).toThrow(/resource id/);
	});

	it('throws when the package has no usable resource', () => {
		expect(() => selectNewestResource([RESOURCES[2]])).toThrow(/no datastore resource/);
	});
});

describe('computeDrivewaySnapshot', () => {
	it('queries the newest resource by the live column names, never the retired fixed ID', async () => {
		const fetchImpl = ckan();
		const snapshot = await computeDrivewaySnapshot(fetchImpl);
		const sqls = fetchImpl.mock.calls
			.map(([u]) => new URL(String(u)).searchParams.get('sql'))
			.filter(Boolean) as string[];
		expect(sqls).toHaveLength(2);
		for (const sql of sqls) {
			expect(sql).toContain(`FROM "${RES_2026.id}"`);
			expect(sql).toContain('"ZIP Code" IN (');
			expect(sql).toContain('SUM("Vehicles"::int)');
			expect(sql).not.toContain('52a74e3a-6bc4-4068-a28c-c1a81e637811');
		}
		expect(snapshot.dataYear).toBe(2026);
		expect(snapshot.lastSuccessfulScrapeAt).toBe(snapshot.timestamp);
	});

	it('produces Marin totals within tolerance of the 2024 reference (210,586)', async () => {
		const snapshot = await computeDrivewaySnapshot(ckan());
		expect(snapshot.totalVehicles).toBe(210_427);
		expect(Math.abs(snapshot.totalVehicles - 210_586) / 210_586).toBeLessThan(0.15);
		expect(snapshot.topMakes.map((m) => m.make)).toEqual(['Toyota', 'Tesla']);
	});

	it('maps the current DMV fuel labels (no more "(BEV)"/"(PHEV)" suffixes)', async () => {
		const { fuelBreakdown, funStats } = await computeDrivewaySnapshot(ckan());
		const byType = Object.fromEntries(fuelBreakdown.map((f) => [f.fuelType, f.count]));
		expect(byType['battery-electric']).toBe(20405);
		expect(byType['plug-in-hybrid']).toBe(6499);
		expect(funStats.hydrogen).toBe(52);
	});

	it('throws when a column the SQL needs is missing from the resource', async () => {
		const fields = FIELDS.filter((f) => f.id !== 'Vehicles');
		await expect(computeDrivewaySnapshot(ckan({ fields }))).rejects.toThrow(/Vehicles/);
	});

	it('throws on an implausible Marin total rather than publishing it', async () => {
		const fuels = [{ Fuel: 'Gasoline', total: '1200' }];
		await expect(computeDrivewaySnapshot(ckan({ fuels }))).rejects.toThrow(/implausible/);
	});

	it('throws when the make aggregate comes back empty', async () => {
		await expect(computeDrivewaySnapshot(ckan({ makes: [] }))).rejects.toThrow(/makes/);
	});

	it('throws when CKAN is down — no hardcoded fallback is ever returned', async () => {
		const fetchImpl = vi.fn(async () => new Response('down', { status: 503 }));
		await expect(computeDrivewaySnapshot(fetchImpl)).rejects.toThrow(/503/);
	});
});
