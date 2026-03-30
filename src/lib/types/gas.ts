export interface FuelPrice {
	type: 'REGULAR_UNLEADED' | 'MIDGRADE' | 'PREMIUM' | 'DIESEL';
	price: number;
	updateTime?: string;
}

export interface GasStation {
	placeId: string;
	name: string;
	address: string;
	lat: number;
	lon: number;
	fuelPrices: FuelPrice[];
	updateTime?: string;
}

export interface GasPriceSnapshot {
	timestamp: string;
	lastSuccessfulScrapeAt?: string | null;
	stationCount: number;
	avgRegular: number | null;
	avgMidgrade: number | null;
	avgPremium: number | null;
	avgDiesel: number | null;
	minRegular: number | null;
	maxRegular: number | null;
	stations: GasStation[];
}

export interface GasPriceData {
	current: GasPriceSnapshot | null;
	history: GasPriceSnapshot[];
}
