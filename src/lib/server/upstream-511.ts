/**
 * Reads from api.511.org, shared by the routes that hold our one 511 key (traffic/corridors,
 * traffic/events, transit). 511 limits a key to 60 requests an hour (`RateLimit-Limit: 60`) and
 * answers 429 past it, so every attempt logs one line: the status, `Retry-After` and the budget
 * left; and after a 429 no route asks again until its `Retry-After` has passed.
 *
 * The hourly budget in attempts, worst case: demand never stops, viewers in one CDN region, any
 * outcome. The CDN window bounds how often a success is read; each route's memo holds failures
 * (sent no-store) as long, and collapses concurrent cold requests into one read.
 *   traffic/corridors  CDN 300 s / failure memo 300 s, ≤ 2 attempts (one retry) → 12 × 2 = 24
 *   transit            5 agencies × 15 min, success or failure, no retry      →  5 × 4 = 20
 *   traffic/events     10 min, success or failure, no retry (legacy map)      →          6
 *   total                                                                    → 50 of 60: 10 spare
 * Corridors read one page (limit=500; 511 lists ~100 events): a second page would add 24.
 * Before TRAFFIC1 one open v2 page alone spent ~72 an hour (corridors 12 + transit 5 × 12).
 */

const ORIGIN = 'https://api.511.org';
const REFUSAL_DEFAULT_S = 60;
const REFUSAL_MAX_S = 3600;

export interface Read511 {
	/** 511's HTTP status; null when no response arrived (network error, deadline). */
	status: number | null;
	retryAfter: string | null;
	/** 511's `RateLimit-Remaining`: requests left this hour on the key. */
	remaining: string | null;
}

/** A 511 answer: its status, and its JSON body (null when none arrived or it didn't parse). */
export interface Got511 extends Read511 {
	body: unknown;
}

export type PageRead =
	| ({ ok: true; events: unknown[]; next: string | null } & Omit<Read511, 'retryAfter'>)
	| ({ ok: false } & Read511);

const isRecord = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v);

/** One line per attempt, never the URL (it carries the key). Failures log at warn. */
export function log511Read(route: string, read: Read511, ms: number, ok = isOk(read.status)): void {
	const { status, retryAfter, remaining } = read;
	const line = JSON.stringify({ evt: '511-read', route, status, retryAfter, remaining, ms });
	if (ok) console.info(line);
	else console.warn(line);
}

const isOk = (status: number | null) => status !== null && status >= 200 && status < 300;

/** Key-wide (per instance): after a 429, no route reads 511 until this time. */
let refusedUntil = 0;

/**
 * One GET from 511, its body read inside `signal`, logged under `route`. While a 429's
 * `Retry-After` runs, every route gets that refusal back without asking. With `retry`, a 5xx or
 * a transport failure gets one more attempt while `signal` lives; a 429 never does (another
 * attempt only spends more of the hour), nor does a body that arrived but doesn't parse.
 */
export async function get511(
	path: string,
	key: string,
	signal: AbortSignal,
	route: string,
	{ retry = false } = {}
): Promise<Got511> {
	const wait = refusedUntil - Date.now();
	if (wait > 0)
		return { status: 429, retryAfter: String(Math.ceil(wait / 1000)), remaining: null, body: null };
	const first = await attempt(path, key, signal, route);
	if (!retry || !first.transient || signal.aborted) return first.got;
	return (await attempt(path, key, signal, route)).got;
}

async function attempt(path: string, key: string, signal: AbortSignal, route: string) {
	const url = new URL(path, ORIGIN);
	url.searchParams.set('api_key', key); // next_url already carries it; set, never append
	const started = Date.now();
	let read: Read511 = { status: null, retryAfter: null, remaining: null };
	let body: unknown = null;
	let transient = true;
	try {
		const response = await fetch(url.toString(), {
			headers: { Accept: 'application/json' },
			signal
		});
		read = read511Of(response);
		if (response.status === 429) refuse(read.retryAfter);
		const raw = await response.text(); // the same signal aborts a stalled body
		transient = response.status >= 500;
		if (response.ok) body = parse(raw);
	} catch {
		// no response, or its body never arrived: transient
	}
	log511Read(route, read, Date.now() - started, isOk(read.status) && body !== null);
	return { got: { ...read, body }, transient };
}

function parse(raw: string): unknown {
	try {
		return JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
	} catch {
		return null;
	}
}

function refuse(retryAfter: string | null) {
	const s = Number(retryAfter);
	const wait = Number.isFinite(s) && s > 0 ? Math.min(s, REFUSAL_MAX_S) : REFUSAL_DEFAULT_S;
	refusedUntil = Math.max(refusedUntil, Date.now() + wait * 1000);
}

/** What a response says about the read, before its body. */
export const read511Of = (response: Response): Read511 => ({
	status: response.status,
	retryAfter: response.headers.get('retry-after'),
	remaining: response.headers.get('ratelimit-remaining')
});

/**
 * One page of 511's traffic event list, with corridors' one retry. A failure keeps 511's status
 * and `Retry-After`; a page that doesn't parse, or whose pagination is anything but 511's own,
 * fails with its 200.
 */
export async function readPage(
	path: string,
	key: string,
	signal: AbortSignal,
	route: string
): Promise<PageRead> {
	const { body, ...read } = await get511(path, key, signal, route, { retry: true });
	const fail = { ok: false as const, ...read };
	if (!isRecord(body) || !Array.isArray(body.events)) return fail;
	if (body.pagination !== undefined && !isRecord(body.pagination)) return fail;
	const next = isRecord(body.pagination) ? (body.pagination.next_url ?? null) : null;
	if (next !== null && (typeof next !== 'string' || !next.startsWith('/traffic/events?')))
		return fail;
	return { ok: true, status: read.status, remaining: read.remaining, events: body.events, next };
}

/**
 * A module-level memo: each key's outcome (success or failure, as the caller shapes it) is
 * served for its window, `ttl` (or `ttl(outcome)`) from the start of its read, and concurrent
 * cold calls share that one read. It holds what was read, with the read's own time, so nothing
 * old is served as fresh. A read that throws is dropped. Per instance: a cold one starts empty.
 */
export function memo511<T>(
	ttl: number | ((outcome: T) => number),
	now: () => number = () => Date.now()
) {
	const held = new Map<string, { at: number; ttl: number; value: Promise<T> }>();
	return (key: string, read: () => Promise<T>): Promise<T> => {
		const hit = held.get(key);
		if (hit && now() - hit.at < hit.ttl) return hit.value;
		const entry = { at: now(), ttl: Infinity, value: read() }; // in flight: shared
		held.set(key, entry);
		entry.value.then(
			(outcome) => (entry.ttl = typeof ttl === 'number' ? ttl : ttl(outcome)),
			() => held.get(key) === entry && held.delete(key)
		);
		return entry.value;
	};
}
