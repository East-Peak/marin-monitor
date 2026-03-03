/**
 * Shared cron authentication helper.
 * Rejects requests when CRON_SECRET is missing or empty (fail-closed).
 */
import { env } from '$env/dynamic/private';

export function verifyCronAuth(request: Request): Response | null {
	const secret = env.CRON_SECRET;
	if (!secret) {
		return new Response('CRON_SECRET not configured', { status: 500 });
	}
	if (request.headers.get('authorization') !== `Bearer ${secret}`) {
		return new Response('Unauthorized', { status: 401 });
	}
	return null;
}
