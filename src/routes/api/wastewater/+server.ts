import { json } from '@sveltejs/kit';
import { fetchWithTimeout } from '$lib/server/fetch-utils';
import type { RequestHandler } from './$types';
import type { WastewaterPathogen, WastewaterData } from '$lib/types';

const RESOURCE_ID = '2742b824-3736-4292-90a9-7fad98e94c06';
const CKAN_BASE = 'https://data.chhs.ca.gov/api/3/action/datastore_search_sql';

const MARIN_SEWERSHEDS = [
	'LGVSD_Inf',
	'NovatoSD',
	'Sausalito_MarinCity_Inf',
	'CMSA_Inf',
	'SMWTP_MillValley'
];

// Service populations from CDPH data (population_served field)
const SEWERSHED_POP: Record<string, number> = {
	LGVSD_Inf: 30000,
	NovatoSD: 53000,
	Sausalito_MarinCity_Inf: 18000,
	CMSA_Inf: 104250,
	SMWTP_MillValley: 30000
};

// pcr_target values → display config. Prefer one gene target per pathogen to avoid double-counting.
const TARGET_MAP: Record<string, { id: string; label: string; geneTarget?: string }> = {
	'sars-cov-2': { id: 'covid', label: 'SARS-CoV-2', geneTarget: 'n' },
	fluav: { id: 'flu_a', label: 'Influenza A', geneTarget: 'infa1' },
	rsv: { id: 'rsv', label: 'RSV' },
	'nov gii': { id: 'norovirus', label: 'Norovirus' }
};

interface CkanRecord {
	sample_collect_date: string;
	wwtp_name: string;
	pcr_target: string;
	pcr_gene_target: string;
	pcr_target_avg_conc: number | null;
	pcr_target_below_lod: string;
}

interface CkanResponse {
	success: boolean;
	result: {
		records: CkanRecord[];
	};
}

function buildSql(): string {
	const plantList = MARIN_SEWERSHEDS.map((s) => `'${s}'`).join(',');
	const targets = Object.keys(TARGET_MAP)
		.map((t) => `'${t}'`)
		.join(',');
	return `SELECT sample_collect_date, wwtp_name, pcr_target, pcr_gene_target, pcr_target_avg_conc, pcr_target_below_lod FROM "${RESOURCE_ID}" WHERE wwtp_name IN (${plantList}) AND pcr_target IN (${targets}) AND sample_collect_date >= (CURRENT_DATE - INTERVAL '60 days') ORDER BY sample_collect_date ASC`;
}

function weeklyAverages(points: { date: string; conc: number }[]): number[] {
	if (points.length === 0) return [];
	const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
	const weeks: number[][] = [];
	let currentWeek: number[] = [];
	let weekStart = new Date(sorted[0].date);

	for (const pt of sorted) {
		const d = new Date(pt.date);
		if (d.getTime() - weekStart.getTime() >= 7 * 24 * 60 * 60 * 1000) {
			if (currentWeek.length > 0) weeks.push(currentWeek);
			currentWeek = [];
			weekStart = d;
		}
		currentWeek.push(pt.conc);
	}
	if (currentWeek.length > 0) weeks.push(currentWeek);

	return weeks.map((w) => w.reduce((a, b) => a + b, 0) / w.length);
}

function computeStatus(
	conc: number | null,
	belowLod: boolean,
	targetId: string
): WastewaterPathogen['status'] {
	if (belowLod || conc === null || conc <= 0) return 'not-detected';
	// Thresholds vary by pathogen — use relative scale based on typical ranges
	const thresholds: Record<string, { high: number; moderate: number }> = {
		covid: { high: 1e6, moderate: 1e4 },
		flu_a: { high: 1e5, moderate: 1e3 },
		rsv: { high: 1e5, moderate: 1e3 },
		norovirus: { high: 1e6, moderate: 1e4 }
	};
	const t = thresholds[targetId] ?? { high: 1e6, moderate: 1e4 };
	if (conc >= t.high) return 'high';
	if (conc >= t.moderate) return 'moderate';
	return 'low';
}

function computeTrendDirection(trend: number[]): WastewaterPathogen['trendDirection'] {
	if (trend.length < 2) return 'stable';
	const recent = trend.slice(-3);
	const first = recent[0];
	const last = recent[recent.length - 1];
	if (first === 0 && last === 0) return 'stable';
	if (first === 0) return 'rising';
	const change = (last - first) / first;
	if (change > 0.15) return 'rising';
	if (change < -0.15) return 'falling';
	return 'stable';
}

export const GET: RequestHandler = async () => {
	const sql = buildSql();
	const url = `${CKAN_BASE}?sql=${encodeURIComponent(sql)}`;

	let response: Response;
	try {
		response = await fetchWithTimeout(
			url,
			{
				headers: { Accept: 'application/json' }
			},
			15000
		);
	} catch {
		return json({ error: 'CDPH API timeout' }, { status: 502 });
	}

	if (!response.ok) {
		return json(
			{ error: 'CDPH API error' },
			{
				status: response.status,
				headers: { 'Cache-Control': 'no-store' }
			}
		);
	}

	const body = (await response.json()) as CkanResponse;
	if (!body.success || !body.result?.records) {
		return json({ error: 'Invalid CKAN response' }, { status: 502 });
	}

	const records = body.result.records;

	// Group by target → date → population-weighted average across plants
	const byTarget = new Map<
		string,
		Map<string, { weightedSum: number; popSum: number; belowLodCount: number; totalCount: number }>
	>();

	for (const rec of records) {
		const targetKey = rec.pcr_target?.toLowerCase();
		const targetInfo = TARGET_MAP[targetKey];
		if (!targetInfo) continue;

		// Filter to preferred gene target to avoid double-counting subtargets
		if (targetInfo.geneTarget && rec.pcr_gene_target?.toLowerCase() !== targetInfo.geneTarget)
			continue;

		const date = rec.sample_collect_date?.slice(0, 10);
		if (!date) continue;

		if (!byTarget.has(targetKey)) byTarget.set(targetKey, new Map());
		const dateMap = byTarget.get(targetKey)!;

		if (!dateMap.has(date)) {
			dateMap.set(date, { weightedSum: 0, popSum: 0, belowLodCount: 0, totalCount: 0 });
		}
		const entry = dateMap.get(date)!;
		const pop = SEWERSHED_POP[rec.wwtp_name] ?? 10000;
		const conc = Number(rec.pcr_target_avg_conc) || 0;
		const isBelow = rec.pcr_target_below_lod?.toLowerCase() === 'yes';

		entry.weightedSum += conc * pop;
		entry.popSum += pop;
		entry.totalCount++;
		if (isBelow) entry.belowLodCount++;
	}

	const sewershedsFound = new Set(records.map((r) => r.wwtp_name)).size;
	let lastUpdated = '';

	const pathogens: WastewaterPathogen[] = [];

	for (const [targetKey, info] of Object.entries(TARGET_MAP)) {
		const dateMap = byTarget.get(targetKey);
		if (!dateMap || dateMap.size === 0) {
			pathogens.push({
				id: info.id,
				label: info.label,
				status: 'not-detected',
				latestConc: null,
				belowLod: true,
				trend: [],
				trendDirection: 'stable',
				lastSampleDate: ''
			});
			continue;
		}

		const dates = [...dateMap.keys()].sort();
		const points = dates.map((d) => {
			const e = dateMap.get(d)!;
			return { date: d, conc: e.popSum > 0 ? e.weightedSum / e.popSum : 0 };
		});

		const latestDate = dates[dates.length - 1];
		const latestEntry = dateMap.get(latestDate)!;
		const latestConc = latestEntry.popSum > 0 ? latestEntry.weightedSum / latestEntry.popSum : null;
		const belowLod = latestEntry.belowLodCount === latestEntry.totalCount;

		if (latestDate > lastUpdated) lastUpdated = latestDate;

		const trend = weeklyAverages(points);
		const trendDirection = computeTrendDirection(trend);
		const status = computeStatus(latestConc, belowLod, info.id);

		pathogens.push({
			id: info.id,
			label: info.label,
			status,
			latestConc,
			belowLod,
			trend,
			trendDirection,
			lastSampleDate: latestDate
		});
	}

	const result: WastewaterData = {
		pathogens,
		sewershedCount: sewershedsFound || MARIN_SEWERSHEDS.length,
		lastUpdated
	};

	return json(result, {
		headers: { 'Cache-Control': 'public, max-age=21600' }
	});
};
