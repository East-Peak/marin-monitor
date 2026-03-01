import { detectTown } from '$lib/config';
import { logger } from '$lib/config/api';
import type { NewsItem } from '$lib/types';

const SHERIFF_BLOTTER_API = 'https://data.marincounty.gov/resource/ahxi-5nsc.json';
const SHERIFF_BLOTTER_PAGE =
	'https://data.marincounty.gov/Public-Safety/Marin-County-Sheriff-Reported-Crime/ahxi-5nsc';

const CRIME_CODE_LABELS: Record<string, string> = {
	THEFT: 'Theft',
	FRAUD: 'Fraud',
	VANDALISM: 'Vandalism',
	ASSAULT: 'Assault',
	'WARR ARR': 'Warrant arrest',
	'MISC PC': 'Misc. Penal Code violation',
	'VEH CODE': 'Vehicle Code violation',
	'BURG AUTO': 'Vehicle burglary',
	'BURG RES': 'Residential burglary',
	'BURG COMM': 'Commercial burglary',
	'DOM VIOL': 'Domestic violence',
	'CHILD ABUS': 'Child abuse',
	DRUNK: 'Public intoxication',
	HS: 'Health & Safety Code violation',
	MENTAL: 'Mental health response',
	'SUS CIRC': 'Suspicious circumstances',
	'WELFAR CHK': 'Welfare check',
	VTOW: 'Vehicle tow',
	ACHP: 'Assist CHP',
	ALAW: 'Agency assist',
	MCSO: 'Sheriff activity'
};

export interface SheriffCrimeRecord {
	unique_id: string;
	incident_date_time: string;
	crime: string;
	crime_class: string;
	incident_street_address?: string;
	incident_city_town?: string;
	incident_city_town_mapping?: string;
	jurisdiction?: string;
	latitude?: string;
	longitude?: string;
}

function normalizeTown(record: SheriffCrimeRecord): { name?: string; slug?: string } {
	const rawTown = record.incident_city_town_mapping || record.incident_city_town || '';
	const cleanedTown = rawTown
		.toLowerCase()
		.replace(/\bca\b/g, '')
		.replace(/\s+/g, ' ')
		.trim();
	const detected = detectTown(cleanedTown);
	if (detected) return detected;
	if (!cleanedTown) return {};
	return {
		name: cleanedTown
			.split(' ')
			.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
			.join(' '),
		slug: cleanedTown.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
	};
}

function toNumber(value?: string): number | undefined {
	if (!value) return undefined;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : undefined;
}

function isCrimeRecord(record: SheriffCrimeRecord): boolean {
	return !/non-criminal/i.test(record.crime_class || '');
}

function titleCase(value: string): string {
	return value
		.toLowerCase()
		.split(/\s+/)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(' ');
}

export function translateSheriffCrimeLabel(
	record: Pick<SheriffCrimeRecord, 'crime' | 'crime_class'>
): string {
	const code = (record.crime || '').trim().toUpperCase();
	if (!code) return 'Reported incident';

	const mapped = CRIME_CODE_LABELS[code];
	if (mapped) return mapped;

	if (
		record.crime_class &&
		!/all other - criminal|all other - non-criminal|traffic incident/i.test(record.crime_class)
	) {
		return titleCase(record.crime_class.replace(/\s*\/\s*/g, ' / '));
	}

	return titleCase(code.replace(/\bPC\b/g, 'Penal Code').replace(/\bVC\b/g, 'Vehicle Code'));
}

function formatTitle(record: SheriffCrimeRecord): string {
	const crime = translateSheriffCrimeLabel(record);
	const address = (record.incident_street_address || '').trim();
	return address ? `${crime} · ${address}` : crime;
}

function formatDescription(record: SheriffCrimeRecord, town?: string): string {
	const translatedCrime = translateSheriffCrimeLabel(record);
	const pieces = [translatedCrime];
	if (
		record.crime &&
		record.crime.trim() &&
		record.crime.trim().toLowerCase() !== translatedCrime.toLowerCase()
	) {
		pieces.push(`Code ${record.crime.trim()}`);
	}
	if (
		record.crime_class &&
		!/^all other - criminal$/i.test(record.crime_class) &&
		!/^traffic incident$/i.test(record.crime_class)
	) {
		pieces.push(record.crime_class);
	}
	if (town) pieces.push(town);
	if (record.incident_street_address) pieces.push(record.incident_street_address.trim());
	return pieces.join(' · ');
}

function formatSocrataLocalDate(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	const hours = String(date.getHours()).padStart(2, '0');
	const minutes = String(date.getMinutes()).padStart(2, '0');
	const seconds = String(date.getSeconds()).padStart(2, '0');
	return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
}

function recordToNewsItem(record: SheriffCrimeRecord): NewsItem | null {
	if (!record.unique_id || !record.incident_date_time || !isCrimeRecord(record)) return null;

	const timestamp = new Date(record.incident_date_time).getTime();
	if (!Number.isFinite(timestamp)) return null;

	const town = normalizeTown(record);
	const lat = toNumber(record.latitude);
	const lon = toNumber(record.longitude);

	return {
		id: `blotter-${record.unique_id}`,
		title: formatTitle(record),
		link: SHERIFF_BLOTTER_PAGE,
		pubDate: record.incident_date_time,
		timestamp,
		description: formatDescription(record, town.name),
		content: formatDescription(record, town.name),
		source: 'Marin Sheriff Blotter',
		category: 'safety',
		verification: 'official',
		town: town.name,
		townSlug: town.slug,
		lat,
		lon,
		locationConfidence: lat !== undefined && lon !== undefined ? 'approx' : 'town',
		locationEvidence: record.incident_street_address || town.name,
		topics: ['crime', 'blotter']
	};
}

export async function fetchSheriffCrimeBlotter(
	hours: number = 36,
	limit: number = 30
): Promise<NewsItem[]> {
	try {
		const cutoff = formatSocrataLocalDate(new Date(Date.now() - hours * 60 * 60 * 1000));
		const params = new URLSearchParams({
			$select:
				'unique_id,incident_date_time,crime,crime_class,incident_street_address,incident_city_town,incident_city_town_mapping,jurisdiction,latitude,longitude',
			$where: `incident_date_time >= '${cutoff}'`,
			$order: 'incident_date_time DESC',
			$limit: String(limit)
		});

		const url = `${SHERIFF_BLOTTER_API}?${params.toString()}`;
		logger.log('BLOTTER', `Fetching Marin Sheriff blotter: ${url}`);
		const response = await fetch(url, {
			headers: {
				Accept: 'application/json'
			}
		});
		if (!response.ok) throw new Error(`Blotter fetch failed: ${response.status}`);

		const payload = (await response.json()) as SheriffCrimeRecord[];
		return payload
			.map(recordToNewsItem)
			.filter((item): item is NewsItem => !!item)
			.sort((a, b) => b.timestamp - a.timestamp);
	} catch (error) {
		logger.warn('BLOTTER', `Marin Sheriff blotter fetch failed: ${(error as Error).message}`);
		return [];
	}
}
