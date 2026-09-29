/**
 * Bounded upstream fetch for the news producer. One deadline covers
 * connect, headers, every redirect hop AND body consumption; the body is
 * capped by bytes actually read, not by Content-Length alone; redirects are
 * followed manually and each hop must stay on the allowlist over https.
 * Never throws — every failure is a typed result.
 */
import { abortable } from './abortable';

export interface BoundedFetchLimits {
	deadlineMs: number;
	maxBytes: number;
	maxRedirects: number;
}

export const FEED_FETCH_LIMITS: BoundedFetchLimits = {
	deadlineMs: 10_000,
	maxBytes: 2_000_000,
	maxRedirects: 3
};

export type BoundedFetchFailure =
	| 'invalid-url'
	| 'host-not-allowed'
	| 'redirect-not-allowed'
	| 'too-many-redirects'
	| 'http-status'
	| 'too-large'
	| 'timeout'
	| 'network';

export type BoundedFetchResult =
	| { ok: true; text: string; finalUrl: string; bytes: number }
	| { ok: false; reason: BoundedFetchFailure; detail: string };

export interface BoundedFetchOptions {
	allowedHosts: ReadonlySet<string>;
	limits?: Partial<BoundedFetchLimits>;
	headers?: Record<string, string>;
	/** Outer cancellation (e.g. the producer's run budget). */
	signal?: AbortSignal;
	fetchImpl?: typeof fetch;
}

const fail = (reason: BoundedFetchFailure, detail: string): BoundedFetchResult => ({
	ok: false,
	reason,
	detail
});

/**
 * Read a byte stream up to maxBytes, racing every read against `signal` so a
 * stream that ignores cancellation still cannot outlive the deadline.
 * Returns null when the stream exceeds maxBytes. Rejects on abort.
 */
export async function readStreamCapped(
	stream: ReadableStream<Uint8Array>,
	maxBytes: number,
	signal: AbortSignal
): Promise<{ text: string; bytes: number } | null> {
	const reader = stream.getReader();
	const chunks: Uint8Array[] = [];
	let bytes = 0;
	try {
		for (;;) {
			const { done, value } = await abortable(reader.read(), signal);
			if (done) break;
			bytes += value.byteLength;
			if (bytes > maxBytes) return null;
			chunks.push(value);
		}
	} finally {
		reader.cancel().catch(() => {});
	}
	const merged = new Uint8Array(bytes);
	let offset = 0;
	for (const chunk of chunks) {
		merged.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return { text: new TextDecoder('utf-8').decode(merged), bytes };
}

function checkUrl(
	raw: string,
	allowedHosts: ReadonlySet<string>,
	onDisallowed: 'host-not-allowed' | 'redirect-not-allowed'
): BoundedFetchResult | URL {
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		return fail('invalid-url', 'unparseable URL');
	}
	if (url.protocol !== 'https:' || !allowedHosts.has(url.hostname)) {
		return fail(onDisallowed, `${url.protocol}//${url.hostname} is not allowlisted`);
	}
	return url;
}

export async function boundedFetch(
	url: string,
	options: BoundedFetchOptions
): Promise<BoundedFetchResult> {
	const limits = { ...FEED_FETCH_LIMITS, ...options.limits };
	const fetchImpl = options.fetchImpl ?? fetch;
	const controller = new AbortController();
	const onOuterAbort = () => controller.abort();
	if (options.signal?.aborted) controller.abort();
	options.signal?.addEventListener('abort', onOuterAbort, { once: true });
	const timer = setTimeout(() => controller.abort(), limits.deadlineMs);

	try {
		let current = url;
		for (let hop = 0; ; hop++) {
			const checked = checkUrl(
				current,
				options.allowedHosts,
				hop === 0 ? 'host-not-allowed' : 'redirect-not-allowed'
			);
			if (!(checked instanceof URL)) return checked;

			const response = await abortable(
				fetchImpl(checked, {
					headers: options.headers,
					redirect: 'manual',
					signal: controller.signal
				}),
				controller.signal
			);

			const location = response.headers.get('location');
			if (response.status >= 300 && response.status < 400 && location) {
				response.body?.cancel().catch(() => {});
				if (hop >= limits.maxRedirects) {
					return fail('too-many-redirects', `more than ${limits.maxRedirects} redirects`);
				}
				current = new URL(location, checked).toString();
				continue;
			}
			if (!response.ok) {
				response.body?.cancel().catch(() => {});
				return fail('http-status', `HTTP ${response.status}`);
			}
			const declared = Number(response.headers.get('content-length'));
			if (Number.isFinite(declared) && declared > limits.maxBytes) {
				response.body?.cancel().catch(() => {});
				return fail('too-large', `content-length ${declared} > ${limits.maxBytes}`);
			}
			const body = response.body
				? await readStreamCapped(response.body, limits.maxBytes, controller.signal)
				: { text: '', bytes: 0 };
			if (body === null) return fail('too-large', `body exceeded ${limits.maxBytes} bytes`);
			return { ok: true, text: body.text, finalUrl: checked.toString(), bytes: body.bytes };
		}
	} catch (err) {
		if (controller.signal.aborted) {
			return fail(
				'timeout',
				options.signal?.aborted
					? 'run budget exhausted'
					: `deadline ${limits.deadlineMs}ms exceeded`
			);
		}
		return fail('network', err instanceof Error ? err.message : String(err));
	} finally {
		clearTimeout(timer);
		options.signal?.removeEventListener('abort', onOuterAbort);
	}
}
