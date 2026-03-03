/**
 * Shared API key accessors for server routes.
 */

import { env } from '$env/dynamic/private';

export function get511ApiKey(): string {
	return env.API_511_KEY || '';
}

export function getNpsApiKey(): string {
	return env.NPS_API_KEY || '';
}

export function getAirnowApiKey(): string {
	return env.AIRNOW_API_KEY || '';
}

export function getGooglePlacesApiKey(): string {
	return env.GOOGLE_PLACES_API_KEY || '';
}

export function getNrelApiKey(): string {
	return env.NREL_API_KEY || '';
}

export function getOpenChargeMapApiKey(): string {
	return env.OPEN_CHARGE_MAP_API_KEY || '';
}
