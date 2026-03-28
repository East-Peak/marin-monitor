import { env } from '$env/dynamic/private';

interface TokenResponse {
	access_token: string;
	refresh_token: string;
	expires_at: number;
	token_type: string;
}

/**
 * Get a valid Strava access token by refreshing via OAuth.
 *
 * Env vars required: STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, STRAVA_REFRESH_TOKEN
 *
 * If the refresh token rotates, the new one is logged. Stuart must update
 * STRAVA_REFRESH_TOKEN in Vercel env vars manually.
 */
export async function getStravaAccessToken(): Promise<string> {
	const clientId = env.STRAVA_CLIENT_ID;
	const clientSecret = env.STRAVA_CLIENT_SECRET;
	const refreshToken = env.STRAVA_REFRESH_TOKEN;

	if (!clientId || !clientSecret || !refreshToken) {
		throw new Error(
			'[strava-auth] Missing STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, or STRAVA_REFRESH_TOKEN'
		);
	}

	const body = new URLSearchParams({
		client_id: clientId,
		client_secret: clientSecret,
		grant_type: 'refresh_token',
		refresh_token: refreshToken
	});

	const response = await fetch('https://www.strava.com/oauth/token', {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: body.toString()
	});

	if (!response.ok) {
		const body = await response.text();
		throw new Error(`[strava-auth] Token refresh failed: ${response.status} — ${body}`);
	}

	const data = (await response.json()) as TokenResponse;

	if (data.refresh_token !== refreshToken) {
		console.warn(
			`[strava-auth] REFRESH TOKEN ROTATED. New token: ${data.refresh_token.slice(0, 8)}...`
		);
		console.warn('[strava-auth] Update STRAVA_REFRESH_TOKEN in Vercel dashboard.');
	}

	return data.access_token;
}
