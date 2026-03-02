/**
 * Client-side fetch helper with timeout via AbortController.
 */
export async function fetchJson<T>(
	url: string,
	options?: RequestInit,
	timeoutMs = 10000
): Promise<T> {
	const controller = new AbortController();
	const id = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const response = await fetch(url, { ...options, signal: controller.signal });
		if (!response.ok) throw new Error(`HTTP ${response.status}`);
		return (await response.json()) as T;
	} finally {
		clearTimeout(id);
	}
}

/**
 * Client-side fetch helper that returns a Response, with timeout.
 */
export async function fetchWithTimeout(
	url: string,
	options?: RequestInit,
	timeoutMs = 10000
): Promise<Response> {
	const controller = new AbortController();
	const id = setTimeout(() => controller.abort(), timeoutMs);
	try {
		return await fetch(url, { ...options, signal: controller.signal });
	} finally {
		clearTimeout(id);
	}
}
