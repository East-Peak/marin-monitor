// src/lib/types/driveway.ts

/** Fuel type classification for registered vehicles */
export type FuelType =
	| 'gasoline'
	| 'battery-electric'
	| 'hybrid'
	| 'plug-in-hybrid'
	| 'diesel'
	| 'flex-fuel'
	| 'hydrogen'
	| 'other';

/** A vehicle make with its total registration count */
export interface MakeCount {
	make: string;
	count: number;
}

/** A fuel type with its count and percentage of total registrations */
export interface FuelBreakdown {
	fuelType: FuelType;
	count: number;
	pct: number;
}

/** Fun-stat counts for notable makes and fuel types */
export interface DrivewayFunStats {
	rivian: number;
	lucid: number;
	porsche: number;
	tesla: number;
	hydrogen: number;
}

/** A point-in-time snapshot of Marin vehicle registration data */
export interface DrivewaySnapshot {
	timestamp: string;
	/** The calendar year of the DMV data */
	dataYear: number;
	totalVehicles: number;
	topMakes: MakeCount[];
	fuelBreakdown: FuelBreakdown[];
	funStats: DrivewayFunStats;
}

/** Top-level Blob shape (mirrors CoffeeData / SchoolIndexData pattern) */
export interface DrivewayData {
	current: DrivewaySnapshot | null;
	/** History entries (one per data year, capped) */
	history: Array<{
		timestamp: string;
		dataYear: number;
		totalVehicles: number;
		topMakes: MakeCount[];
		fuelBreakdown: FuelBreakdown[];
		funStats: DrivewayFunStats;
	}>;
}
