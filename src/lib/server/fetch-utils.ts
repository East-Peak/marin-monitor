/**
 * Server-side fetch with timeout via AbortController.
 */
export async function fetchWithTimeout(
	url: string,
	init?: RequestInit,
	timeoutMs = 10000
): Promise<Response> {
	const controller = new AbortController();
	const id = setTimeout(() => controller.abort(), timeoutMs);
	try {
		return await fetch(url, { ...init, signal: controller.signal });
	} finally {
		clearTimeout(id);
	}
}
