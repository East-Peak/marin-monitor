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
