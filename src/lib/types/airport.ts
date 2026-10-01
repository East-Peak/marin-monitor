export type AirportOperationalStatus =
	| 'on-time'
	| 'delays'
	| 'ground-delay'
	| 'ground-stop'
	| 'closed'
	/** The FAA read failed or did not parse — never shown as on time. */
	| 'unknown';

export type FlightCategory = 'VFR' | 'MVFR' | 'IFR' | 'LIFR';

export interface DelayInfo {
	type:
		| 'ground-stop'
		| 'ground-delay'
		| 'arrival-delay'
		| 'departure-delay'
		| 'closure'
		/** A closure announced for later; the airport is open now. */
		| 'scheduled-closure'
		/** Aircraft are being deiced; no delay figure is reported. */
		| 'deicing'
		| 'notice';
	reason?: string;
	avgMinutes?: number;
	maxMinutes?: number;
	trend?: string;
	startTime?: string;
	endTime?: string;
}

export interface AirportWeather {
	fltCat: FlightCategory;
	visibility: string;
	visibilityNum: number;
	ceiling: number | null;
	windSpeed: number;
	windGust: number | null;
	windDir: number;
	temp: number;
	dewpoint: number;
	fogRisk: boolean;
	rawMetar: string;
	observationTime: string;
}

export interface AirportForecastNote {
	text: string;
	from: string;
	to: string;
	fltCat: FlightCategory;
}

export interface TsaWaitTime {
	checkpoint: string;
	waitMinutes: number;
	updatedAt: string;
}

export interface AirportStatus {
	code: string;
	icao: string;
	name: string;
	status: AirportOperationalStatus;
	delays: DelayInfo[];
	weather: AirportWeather | null;
	forecastNotes: AirportForecastNote[];
	tsa: TsaWaitTime[] | null;
	runwayConfig?: string;
	arrivalRate?: number;
}

export interface AirportStatusData {
	airports: AirportStatus[];
	lastUpdated: string;
}
