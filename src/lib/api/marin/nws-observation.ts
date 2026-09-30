/**
 * Latest observation from one NWS station (spec §13.9: observed "now" is
 * kept separate from the forecast, with its station and time).
 */
import { serviceClient } from '$lib/services/client';
import { parseFeedDate } from '$lib/news/feed-date';
import { celsiusToFahrenheit, type ObservedNow } from '$lib/weather/brief';
import type { OwnerOptions } from './fetch-helpers';

interface NwsObservationResponse {
	properties?: {
		timestamp?: string | null;
		textDescription?: string | null;
		temperature?: { value: number | null; qualityControl?: string };
	};
}

export async function fetchLatestObservation(
	station: { id: string; name: string },
	{ signal }: OwnerOptions = {}
): Promise<ObservedNow> {
	const result = await serviceClient.request<NwsObservationResponse>(
		'NWS',
		`/stations/${station.id}/observations/latest`,
		{ accept: 'application/geo+json', signal, revalidateInBackground: false }
	);
	const p = result.data?.properties;
	const observedAt = typeof p?.timestamp === 'string' ? parseFeedDate(p.timestamp) : null;
	if (!p || observedAt === null) throw new Error('NWS observation missing its timestamp');
	const t = p.temperature;
	const tempF =
		t && typeof t.value === 'number' && Number.isFinite(t.value) && t.qualityControl !== 'X'
			? celsiusToFahrenheit(t.value)
			: null;
	return {
		stationName: station.name,
		observedAt,
		tempF,
		text: typeof p.textDescription === 'string' && p.textDescription ? p.textDescription : null
	};
}
