/**
 * Reads from api.511.org, shared by the routes that hold our one 511 key (traffic/corridors,
 * traffic/events, transit). 511 limits a key to 60 requests an hour (`RateLimit-Limit: 60`) and
 * answers 429 past it, so every read logs one line: the status, `Retry-After` and the budget left.
 */

const ORIGIN = 'https://api.511.org';

export interface Read511 {
	/** 511's HTTP status; null when no response arrived (network error, deadline). */
	status: number | null;
	retryAfter: string | null;
	/** 511's `RateLimit-Remaining`: requests left this hour on the key. */
	remaining: string | null;
}

export type PageRead =
	| ({ ok: true; events: unknown[]; next: string | null } & Omit<Read511, 'retryAfter'>)
	| ({ ok: false } & Read511);

const isRecord = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v);

/** One line per upstream read, never the URL (it carries the key). Failures log at warn. */
export function log511Read(route: string, read: Read511 | PageRead, ms: number): void {
	const { status, remaining } = read;
	const retryAfter = 'retryAfter' in read ? read.retryAfter : null;
	const line = JSON.stringify({ evt: '511-read', route, status, retryAfter, remaining, ms });
	const ok = 'ok' in read ? read.ok : status !== null && status < 400;
	if (ok) console.info(line);
	else console.warn(line);
}

/** What a response says about the read, before its body. */
export const read511Of = (response: Response): Read511 => ({
	status: response.status,
	retryAfter: response.headers.get('retry-after'),
	remaining: response.headers.get('ratelimit-remaining')
});

/**
 * One page of 511's traffic event list. A failure keeps 511's status and `Retry-After`; a page
 * that doesn't parse, or whose pagination is anything but 511's own, fails with its 200.
 */
export async function readPage(path: string, key: string, signal: AbortSignal): Promise<PageRead> {
	const url = new URL(path, ORIGIN);
	url.searchParams.set('api_key', key); // next_url already carries it; set, never append
	let read: Read511 = { status: null, retryAfter: null, remaining: null };
	try {
		const response = await fetch(url.toString(), {
			headers: { Accept: 'application/json' },
			signal
		});
		read = read511Of(response);
		if (!response.ok) return { ok: false, ...read };
		const raw = await response.text(); // the same signal aborts a stalled body
		const body: unknown = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
		if (!isRecord(body) || !Array.isArray(body.events)) return { ok: false, ...read };
		if (body.pagination !== undefined && !isRecord(body.pagination)) return { ok: false, ...read };
		const next = isRecord(body.pagination) ? (body.pagination.next_url ?? null) : null;
		if (next !== null && (typeof next !== 'string' || !next.startsWith('/traffic/events?')))
			return { ok: false, ...read };
		return { ok: true, status: read.status, remaining: read.remaining, events: body.events, next };
	} catch {
		return { ok: false, ...read };
	}
}
