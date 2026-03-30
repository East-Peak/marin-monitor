export type ConnectorType = 'J1772' | 'CCS' | 'CHAdeMO' | 'NACS' | 'OTHER';
export type ChargingLevel = 'Level2' | 'DCFast';

export interface EvConnector {
	type: ConnectorType;
	count: number;
	powerKw?: number;
}

export interface ChargingStation {
	stationId: string;
	name: string;
	address: string;
	lat: number;
	lon: number;
	network: string;
	connectors: EvConnector[];
	level2Count: number;
	dcFastCount: number;
	totalPorts: number;
	chargingLevels: ChargingLevel[];
	accessInfo?: string;
	status?: string;
	pricingInfo?: string;
	updateTime?: string;
}

export interface EvChargingSnapshot {
	timestamp: string;
	lastSuccessfulScrapeAt?: string | null;
	stationCount: number;
	dcFastStationCount: number;
	level2StationCount: number;
	totalPorts: number;
	networkBreakdown: Record<string, number>;
	connectorBreakdown: Partial<Record<ConnectorType, number>>;
	stations: ChargingStation[];
}

export interface EvChargingData {
	current: EvChargingSnapshot | null;
	history: EvChargingSnapshot[];
}
