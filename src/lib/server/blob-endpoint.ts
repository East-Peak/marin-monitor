import { head } from '@vercel/blob';
import { env } from '$env/dynamic/private';
import { fetchWithTimeout } from '$lib/server/fetch-utils';

interface ServeBlobJsonOptions {
	blobKey: string;
	successCacheControl: string;
	timeoutMs?: number;
}

export interface BlobErrorPayload {
	error: 'misconfigured' | 'blob_unavailable' | 'blob_fetch_failed';
	message: string;
	timestamp: string;
	blobKey?: string;
	upstreamStatus?: number;
}

export type BlobReadResult =
	| { ok: true; text: string }
	| { ok: false; error: BlobErrorPayload };

const ERROR_CACHE_CONTROL = 'public, s-maxage=10';

export function blobErrorResponse(payload: BlobErrorPayload): Response {
	return new Response(JSON.stringify(payload), {
		status: 503,
		headers: {
			'Content-Type': 'application/json',
			'Cache-Control': ERROR_CACHE_CONTROL
		}
	});
}

export async function tryReadBlobText(blobKey: string, timeoutMs = 8000): Promise<BlobReadResult> {
	const token = env.BLOB_READ_WRITE_TOKEN;
	const timestamp = new Date().toISOString();

	if (!token) {
		return {
			ok: false,
			error: {
				error: 'misconfigured',
				message: 'BLOB_READ_WRITE_TOKEN not set',
				timestamp
			}
		};
	}

	let downloadUrl: string;
	try {
		const blob = await head(blobKey, { token });
		downloadUrl = blob.downloadUrl;
	} catch (err) {
		return {
			ok: false,
			error: {
				error: 'blob_unavailable',
				message: `Blob not found: ${(err as Error).message}`,
				timestamp,
				blobKey
			}
		};
	}

	let response: Response;
	try {
		response = await fetchWithTimeout(
			downloadUrl,
			{ headers: { Authorization: `Bearer ${token}` } },
			timeoutMs
		);
	} catch (err) {
		return {
			ok: false,
			error: {
				error: 'blob_fetch_failed',
				message: `Blob fetch threw: ${(err as Error).message}`,
				timestamp,
				blobKey
			}
		};
	}

	if (!response.ok) {
		return {
			ok: false,
			error: {
				error: 'blob_fetch_failed',
				message: 'Blob fetch returned non-OK status',
				timestamp,
				blobKey,
				upstreamStatus: response.status
			}
		};
	}

	return { ok: true, text: await response.text() };
}

export async function serveBlobJson(options: ServeBlobJsonOptions): Promise<Response> {
	const result = await tryReadBlobText(options.blobKey, options.timeoutMs);
	if (!result.ok) {
		return blobErrorResponse(result.error);
	}

	return new Response(result.text, {
		headers: {
			'Content-Type': 'application/json',
			'Cache-Control': options.successCacheControl
		}
	});
}
