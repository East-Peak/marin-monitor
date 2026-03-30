/**
 * Shared cron authentication helper.
 * Rejects requests when CRON_SECRET is missing or empty (fail-closed).
 */
import { env } from '$env/dynamic/private';
import { safeEquals } from '$lib/server/request-security';

export function verifyCronAuth(request: Request): Response | null {
	const secret = env.CRON_SECRET;
	if (!secret) {
		return new Response('CRON_SECRET not configured', { status: 500 });
	}
	if (!safeEquals(`Bearer ${secret}`, request.headers.get('authorization'))) {
		return new Response('Unauthorized', { status: 401 });
	}
	return null;
}

export function hasValidCronAuth(request: Request): boolean {
	const secret = env.CRON_SECRET;
	return safeEquals(secret ? `Bearer ${secret}` : null, request.headers.get('authorization'));
}
