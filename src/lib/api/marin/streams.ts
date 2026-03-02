/**
 * USGS Water Services adapter — Marin County stream gauges
 *
 * Fetches real-time streamflow and gage height for 7 active Marin creek gauges.
 * Free, no auth required.
 * Docs: https://waterservices.usgs.gov/docs/
 */

import { logger } from '$lib/config/api';
import { fetchWithTimeout } from './fetch-helpers';

export interface StreamGauge {
	siteId: string;
	name: string;
	shortName: string;
	streamflow: number | null; // cubic feet per second
	gageHeight: number | null; // feet
	timestamp: number;
	lat: number;
	lon: number;
}

/** Marin County FIPS code */
const MARIN_FIPS = '06041';

/** Parameter codes: 00060 = streamflow (cfs), 00065 = gage height (ft) */
const PARAMS = '00060,00065';

const USGS_BASE = 'https://waterservices.usgs.gov/nwis/iv/';

/** Short display names for known Marin gauges */
const SHORT_NAMES: Record<string, string> = {
	'11459500': 'Novato Creek',
	'11460000': 'Corte Madera Ck',
	'11460151': 'Redwood Creek',
	'11460400': 'Lagunitas Ck (SPT)',
	'11460600': 'Lagunitas Ck (PR)',
	'11460605': 'Olema Creek',
	'11460750': 'Walker Creek'
};

interface UsgsTimeSeries {
	sourceInfo: {
		siteName: string;
		siteCode: { value: string }[];
		geoLocation: {
			geogLocation: { latitude: number; longitude: number };
		};
	};
	variable: {
		variableCode: { value: string }[];
	};
	values: {
		value: { value: string; dateTime: string }[];
	}[];
}

interface UsgsResponse {
	value: {
		timeSeries: UsgsTimeSeries[];
	};
}

/**
 * Fetch real-time stream gauge readings for all Marin County gauges.
 */
export async function fetchStreamGauges(): Promise<StreamGauge[]> {
	try {
		const params = new URLSearchParams({
			format: 'json',
			countyCd: MARIN_FIPS,
			parameterCd: PARAMS,
			siteStatus: 'active'
		});

		const url = `${USGS_BASE}?${params}`;
		logger.log('USGS-Water', `Fetching stream gauges: ${url}`);

		const response = await fetchWithTimeout(url, {
			headers: { Accept: 'application/json' }
		});

		if (!response.ok) {
			throw new Error(`USGS Water Services failed: ${response.status}`);
		}

		const data: UsgsResponse = await response.json();
		const series = data.value?.timeSeries ?? [];

		// Group time series by site
		const sites = new Map<string, StreamGauge>();

		for (const ts of series) {
			const siteId = ts.sourceInfo.siteCode[0]?.value ?? '';
			const paramCode = ts.variable.variableCode[0]?.value ?? '';
			const latestValue = ts.values[0]?.value?.at(-1);

			if (!siteId || !latestValue) continue;

			if (!sites.has(siteId)) {
				const geo = ts.sourceInfo.geoLocation.geogLocation;
				sites.set(siteId, {
					siteId,
					name: ts.sourceInfo.siteName,
					shortName: SHORT_NAMES[siteId] ?? ts.sourceInfo.siteName.split(',')[0],
					streamflow: null,
					gageHeight: null,
					timestamp: new Date(latestValue.dateTime).getTime(),
					lat: geo.latitude,
					lon: geo.longitude
				});
			}

			const gauge = sites.get(siteId)!;
			const val = parseFloat(latestValue.value);
			if (!isFinite(val) || val < 0) continue;

			if (paramCode === '00060') gauge.streamflow = val;
			if (paramCode === '00065') gauge.gageHeight = val;

			const ts2 = new Date(latestValue.dateTime).getTime();
			if (ts2 > gauge.timestamp) gauge.timestamp = ts2;
		}

		return [...sites.values()].sort((a, b) => a.name.localeCompare(b.name));
	} catch (error) {
		logger.warn('USGS-Water', `Stream gauge fetch failed: ${(error as Error).message}`);
		return [];
	}
}
