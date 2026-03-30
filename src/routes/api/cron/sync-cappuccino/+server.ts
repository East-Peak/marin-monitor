import { verifyCronAuth } from '$lib/server/cron-auth';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request }) => {
	const authError = verifyCronAuth(request);
	if (authError) return authError;

	return new Response(
		JSON.stringify({
			ok: false,
			disabled: true,
			error: 'Cappuccino sync now runs via GitHub Actions (`scripts/sync-cappuccino.mjs`).'
		}),
		{
			status: 410,
			headers: {
				'Content-Type': 'application/json',
				'Cache-Control': 'no-store'
			}
		}
	);
};
