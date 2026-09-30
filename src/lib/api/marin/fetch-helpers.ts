/** An owner lifetime (e.g. a destroyed dashboard or panel): once `signal` aborts, no further request starts. */
export interface OwnerOptions {
	signal?: AbortSignal;
}

/**
 * Run `fetch`, then `read` the response, under a timeout that also honours the caller's
 * own signal (an owner lifetime such as a destroyed dashboard): whichever fires first
 * aborts the request, including a body that is still being read.
 */
async function fetchWithDeadline<T>(
	url: string,
	options: RequestInit | undefined,
	timeoutMs: number,
	read: (response: Response) => Promise<T>
): Promise<T> {
	const controller = new AbortController();
	const id = setTimeout(() => controller.abort(), timeoutMs);
	const owner = options?.signal;
	const abortFromOwner = () => controller.abort();
	if (owner?.aborted) controller.abort();
	else owner?.addEventListener('abort', abortFromOwner, { once: true });
	try {
		return await read(await fetch(url, { ...options, signal: controller.signal }));
	} finally {
		clearTimeout(id);
		owner?.removeEventListener('abort', abortFromOwner);
	}
}

/**
 * Client-side fetch helper with timeout via AbortController.
 */
export async function fetchJson<T>(
	url: string,
	options?: RequestInit,
	timeoutMs = 10000
): Promise<T> {
	return fetchWithDeadline(url, options, timeoutMs, async (response) => {
		if (!response.ok) throw new Error(`HTTP ${response.status}`);
		return (await response.json()) as T;
	});
}

/**
 * Client-side fetch helper that returns a Response, with timeout.
 */
export async function fetchWithTimeout(
	url: string,
	options?: RequestInit,
	timeoutMs = 10000
): Promise<Response> {
	return fetchWithDeadline(url, options, timeoutMs, async (response) => response);
}

/**
 * fetch + read under ONE lifetime: the owner signal and the deadline stay attached to
 * the request until `read` finishes, so a stalled body is cancelled too. Use this, not
 * fetchWithTimeout, whenever a body is read under an owner.
 */
export function fetchAndRead<T>(
	url: string,
	options: RequestInit | undefined,
	read: (response: Response) => Promise<T>,
	timeoutMs = 10_000
): Promise<T> {
	return fetchWithDeadline(url, options, timeoutMs, read);
}
