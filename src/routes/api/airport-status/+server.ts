import { json } from '@sveltejs/kit';
import { fetchWithTimeout } from '$lib/server/fetch-utils';
import type { RequestHandler } from './$types';
import type {
	AirportStatus,
	AirportStatusData,
	AirportOperationalStatus,
	AirportWeather,
	AirportForecastNote,
	DelayInfo,
	FlightCategory,
	TsaWaitTime
} from '$lib/types/airport';

const AIRPORTS = [
	{ code: 'SFO', icao: 'KSFO', name: 'San Francisco Intl' },
	{ code: 'OAK', icao: 'KOAK', name: 'Oakland Intl' },
	{ code: 'STS', icao: 'KSTS', name: 'Santa Rosa (Schulz–Sonoma Co)' }
] as const;

const FAA_NAS_URL = 'https://nasstatus.faa.gov/api/airport-events';
const METAR_URL = `https://aviationweather.gov/api/data/metar?ids=${AIRPORTS.map((a) => a.icao).join(',')}&format=json`;
const TAF_URL = `https://aviationweather.gov/api/data/taf?ids=${AIRPORTS.map((a) => a.icao).join(',')}&format=json`;

// --- Raw API types ---

interface FaaEvent {
	airportCode?: string;
	airport?: string;
	groundStop?: {
		reason?: string;
		endTime?: string;
	};
	groundDelay?: {
		reason?: string;
		avgDelay?: string;
		maxDelay?: string;
	};
	arrivalDelay?: {
		reason?: string;
		trend?: string;
		minDelay?: string;
		maxDelay?: string;
	};
	departureDelay?: {
		reason?: string;
		trend?: string;
		minDelay?: string;
		maxDelay?: string;
	};
	airportClosure?: {
		reason?: string;
	};
	airportConfig?: {
		arrivalRunwayConfig?: string;
		departureRunwayConfig?: string;
		arrivalRate?: number;
	};
}

interface MetarObs {
	icaoId?: string;
	fltCat?: string;
	visib?: number | string;
	wdir?: number;
	wspd?: number;
	wgst?: number;
	temp?: number;
	dewp?: number;
	rawOb?: string;
	reportTime?: string;
	clouds?: { cover?: string; base?: number }[];
}

interface TafForecast {
	icaoId?: string;
	fcsts?: TafPeriod[];
}

interface TafPeriod {
	fltCat?: string;
	timeFrom?: string;
	timeTo?: string;
	visib?: number;
	clouds?: { cover?: string; base?: number }[];
}

// --- Parsing helpers ---

function parseFaaEvents(
	events: FaaEvent[],
	airportCode: string
): { status: AirportOperationalStatus; delays: DelayInfo[]; runwayConfig?: string; arrivalRate?: number } {
	const entry = events.find(
		(e) => (e.airportCode || e.airport || '').toUpperCase() === airportCode
	);

	if (!entry) {
		return { status: 'on-time', delays: [] };
	}

	const delays: DelayInfo[] = [];

	if (entry.airportClosure) {
		delays.push({
			type: 'closure',
			reason: entry.airportClosure.reason
		});
	}

	if (entry.groundStop) {
		delays.push({
			type: 'ground-stop',
			reason: entry.groundStop.reason,
			endTime: entry.groundStop.endTime
		});
	}

	if (entry.groundDelay) {
		delays.push({
			type: 'ground-delay',
			reason: entry.groundDelay.reason,
			avgDelay: entry.groundDelay.avgDelay,
			maxDelay: entry.groundDelay.maxDelay
		});
	}

	if (entry.arrivalDelay) {
		delays.push({
			type: 'arrival-delay',
			reason: entry.arrivalDelay.reason,
			trend: entry.arrivalDelay.trend,
			avgDelay: entry.arrivalDelay.minDelay,
			maxDelay: entry.arrivalDelay.maxDelay
		});
	}

	if (entry.departureDelay) {
		delays.push({
			type: 'departure-delay',
			reason: entry.departureDelay.reason,
			trend: entry.departureDelay.trend,
			avgDelay: entry.departureDelay.minDelay,
			maxDelay: entry.departureDelay.maxDelay
		});
	}

	// Status hierarchy: closure > ground-stop > ground-delay > delays > on-time
	let status: AirportOperationalStatus = 'on-time';
	if (delays.some((d) => d.type === 'closure')) status = 'closed';
	else if (delays.some((d) => d.type === 'ground-stop')) status = 'ground-stop';
	else if (delays.some((d) => d.type === 'ground-delay')) status = 'ground-delay';
	else if (delays.length > 0) status = 'delays';

	const runwayConfig = [
		entry.airportConfig?.arrivalRunwayConfig,
		entry.airportConfig?.departureRunwayConfig
	]
		.filter(Boolean)
		.join(' / ') || undefined;

	return {
		status,
		delays,
		runwayConfig,
		arrivalRate: entry.airportConfig?.arrivalRate
	};
}

function parseMetar(observations: MetarObs[], icao: string): AirportWeather | null {
	const obs = observations.find((o) => o.icaoId === icao);
	if (!obs) return null;

	const fltCat = (obs.fltCat || 'VFR') as FlightCategory;
	const rawVisib = obs.visib;
	const visib = typeof rawVisib === 'string' ? parseFloat(rawVisib) || 10 : (rawVisib ?? 10);
	const ceiling = obs.clouds
		?.filter((c) => c.cover === 'BKN' || c.cover === 'OVC')
		.map((c) => c.base ?? Infinity)
		.sort((a, b) => a - b)[0] ?? null;

	const temp = obs.temp ?? 0;
	const dewp = obs.dewp ?? 0;
	const fogRisk = Math.abs(temp - dewp) <= 3;

	let visStr: string;
	if (visib >= 10) visStr = '10+ mi';
	else if (visib >= 1) visStr = `${visib} mi`;
	else visStr = `${Math.round(visib * 5280)} ft`;

	return {
		fltCat,
		visibility: visStr,
		visibilityNum: visib,
		ceiling: ceiling === Infinity ? null : (ceiling ?? null),
		windSpeed: obs.wspd ?? 0,
		windGust: obs.wgst ?? null,
		windDir: obs.wdir ?? 0,
		temp,
		dewpoint: dewp,
		fogRisk,
		rawMetar: obs.rawOb ?? '',
		observationTime: obs.reportTime ?? new Date().toISOString()
	};
}

function parseTaf(forecasts: TafForecast[], icao: string): AirportForecastNote[] {
	const taf = forecasts.find((f) => f.icaoId === icao);
	if (!taf?.fcsts) return [];

	const now = Date.now();
	const horizon = now + 12 * 60 * 60 * 1000;

	const notes: AirportForecastNote[] = [];
	for (const period of taf.fcsts) {
		const cat = period.fltCat as FlightCategory | undefined;
		if (!cat || (cat !== 'IFR' && cat !== 'LIFR')) continue;

		const from = period.timeFrom ? new Date(period.timeFrom).getTime() : 0;
		const to = period.timeTo ? new Date(period.timeTo).getTime() : 0;
		if (to < now || from > horizon) continue;

		const fromStr = new Date(Math.max(from, now)).toLocaleTimeString('en-US', {
			hour: 'numeric',
			minute: '2-digit',
			timeZone: 'America/Los_Angeles'
		});
		const toStr = new Date(to).toLocaleTimeString('en-US', {
			hour: 'numeric',
			minute: '2-digit',
			timeZone: 'America/Los_Angeles'
		});

		notes.push({
			text: `${cat} conditions expected ${fromStr} \u2013 ${toStr}`,
			from: period.timeFrom ?? '',
			to: period.timeTo ?? '',
			fltCat: cat
		});
	}

	return notes;
}

async function fetchTsa(airportCode: string): Promise<TsaWaitTime[] | null> {
	try {
		const resp = await fetchWithTimeout(
			`http://apps.tsa.dhs.gov/MyTSAWebService/GetTSOWaitTimes.ashx?ap=${airportCode}&output=json`,
			{ redirect: 'manual' },
			5000
		);

		// If redirected or non-200, TSA API is down
		if (resp.status >= 300) return null;

		const contentType = resp.headers.get('content-type') || '';
		if (!contentType.includes('json')) return null;

		const body = await resp.json();
		if (!Array.isArray(body?.WaitTimes)) return null;

		return body.WaitTimes.map((wt: { CheckpointName?: string; WaitTime?: number; Created_Datetime?: string }) => ({
			checkpoint: wt.CheckpointName ?? 'Unknown',
			waitMinutes: wt.WaitTime ?? 0,
			updatedAt: wt.Created_Datetime ?? ''
		}));
	} catch {
		return null;
	}
}

// --- Main handler ---

export const GET: RequestHandler = async () => {
	const [faaResult, metarResult, tafResult, tsaSfoResult, tsaOakResult, tsaStsResult] =
		await Promise.allSettled([
			fetchWithTimeout(FAA_NAS_URL, { headers: { Accept: 'application/json' } }, 10000)
				.then((r) => (r.ok ? r.json() : []))
				.catch(() => []),
			fetchWithTimeout(METAR_URL, { headers: { Accept: 'application/json' } }, 10000)
				.then((r) => (r.ok ? r.json() : []))
				.catch(() => []),
			fetchWithTimeout(TAF_URL, { headers: { Accept: 'application/json' } }, 10000)
				.then((r) => (r.ok ? r.json() : []))
				.catch(() => []),
			fetchTsa('SFO'),
			fetchTsa('OAK'),
			fetchTsa('STS')
		]);

	const faaEvents = (faaResult.status === 'fulfilled' ? faaResult.value : []) as FaaEvent[];
	const metarObs = (metarResult.status === 'fulfilled' ? metarResult.value : []) as MetarObs[];
	const tafData = (tafResult.status === 'fulfilled' ? tafResult.value : []) as TafForecast[];
	const tsaSfo = tsaSfoResult.status === 'fulfilled' ? tsaSfoResult.value : null;
	const tsaOak = tsaOakResult.status === 'fulfilled' ? tsaOakResult.value : null;
	const tsaSts = tsaStsResult.status === 'fulfilled' ? tsaStsResult.value : null;

	const tsaByCode: Record<string, TsaWaitTime[] | null> = { SFO: tsaSfo, OAK: tsaOak, STS: tsaSts };

	const airports: AirportStatus[] = AIRPORTS.map((apt) => {
		const faa = parseFaaEvents(faaEvents, apt.code);
		const weather = parseMetar(metarObs, apt.icao);
		const forecastNotes = parseTaf(tafData, apt.icao);

		return {
			code: apt.code,
			icao: apt.icao,
			name: apt.name,
			status: faa.status,
			delays: faa.delays,
			weather,
			forecastNotes,
			tsa: tsaByCode[apt.code] ?? null,
			runwayConfig: faa.runwayConfig,
			arrivalRate: faa.arrivalRate
		};
	});

	const result: AirportStatusData = {
		airports,
		lastUpdated: new Date().toISOString()
	};

	return json(result, {
		headers: { 'Cache-Control': 'public, max-age=300' }
	});
};
