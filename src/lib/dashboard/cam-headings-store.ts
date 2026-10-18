/**
 * The cameras' last reported headings (MAPX4), read while something on the page needs them:
 * the map's Cameras layer, an open camera detail, the cam tiles. Holders share one read every
 * 30 s; with none, nothing is read. A failed read drops the headings: a kept one would be a guess.
 */
import { writable, type Readable } from 'svelte/store';
import type { HeadingRead } from './cam-heading';

export const HEADING_REFRESH_MS = 30_000;

export interface HeadingsState {
	state: 'loading' | 'ok' | 'unavailable';
	read: HeadingRead | null;
}

export interface CamHeadings extends Readable<HeadingsState> {
	/** Keep the headings fresh until the returned release is called. */
	hold(): () => void;
}

export async function fetchCamHeadings(
	signal: AbortSignal,
	fetcher: typeof fetch = fetch
): Promise<HeadingRead> {
	const res = await fetcher('/api/cams/heading', { signal });
	const body = await res.json();
	if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
	if (typeof body?.headingAt !== 'number' || !Array.isArray(body.cams))
		throw new Error('Unexpected heading response');
	return body as HeadingRead;
}

export function createCamHeadings(deps: {
	load: (signal: AbortSignal) => Promise<HeadingRead>;
	signal: AbortSignal;
}): CamHeadings {
	const store = writable<HeadingsState>({ state: 'loading', read: null });
	let holders = 0;
	let timer: ReturnType<typeof setInterval> | null = null;
	let lastReadAt = -Infinity;

	async function read() {
		if (deps.signal.aborted) return;
		lastReadAt = Date.now();
		try {
			const value = await deps.load(deps.signal);
			if (!deps.signal.aborted) store.set({ state: 'ok', read: value });
		} catch {
			if (!deps.signal.aborted) store.set({ state: 'unavailable', read: null });
		}
	}
	function stop() {
		if (timer) clearInterval(timer);
		timer = null;
	}
	deps.signal.addEventListener('abort', stop, { once: true });

	return {
		subscribe: store.subscribe,
		hold() {
			holders += 1;
			if (holders === 1 && !deps.signal.aborted) {
				if (Date.now() - lastReadAt >= HEADING_REFRESH_MS) void read();
				timer = setInterval(() => void read(), HEADING_REFRESH_MS);
			}
			let held = true;
			return () => {
				if (!held) return;
				held = false;
				holders -= 1;
				if (holders === 0) stop();
			};
		}
	};
}
